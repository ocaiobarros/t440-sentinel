import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // User client to validate auth
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Admin client for inserts
    const adminClient = createClient(supabaseUrl, supabaseKey);

    // Get user tenant
    const { data: tenantId } = await adminClient.rpc("get_user_tenant_id", { p_user_id: user.id });
    if (!tenantId) {
      return new Response(JSON.stringify({ error: "Tenant not found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse body
    const body = await req.json();
    const { csv_content, month_reference } = body as {
      csv_content: string;
      month_reference: string; // e.g. '2026-01-01'
    };

    if (!csv_content || !month_reference) {
      return new Response(
        JSON.stringify({ error: "csv_content and month_reference are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Parse CSV
    const lines = csv_content.trim().split("\n");
    if (lines.length < 2) {
      return new Response(
        JSON.stringify({ error: "CSV must have header + at least 1 data row" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const rawHeaders = lines[0].split(";").map((h) => h.trim());
    const headers = rawHeaders.map((h) => h.toLowerCase());
    const normalizedHeaders = rawHeaders.map(normalizeHeader);

    // Detect column indexes — flexible mapping
    const dateIdx = findHeaderIndex(normalizedHeaders, ["data", "date", "transaction date", "data transacao"]);
    const typeIdx = findHeaderIndex(normalizedHeaders, ["tipo", "type", "natureza"]);
    const descIdx = findHeaderIndex(normalizedHeaders, ["descricao", "description", "desc", "descricao"]);
    const catIdx = findHeaderIndex(normalizedHeaders, ["categoria", "category", "cat"]);

    // Scenario columns — can be mixed (Previsto + Realizado in same row)
    const previstoIdx = findHeaderIndex(normalizedHeaders, ["previsto", "forecast", "planned", "valor previsto"]);
    const realizadoIdx = findHeaderIndex(normalizedHeaders, ["realizado", "actual", "realized", "valor realizado"]);

    // Or single amount + scenario column
    const amountIdx = findHeaderIndex(normalizedHeaders, ["valor", "amount", "value"]);
    const scenarioIdx = findHeaderIndex(normalizedHeaders, ["cenario", "scenario", "cenario"]);

    // Wide-sheet layout support (e.g. "Previsto Jan/2026; Soma de PAGAR; Soma de RECEBER; ... ; Realizado Jan/2026; Soma de Pago; Soma de Recebido")
    const previstoDateIdx = findHeaderIndex(normalizedHeaders, [/^previsto\b/, /data previsto/]);
    const realizadoDateIdx = findHeaderIndex(normalizedHeaders, [/^realizado\b/, /data realizado/]);
    const previstoPagarIdx = findHeaderIndex(normalizedHeaders, [/soma de pagar/, /previsto.*pagar/, /a pagar/]);
    const previstoReceberIdx = findHeaderIndex(normalizedHeaders, [/soma de receber/, /previsto.*receb/, /a receber/]);
    const realizadoPagarIdx = findHeaderIndex(normalizedHeaders, [/soma de pago/, /realizado.*pag/, /\bpago\b/]);
    const realizadoReceberIdx = findHeaderIndex(normalizedHeaders, [/soma de recebido/, /realizado.*receb/, /\brecebido\b/]);

    const hasDualTypeSplitColumns =
      previstoPagarIdx !== -1 ||
      previstoReceberIdx !== -1 ||
      realizadoPagarIdx !== -1 ||
      realizadoReceberIdx !== -1;

    const hasSplitColumns = hasDualTypeSplitColumns || previstoIdx !== -1 || realizadoIdx !== -1;

    const rows: Array<{
      tenant_id: string;
      transaction_date: string;
      scenario: string;
      type: string;
      amount: number;
      month_reference: string;
      description: string;
      category: string;
      created_by: string;
    }> = [];

    const warnings: Array<{ line: number; message: string }> = [];
    let skippedEmpty = 0;

    for (let i = 1; i < lines.length; i++) {
      const lineNum = i + 1; // human-readable line number
      const cols = lines[i].split(";").map((c) => c.trim());

      // Skip truly empty lines
      if (cols.length < 2 || cols.every((c) => c === "")) {
        skippedEmpty++;
        continue;
      }

      // Skip summary lines like "Total Geral"
      if (cols.some((c, idx) => idx <= 6 && normalizeHeader(c).startsWith("total geral"))) {
        continue;
      }

      try {
        const txDateRaw = dateIdx !== -1 ? cols[dateIdx] : month_reference;
        const defaultTxDate = normalizeDate(txDateRaw);

        // Validate date format when it will be used as fallback
        if (!/^\d{4}-\d{2}-\d{2}$/.test(defaultTxDate)) {
          warnings.push({ line: lineNum, message: `Formato de data inválido: "${txDateRaw}"` });
          continue;
        }

        const desc = descIdx !== -1 ? cols[descIdx] : "";
        const cat = catIdx !== -1 ? cols[catIdx] : "";

        if (hasDualTypeSplitColumns) {
          let lineHasValue = false;

          const mappedColumns: Array<{
            amountIdx: number;
            dateIdx: number;
            scenario: "PREVISTO" | "REALIZADO";
            type: "PAGAR" | "RECEBER";
            label: string;
          }> = [
            { amountIdx: previstoPagarIdx, dateIdx: previstoDateIdx, scenario: "PREVISTO", type: "PAGAR", label: "previsto/pagar" },
            { amountIdx: previstoReceberIdx, dateIdx: previstoDateIdx, scenario: "PREVISTO", type: "RECEBER", label: "previsto/receber" },
            { amountIdx: realizadoPagarIdx, dateIdx: realizadoDateIdx, scenario: "REALIZADO", type: "PAGAR", label: "realizado/pagar" },
            { amountIdx: realizadoReceberIdx, dateIdx: realizadoDateIdx, scenario: "REALIZADO", type: "RECEBER", label: "realizado/receber" },
          ];

          for (const colMap of mappedColumns) {
            if (colMap.amountIdx === -1) continue;

            const rawVal = cols[colMap.amountIdx] ?? "";
            const val = parseAmount(rawVal);

            if (val === null && rawVal && rawVal !== "" && rawVal !== "-") {
              warnings.push({ line: lineNum, message: `Valor inválido (${colMap.label}): "${rawVal}"` });
              continue;
            }

            if (val === null || val === 0) continue;

            const rowDateRaw = colMap.dateIdx !== -1 ? cols[colMap.dateIdx] : defaultTxDate;
            const rowDate = normalizeDate(rowDateRaw);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(rowDate)) {
              warnings.push({ line: lineNum, message: `Data inválida (${colMap.label}): "${rowDateRaw}"` });
              continue;
            }

            lineHasValue = true;
            rows.push({
              tenant_id: tenantId,
              transaction_date: rowDate,
              scenario: colMap.scenario,
              type: colMap.type,
              amount: val,
              month_reference,
              description: desc,
              category: cat,
              created_by: user.id,
            });
          }

          if (!lineHasValue) {
            warnings.push({ line: lineNum, message: "Linha sem valores numéricos válidos" });
          }

          continue;
        }

        const txType = typeIdx !== -1 ? cols[typeIdx].toUpperCase() : "PAGAR";

        // Normalize type
        const normalizedType = txType.includes("RECEBER") || txType.includes("RECEITA") || txType.includes("INCOME")
          ? "RECEBER"
          : "PAGAR";

        if (hasSplitColumns) {
          let lineHasValue = false;
          if (previstoIdx !== -1) {
            const rawVal = cols[previstoIdx];
            const val = parseAmount(rawVal);
            if (val === null && rawVal && rawVal !== "" && rawVal !== "-") {
              warnings.push({ line: lineNum, message: `Valor previsto inválido: "${rawVal}"` });
            } else if (val !== null && val !== 0) {
              lineHasValue = true;
              rows.push({
                tenant_id: tenantId,
                transaction_date: defaultTxDate,
                scenario: "PREVISTO",
                type: normalizedType,
                amount: val,
                month_reference,
                description: desc,
                category: cat,
                created_by: user.id,
              });
            }
          }
          if (realizadoIdx !== -1) {
            const rawVal = cols[realizadoIdx];
            const val = parseAmount(rawVal);
            if (val === null && rawVal && rawVal !== "" && rawVal !== "-") {
              warnings.push({ line: lineNum, message: `Valor realizado inválido: "${rawVal}"` });
            } else if (val !== null && val !== 0) {
              lineHasValue = true;
              rows.push({
                tenant_id: tenantId,
                transaction_date: defaultTxDate,
                scenario: "REALIZADO",
                type: normalizedType,
                amount: val,
                month_reference,
                description: desc,
                category: cat,
                created_by: user.id,
              });
            }
          }
          if (!lineHasValue) {
            warnings.push({ line: lineNum, message: "Linha sem valores numéricos válidos (previsto/realizado)" });
          }
        } else {
          const rawVal = amountIdx !== -1 ? cols[amountIdx] : "";
          const val = parseAmount(rawVal);
          if (val === null && rawVal && rawVal !== "" && rawVal !== "-") {
            warnings.push({ line: lineNum, message: `Valor inválido: "${rawVal}"` });
            continue;
          }
          if (val === null || val === 0) {
            warnings.push({ line: lineNum, message: "Valor zerado ou vazio — linha ignorada" });
            continue;
          }

          let scenario = "PREVISTO";
          if (scenarioIdx !== -1) {
            const raw = cols[scenarioIdx].toUpperCase();
            scenario = raw.includes("REAL") ? "REALIZADO" : "PREVISTO";
          }

          rows.push({
            tenant_id: tenantId,
            transaction_date: defaultTxDate,
            scenario,
            type: normalizedType,
            amount: val,
            month_reference,
            description: desc,
            category: cat,
            created_by: user.id,
          });
        }
      } catch (lineErr) {
        warnings.push({ line: lineNum, message: `Erro inesperado: ${(lineErr as Error).message}` });
      }
    }

    if (rows.length === 0) {
      return new Response(
        JSON.stringify({
          error: "Nenhuma linha válida encontrada no CSV",
          parsed_headers: headers,
          warnings: warnings.slice(0, 50),
          skipped_empty: skippedEmpty,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Batch insert (chunks of 500)
    let inserted = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error: insertErr } = await adminClient.from("financial_transactions").insert(chunk);
      if (insertErr) {
        return new Response(
          JSON.stringify({
            error: `Falha no batch ${Math.floor(i / 500) + 1}: ${insertErr.message}`,
            inserted_so_far: inserted,
            warnings: warnings.slice(0, 50),
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      inserted += chunk.length;
    }

    return new Response(
      JSON.stringify({
        success: true,
        rows_inserted: inserted,
        csv_lines_parsed: lines.length - 1,
        split_mode: hasSplitColumns,
        skipped_empty: skippedEmpty,
        warnings_count: warnings.length,
        warnings: warnings.slice(0, 100), // cap at 100 to avoid huge payloads
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

/** Parse BR/PT amount format: "1.234,56" or "1234.56" */
function parseAmount(raw: string): number | null {
  if (!raw) return null;
  let cleaned = raw.replace(/\s/g, "").replace("R$", "").replace("€", "").replace("$", "");
  // Detect BR format (comma as decimal): "1.234,56"
  if (cleaned.includes(",") && cleaned.indexOf(",") > cleaned.lastIndexOf(".")) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (cleaned.includes(",") && !cleaned.includes(".")) {
    cleaned = cleaned.replace(",", ".");
  }
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : Math.round(n * 100) / 100;
}

/** Normalize date strings: dd/mm/yyyy → yyyy-mm-dd */
function normalizeDate(raw: string): string {
  if (!raw) return new Date().toISOString().slice(0, 10);
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  // dd/mm/yyyy or dd-mm-yyyy
  const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return raw;
}

function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function findHeaderIndex(headers: string[], patterns: Array<string | RegExp>): number {
  return headers.findIndex((header) => {
    return patterns.some((pattern) => {
      if (typeof pattern === "string") {
        return header === pattern || header.includes(pattern);
      }
      return pattern.test(header);
    });
  });
}
