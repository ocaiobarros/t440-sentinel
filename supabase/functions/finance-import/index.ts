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
    if (file_content_base64 && (file_type === "xlsx" || file_type === "xls")) {
      const binary = Uint8Array.from(atob(file_content_base64), (c) => c.charCodeAt(0));
      const workbook = XLSX.read(binary, { type: "array", cellDates: true });

      const allRows: any[] = [];
      const allWarnings: Array<{ sheet: string; line: number; message: string }> = [];
      let totalInserted = 0;

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        // Use sheet_to_json with header:1 for array-of-arrays with RAW values
        const jsonRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, rawNumbers: true, defval: null });

        if (jsonRows.length < 2) continue;

        // Find header row containing month reference
        const headerResult = findHeaderRow(jsonRows, sheetName);
        if (!headerResult) {
          allWarnings.push({
            sheet: sheetName,
            line: 1,
            message: `Não foi possível detectar cabeçalho/mês (primeiras células: "${JSON.stringify(jsonRows[0]?.slice(0, 6)).slice(0, 180)}")`,
          });
          continue;
        }

        const { headerRowIdx, dataStartRowIdx, monthReference, columnMap } = headerResult;
        console.log(`[finance-import] Sheet "${sheetName}" headerRow=${headerRowIdx} dataStart=${dataStartRowIdx} month=${monthReference} cols=${JSON.stringify(columnMap)}`);

        // Parse data rows
        const dataRows = jsonRows.slice(dataStartRowIdx);
        let sheetInserted = 0;

        for (let i = 0; i < dataRows.length; i++) {
          const row = dataRows[i];
          if (!row || row.every((c: any) => c === null || c === undefined || c === "")) continue;

          // Skip "Total Geral" rows
          const firstCell = String(row[0] ?? "").toLowerCase().trim();
          if (firstCell.includes("total geral") || firstCell.includes("total")) continue;

          const lineNum = dataStartRowIdx + i + 1; // 1-indexed for user display

          // Extract dates
          const prevDate = extractDate(row[columnMap.prevDateCol], monthReference);
          const realDate = extractDate(row[columnMap.realDateCol], monthReference);

          if (!prevDate && !realDate) {
            allWarnings.push({ sheet: sheetName, line: lineNum, message: `Data inválida em ambos os lados` });
            continue;
          }

          let lineHasValue = false;

          // Previsto PAGAR
          if (columnMap.prevPagarCol !== -1) {
            const val = extractNumber(row[columnMap.prevPagarCol]);
            if (val !== null && val > 0) {
              lineHasValue = true;
              allRows.push({
                tenant_id: tenantId, transaction_date: prevDate || realDate,
                scenario: "PREVISTO", type: "PAGAR", amount: val,
                month_reference: monthReference, description: "", category: "", created_by: user.id,
              });
            }
          }

          // Previsto RECEBER
          if (columnMap.prevReceberCol !== -1) {
            const val = extractNumber(row[columnMap.prevReceberCol]);
            if (val !== null && val > 0) {
              lineHasValue = true;
              allRows.push({
                tenant_id: tenantId, transaction_date: prevDate || realDate,
                scenario: "PREVISTO", type: "RECEBER", amount: val,
                month_reference: monthReference, description: "", category: "", created_by: user.id,
              });
            }
          }

          // Realizado PAGAR (Pago)
          if (columnMap.realPagarCol !== -1) {
            const val = extractNumber(row[columnMap.realPagarCol]);
            if (val !== null && val > 0) {
              lineHasValue = true;
              allRows.push({
                tenant_id: tenantId, transaction_date: realDate || prevDate,
                scenario: "REALIZADO", type: "PAGAR", amount: val,
                month_reference: monthReference, description: "", category: "", created_by: user.id,
              });
            }
          }

          // Realizado RECEBER (Recebido)
          if (columnMap.realReceberCol !== -1) {
            const val = extractNumber(row[columnMap.realReceberCol]);
            if (val !== null && val > 0) {
              lineHasValue = true;
              allRows.push({
                tenant_id: tenantId, transaction_date: realDate || prevDate,
                scenario: "REALIZADO", type: "RECEBER", amount: val,
                month_reference: monthReference, description: "", category: "", created_by: user.id,
              });
            }
          }

          if (!lineHasValue) {
            // Only warn for the first few
            if (allWarnings.length < 20) {
              const rawVals = [
                columnMap.prevPagarCol !== -1 ? row[columnMap.prevPagarCol] : "N/A",
                columnMap.prevReceberCol !== -1 ? row[columnMap.prevReceberCol] : "N/A",
                columnMap.realPagarCol !== -1 ? row[columnMap.realPagarCol] : "N/A",
                columnMap.realReceberCol !== -1 ? row[columnMap.realReceberCol] : "N/A",
              ];
              allWarnings.push({ sheet: sheetName, line: lineNum, message: `Sem valores válidos. Raw: [${rawVals.join(", ")}]` });
            }
          } else {
            sheetInserted++;
          }
        }

        // Log first 3 data rows for debug
        const sampleRows = dataRows.slice(0, 3).map((r: any[], idx: number) => ({
          row: dataStartRowIdx + idx + 1,
          cells: r?.slice(0, 8),
        }));
        console.log(`[finance-import] Sheet "${sheetName}" samples:`, JSON.stringify(sampleRows));
        console.log(`[finance-import] Sheet "${sheetName}" produced ${sheetInserted} valid transaction rows`);
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

    const lines = csv_content
      .split(/\r?\n/)
      .map((line) => line.replace(/\uFEFF/g, ""))
      .filter((line) => line.trim() !== "");
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

