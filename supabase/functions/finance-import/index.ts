import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

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

    const adminClient = createClient(supabaseUrl, supabaseKey);

    const { data: tenantId } = await adminClient.rpc("get_user_tenant_id", { p_user_id: user.id });
    if (!tenantId) {
      return new Response(JSON.stringify({ error: "Tenant not found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { csv_content, month_reference, file_content_base64, file_type } = body as {
      csv_content?: string;
      month_reference?: string;
      file_content_base64?: string;
      file_type?: string;
    };

    // ── XLSX multi-sheet mode ──
    if (file_content_base64 && file_type === "xlsx") {
      const binary = Uint8Array.from(atob(file_content_base64), (c) => c.charCodeAt(0));
      const workbook = XLSX.read(binary, { type: "array", cellDates: true });

      const allRows: any[] = [];
      const allWarnings: Array<{ sheet: string; line: number; message: string }> = [];
      let totalInserted = 0;

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const csvText = XLSX.utils.sheet_to_csv(sheet, { FS: ";", RS: "\n" });
        const lines = csvText.trim().split("\n");
        if (lines.length < 2) continue;

        // Detect month from header row (e.g. "Previsto Jan/2026" or "Previsto Fev/2026")
        const headerLine = lines[0];
        const detectedMonth = detectMonthFromHeader(headerLine);
        if (!detectedMonth) {
          allWarnings.push({ sheet: sheetName, line: 1, message: `Não foi possível detectar o mês no cabeçalho: "${headerLine.slice(0, 80)}"` });
          continue;
        }

        const { rows, warnings } = parseCSVLines(lines, detectedMonth, tenantId, user.id);
        for (const w of warnings) {
          allWarnings.push({ sheet: sheetName, ...w });
        }
        allRows.push(...rows);
      }

      if (allRows.length === 0) {
        return new Response(
          JSON.stringify({
            error: "Nenhuma linha válida encontrada no XLSX",
            warnings: allWarnings.slice(0, 100),
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Delete existing data for detected months before re-import
      const uniqueMonths = [...new Set(allRows.map((r) => r.month_reference))];
      for (const mo of uniqueMonths) {
        await adminClient
          .from("financial_transactions")
          .delete()
          .eq("tenant_id", tenantId)
          .eq("month_reference", mo);
      }

      // Batch insert
      for (let i = 0; i < allRows.length; i += 500) {
        const chunk = allRows.slice(i, i + 500);
        const { error: insertErr } = await adminClient.from("financial_transactions").insert(chunk);
        if (insertErr) {
          return new Response(
            JSON.stringify({
              error: `Falha no batch ${Math.floor(i / 500) + 1}: ${insertErr.message}`,
              inserted_so_far: totalInserted,
              warnings: allWarnings.slice(0, 100),
            }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        totalInserted += chunk.length;
      }

      return new Response(
        JSON.stringify({
          success: true,
          rows_inserted: totalInserted,
          months_detected: uniqueMonths,
          sheets_processed: workbook.SheetNames.length,
          warnings_count: allWarnings.length,
          warnings: allWarnings.slice(0, 100),
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Legacy CSV mode ──
    if (!csv_content || !month_reference) {
      return new Response(
        JSON.stringify({ error: "csv_content and month_reference are required (or file_content_base64 + file_type=xlsx)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const lines = csv_content.trim().split("\n");
    if (lines.length < 2) {
      return new Response(
        JSON.stringify({ error: "CSV must have header + at least 1 data row" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { rows, warnings } = parseCSVLines(lines, month_reference, tenantId, user.id);

    if (rows.length === 0) {
      return new Response(
        JSON.stringify({
          error: "Nenhuma linha válida encontrada no CSV",
          warnings: warnings.slice(0, 50),
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

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
        warnings_count: warnings.length,
        warnings: warnings.slice(0, 100),
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

// ── Month detection from header ──
const MONTH_MAP: Record<string, string> = {
  jan: "01", janeiro: "01",
  fev: "02", fevereiro: "02", feb: "02",
  mar: "03", marco: "03", março: "03",
  abr: "04", abril: "04", apr: "04",
  mai: "05", maio: "05", may: "05",
  jun: "06", junho: "06",
  jul: "07", julho: "07",
  ago: "08", agosto: "08", aug: "08",
  set: "09", setembro: "09", sep: "09",
  out: "10", outubro: "10", oct: "10",
  nov: "11", novembro: "11",
  dez: "12", dezembro: "12", dec: "12",
};

function detectMonthFromHeader(headerLine: string): string | null {
  // Match patterns like "Previsto Jan/2026", "Realizado Fev/2026", "Previsto Mar/2026"
  const norm = headerLine
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const match = norm.match(/(?:previsto|realizado)\s+(\w+)\s*[\/\-]\s*(\d{4})/);
  if (match) {
    const monthKey = match[1];
    const year = match[2];
    const mm = MONTH_MAP[monthKey];
    if (mm) return `${year}-${mm}-01`;
  }

  // Fallback: try to find any "month/year" pattern
  for (const [key, mm] of Object.entries(MONTH_MAP)) {
    const re = new RegExp(`\\b${key}\\s*[/\\-]\\s*(\\d{4})\\b`);
    const m = norm.match(re);
    if (m) return `${m[1]}-${mm}-01`;
  }

  return null;
}

// ── CSV parsing logic (shared between CSV and XLSX modes) ──
function parseCSVLines(
  lines: string[],
  monthReference: string,
  tenantId: string,
  userId: string,
): { rows: any[]; warnings: Array<{ line: number; message: string }> } {
  const rawHeaders = lines[0].split(";").map((h) => h.trim());
  const normalizedHeaders = rawHeaders.map(normalizeHeader);

  const dateIdx = findHeaderIndex(normalizedHeaders, ["data", "date", "transaction date", "data transacao"]);
  const descIdx = findHeaderIndex(normalizedHeaders, ["descricao", "description", "desc"]);
  const catIdx = findHeaderIndex(normalizedHeaders, ["categoria", "category", "cat"]);
  const typeIdx = findHeaderIndex(normalizedHeaders, ["tipo", "type", "natureza"]);

  const previstoIdx = findHeaderIndex(normalizedHeaders, ["previsto", "forecast", "planned", "valor previsto"]);
  const realizadoIdx = findHeaderIndex(normalizedHeaders, ["realizado", "actual", "realized", "valor realizado"]);
  const amountIdx = findHeaderIndex(normalizedHeaders, ["valor", "amount", "value"]);
  const scenarioIdx = findHeaderIndex(normalizedHeaders, ["cenario", "scenario"]);

  // Wide-sheet layout
  const previstoDateIdx = findHeaderIndex(normalizedHeaders, [/^previsto\b/, /data previsto/]);
  const realizadoDateIdx = findHeaderIndex(normalizedHeaders, [/^realizado\b/, /data realizado/]);
  const previstoPagarIdx = findHeaderIndex(normalizedHeaders, [/soma de pagar/, /previsto.*pagar/, /a pagar/]);
  const previstoReceberIdx = findHeaderIndex(normalizedHeaders, [/soma de receber/, /previsto.*receb/, /a receber/]);
  const realizadoPagarIdx = findHeaderIndex(normalizedHeaders, [/soma de pago/, /realizado.*pag/, /\bpago\b/]);
  const realizadoReceberIdx = findHeaderIndex(normalizedHeaders, [/soma de recebido/, /realizado.*receb/, /\brecebido\b/]);

  const hasDualTypeSplitColumns =
    previstoPagarIdx !== -1 || previstoReceberIdx !== -1 || realizadoPagarIdx !== -1 || realizadoReceberIdx !== -1;
  const hasSplitColumns = hasDualTypeSplitColumns || previstoIdx !== -1 || realizadoIdx !== -1;

  const rows: any[] = [];
  const warnings: Array<{ line: number; message: string }> = [];

  for (let i = 1; i < lines.length; i++) {
    const lineNum = i + 1;
    const cols = lines[i].split(";").map((c) => c.trim());

    if (cols.length < 2 || cols.every((c) => c === "")) continue;
    if (cols.some((c, idx) => idx <= 6 && normalizeHeader(c).startsWith("total geral"))) continue;

    try {
      const txDateRaw = dateIdx !== -1 ? cols[dateIdx] : monthReference;
      const defaultTxDate = normalizeDate(txDateRaw);

      if (!/^\d{4}-\d{2}-\d{2}$/.test(defaultTxDate)) {
        warnings.push({ line: lineNum, message: `Data inválida: "${txDateRaw}"` });
        continue;
      }

      const desc = descIdx !== -1 ? cols[descIdx] : "";
      const cat = catIdx !== -1 ? cols[catIdx] : "";

      if (hasDualTypeSplitColumns) {
        let lineHasValue = false;
        const mappedColumns = [
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
            month_reference: monthReference,
            description: desc,
            category: cat,
            created_by: userId,
          });
        }

        if (!lineHasValue) {
          warnings.push({ line: lineNum, message: "Linha sem valores numéricos válidos" });
        }
        continue;
      }

      const txType = typeIdx !== -1 ? cols[typeIdx].toUpperCase() : "PAGAR";
      const normalizedType = txType.includes("RECEBER") || txType.includes("RECEITA") || txType.includes("INCOME") ? "RECEBER" : "PAGAR";

      if (hasSplitColumns) {
        let lineHasValue = false;
        if (previstoIdx !== -1) {
          const rawVal = cols[previstoIdx];
          const val = parseAmount(rawVal);
          if (val !== null && val !== 0) {
            lineHasValue = true;
            rows.push({
              tenant_id: tenantId, transaction_date: defaultTxDate, scenario: "PREVISTO",
              type: normalizedType, amount: val, month_reference: monthReference,
              description: desc, category: cat, created_by: userId,
            });
          }
        }
        if (realizadoIdx !== -1) {
          const rawVal = cols[realizadoIdx];
          const val = parseAmount(rawVal);
          if (val !== null && val !== 0) {
            lineHasValue = true;
            rows.push({
              tenant_id: tenantId, transaction_date: defaultTxDate, scenario: "REALIZADO",
              type: normalizedType, amount: val, month_reference: monthReference,
              description: desc, category: cat, created_by: userId,
            });
          }
        }
        if (!lineHasValue) {
          warnings.push({ line: lineNum, message: "Linha sem valores numéricos válidos" });
        }
      } else {
        const rawVal = amountIdx !== -1 ? cols[amountIdx] : "";
        const val = parseAmount(rawVal);
        if (val === null || val === 0) {
          warnings.push({ line: lineNum, message: "Valor zerado ou vazio" });
          continue;
        }
        let scenario = "PREVISTO";
        if (scenarioIdx !== -1) {
          const raw = cols[scenarioIdx].toUpperCase();
          scenario = raw.includes("REAL") ? "REALIZADO" : "PREVISTO";
        }
        rows.push({
          tenant_id: tenantId, transaction_date: defaultTxDate, scenario,
          type: normalizedType, amount: val, month_reference: monthReference,
          description: desc, category: cat, created_by: userId,
        });
      }
    } catch (lineErr) {
      warnings.push({ line: lineNum, message: `Erro: ${(lineErr as Error).message}` });
    }
  }

  return { rows, warnings };
}

function parseAmount(raw: string): number | null {
  if (!raw) return null;
  let cleaned = raw.replace(/\s/g, "").replace("R$", "").replace("€", "").replace("$", "");
  
  // Detect format:
  // BR: 1.234.567,89 → comma after last dot → strip dots, comma→dot
  // US: 1,234,567.89 → dot after last comma → strip commas
  // Simple comma decimal: 1234,56 → no dot → comma→dot
  // Simple dot decimal: 1234.56 → no comma → keep as-is
  
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      // BR format: 1.234,56 → strip dots, comma→dot
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      // US format: 1,234.56 → strip commas
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (lastComma > -1 && lastDot === -1) {
    // Only comma: 1234,56 → comma→dot
    cleaned = cleaned.replace(",", ".");
  }
  // Only dot or no separator: keep as-is
  
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : Math.round(n * 100) / 100;
}

function normalizeDate(raw: string): string {
  if (!raw) return new Date().toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  // dd/mm/yyyy or dd-mm-yyyy
  const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  // m/d/yy (Excel short format from SheetJS)
  const m2 = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
  if (m2) {
    const yy = parseInt(m2[3]);
    const yyyy = yy < 50 ? 2000 + yy : 1900 + yy;
    return `${yyyy}-${m2[1].padStart(2, "0")}-${m2[2].padStart(2, "0")}`;
  }
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
      if (typeof pattern === "string") return header === pattern || header.includes(pattern);
      return pattern.test(header);
    });
  });
}