// ── XLSX Header & Column Detection (works on raw arrays from sheet_to_json) ──

const MONTH_MAP: Record<string, string> = {
  jan: "01", janeiro: "01",
  fev: "02", fevereiro: "02", feb: "02",
  mar: "03", marco: "03", "março": "03",
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

interface ColumnMap {
  prevDateCol: number;
  prevPagarCol: number;
  prevReceberCol: number;
  realDateCol: number;
  realPagarCol: number;
  realReceberCol: number;
}

function parseMonthReferenceFromText(value: any): string | null {
  if (value === null || value === undefined || value === "") return null;

  const normalized = String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  const match = normalized.match(/\b(jan(?:eiro)?|fev(?:ereiro)?|feb|mar(?:co)?|abr(?:il)?|apr|mai(?:o)?|may|jun(?:ho)?|jul(?:ho)?|ago(?:sto)?|aug|set(?:embro)?|sep|out(?:ubro)?|oct|nov(?:embro)?|dez(?:embro)?|dec)\b[\s\/-]*(\d{4})/i);
  if (!match) return null;

  const mm = MONTH_MAP[match[1]];
  if (!mm) return null;
  return `${match[2]}-${mm}-01`;
}

function findHeaderRow(rows: any[][], sheetName?: string): { headerRowIdx: number; dataStartRowIdx: number; monthReference: string; columnMap: ColumnMap } | null {
  const scanLimit = Math.min(rows.length, 20);

  for (let rowIdx = 0; rowIdx < scanLimit; rowIdx++) {
    const row = rows[rowIdx];
    if (!row) continue;

    let monthRefInline: string | null = null;
    let prevDateCol = -1;
    let realDateCol = -1;
    let prevPagarCol = -1;
    let prevReceberCol = -1;
    let realPagarCol = -1;
    let realReceberCol = -1;

    for (let colIdx = 0; colIdx < row.length; colIdx++) {
      const cell = String(row[colIdx] ?? "").trim();
      const norm = cell.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

      const maybeMonth = parseMonthReferenceFromText(norm);
      if (maybeMonth && !monthRefInline) monthRefInline = maybeMonth;

      if (norm === "previsto" || norm.startsWith("previsto ")) prevDateCol = colIdx;
      if (norm === "realizado" || norm.startsWith("realizado ")) realDateCol = colIdx;

      if (/soma de pagar/i.test(norm) || /\ba pagar\b/i.test(norm)) prevPagarCol = colIdx;
      if (/soma de receber/i.test(norm) || /\ba receber\b/i.test(norm)) prevReceberCol = colIdx;
      if (/soma de pago/i.test(norm) || /\bpago\b/i.test(norm)) realPagarCol = colIdx;
      if (/soma de recebido/i.test(norm) || /\brecebido\b/i.test(norm)) realReceberCol = colIdx;
    }

    const hasAnyAmountCol = [prevPagarCol, prevReceberCol, realPagarCol, realReceberCol].some((idx) => idx !== -1);
    const hasAnyDateAnchor = prevDateCol !== -1 || realDateCol !== -1;
    if (!hasAnyAmountCol || !hasAnyDateAnchor) continue;

    let monthReference = monthRefInline;
    let dataStartRowIdx = rowIdx + 1;

    // Common spreadsheet layout: row 1 = headers, row 2 = month labels (Jan/2026)
    if (!monthReference) {
      const nextRow = rows[rowIdx + 1] ?? [];
      const monthFromPrev = prevDateCol !== -1 ? parseMonthReferenceFromText(nextRow[prevDateCol]) : null;
      const monthFromReal = realDateCol !== -1 ? parseMonthReferenceFromText(nextRow[realDateCol]) : null;
      const monthFromSheet = parseMonthReferenceFromText(sheetName ?? "");

      monthReference = monthFromPrev || monthFromReal || monthFromSheet;
      if (monthFromPrev || monthFromReal) dataStartRowIdx = rowIdx + 2;
    }

    if (!monthReference) continue;

    if (prevDateCol === -1 && realDateCol !== -1) prevDateCol = realDateCol;
    if (realDateCol === -1 && prevDateCol !== -1) realDateCol = prevDateCol;

    return {
      headerRowIdx: rowIdx,
      dataStartRowIdx,
      monthReference,
      columnMap: { prevDateCol, prevPagarCol, prevReceberCol, realDateCol, realPagarCol, realReceberCol },
    };
  }

  return null;
}

function extractDate(cellValue: any, fallback: string): string | null {
  if (cellValue === null || cellValue === undefined || cellValue === "") return null;

  // If it's a Date object (from cellDates: true)
  if (cellValue instanceof Date) {
    const y = cellValue.getFullYear();
    const m = String(cellValue.getMonth() + 1).padStart(2, "0");
    const d = String(cellValue.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // If it's a number (Excel serial date)
  if (typeof cellValue === "number" && cellValue > 40000 && cellValue < 60000) {
    // Convert Excel serial to JS Date
    const jsDate = new Date((cellValue - 25569) * 86400 * 1000);
    const y = jsDate.getFullYear();
    const m = String(jsDate.getMonth() + 1).padStart(2, "0");
    const d = String(jsDate.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const str = String(cellValue).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);

  // dd/mm/yyyy
  const m1 = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m1) return `${m1[3]}-${m1[2].padStart(2, "0")}-${m1[1].padStart(2, "0")}`;

  // m/d/yy (Excel short format)
  const m2 = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
  if (m2) {
    const yy = parseInt(m2[3]);
    const yyyy = yy < 50 ? 2000 + yy : 1900 + yy;
    return `${yyyy}-${m2[1].padStart(2, "0")}-${m2[2].padStart(2, "0")}`;
  }

  return fallback;
}

function extractNumber(cellValue: any): number | null {
  if (cellValue === null || cellValue === undefined) return null;

  // Raw number from sheet_to_json with rawNumbers: true
  if (typeof cellValue === "number") {
    if (isNaN(cellValue) || !isFinite(cellValue)) return null;
    return Math.round(cellValue * 100) / 100;
  }

  const str = String(cellValue).trim();
  if (str === "" || str === "-" || str === "0") return null;

  return parseAmount(str);
}

function parseAmount(raw: string): number | null {
  if (!raw) return null;
  let cleaned = raw.replace(/\s/g, "").replace("R$", "").replace("€", "").replace("$", "");

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (lastComma > -1 && lastDot === -1) {
    cleaned = cleaned.replace(",", ".");
  }

  const n = parseFloat(cleaned);
  return isNaN(n) ? null : Math.round(n * 100) / 100;
}

// ── Legacy CSV parsing (kept for backward compatibility) ──
function parseCSVLines(
  lines: string[],
  monthReference: string,
  tenantId: string,
  userId: string,
): { rows: any[]; warnings: Array<{ line: number; message: string }> } {
  const delimiter = detectDelimiter(lines[0] ?? "");
  const rawHeaders = splitLine(lines[0] ?? "", delimiter).map((h) => h.trim());
  const norm = rawHeaders.map(normalizeHeader);

  const dateIdx = findIdx(norm, ["data", "date"]);
  const descIdx = findIdx(norm, ["descricao", "description"]);
  const catIdx = findIdx(norm, ["categoria", "category"]);
  const typeIdx = findIdx(norm, ["tipo", "type"]);
  const amountIdx = findIdx(norm, ["valor", "amount", "value"]);
  const scenarioIdx = findIdx(norm, ["cenario", "scenario"]);

  const rows: any[] = [];
  const warnings: Array<{ line: number; message: string }> = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitLine(lines[i], delimiter).map((c) => c.trim());
    if (cols.length < 2 || cols.every((c) => c === "")) continue;

    try {
      const txDateRaw = dateIdx !== -1 ? cols[dateIdx] : monthReference;
      const txDate = normalizeDate(txDateRaw);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(txDate)) {
        warnings.push({ line: i + 1, message: `Data inválida: "${txDateRaw}"` });
        continue;
      }

      const rawVal = amountIdx !== -1 ? cols[amountIdx] : "";
      const val = parseAmount(rawVal);
      if (val === null || val === 0) {
        warnings.push({ line: i + 1, message: "Valor zerado ou vazio" });
        continue;
      }

      const txType = typeIdx !== -1 ? cols[typeIdx].toUpperCase() : "PAGAR";
      const normalizedType = txType.includes("RECEBER") || txType.includes("RECEITA") ? "RECEBER" : "PAGAR";

      let scenario = "PREVISTO";
      if (scenarioIdx !== -1) {
        const raw = cols[scenarioIdx].toUpperCase();
        scenario = raw.includes("REAL") ? "REALIZADO" : "PREVISTO";
      }

      rows.push({
        tenant_id: tenantId, transaction_date: txDate, scenario,
        type: normalizedType, amount: val, month_reference: monthReference,
        description: descIdx !== -1 ? cols[descIdx] : "",
        category: catIdx !== -1 ? cols[catIdx] : "",
        created_by: userId,
      });
    } catch (lineErr) {
      warnings.push({ line: i + 1, message: `Erro: ${(lineErr as Error).message}` });
    }
  }

  return { rows, warnings };
}

function normalizeDate(raw: string): string {
  if (!raw) return new Date().toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const m2 = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
  if (m2) {
    const yy = parseInt(m2[3]);
    const yyyy = yy < 50 ? 2000 + yy : 1900 + yy;
    return `${yyyy}-${m2[1].padStart(2, "0")}-${m2[2].padStart(2, "0")}`;
  }
  return raw;
}

function detectDelimiter(line: string): string {
  return (line.match(/;/g) ?? []).length >= (line.match(/,/g) ?? []).length ? ";" : ",";
}

function splitLine(line: string, delim: string): string[] {
  const cols: string[] = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; continue; }
    if (!inQ && ch === delim) { cols.push(cur); cur = ""; continue; }
    cur += ch;
  }
  cols.push(cur);
  return cols;
}

function normalizeHeader(v: string): string {
  return v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

function findIdx(headers: string[], patterns: string[]): number {
  return headers.findIndex((h) => patterns.some((p) => h === p || h.includes(p)));
}
