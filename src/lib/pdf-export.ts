/**
 * SLA Governance PDF Export — Professional PDF using jsPDF + html2canvas
 */
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

interface SLAMetrics {
  uptime: number;
  breaches: number;
  totalDownSeconds: number;
  totalAlerts: number;
  worstHosts: { host: string; downSeconds: number; uptime: number }[];
  dailyUptime: { day: string; uptime: number }[];
}

interface SLAPolicy {
  id: string;
  name: string;
  ack_target_seconds: number;
  resolve_target_seconds: number;
}

interface AlertRow {
  id: string;
  title: string;
  severity: string;
  status: string;
  opened_at: string;
  resolved_at: string | null;
  ack_breached_at: string | null;
  resolve_breached_at: string | null;
  payload: Record<string, any>;
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h${m > 0 ? ` ${m}m` : ""}`;
}

export async function exportSLAPdf({
  metrics,
  policies,
  alerts,
  period,
  filters,
}: {
  metrics: SLAMetrics;
  policies: SLAPolicy[];
  alerts: AlertRow[];
  period: string;
  filters: { group?: string; host?: string };
}) {
  const now = new Date().toLocaleString("pt-BR");
  const periodLabel = period === "current" ? "Mês Atual" : "Mês Anterior";
  const filterLabel = filters.host
    ? `Host: ${filters.host}`
    : filters.group
      ? `Grupo: ${filters.group}`
      : "Todos os Ativos";

  const violations = alerts.filter((a) => a.ack_breached_at || a.resolve_breached_at);

  // Create a hidden container for rendering
  const container = document.createElement("div");
  container.style.cssText = "position:fixed;left:-9999px;top:0;width:800px;background:#fff;padding:40px;font-family:'Segoe UI',system-ui,sans-serif;color:#1a1a2e;";
  
  container.innerHTML = `
    <div style="margin-bottom:32px;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
        <div style="width:40px;height:40px;background:linear-gradient(135deg,#0B0E14,#1e40af);border-radius:8px;display:flex;align-items:center;justify-content:center;">
          <span style="color:#60a5fa;font-weight:900;font-size:18px;">FP</span>
        </div>
        <div>
          <h1 style="font-size:22px;font-weight:800;color:#0B0E14;margin:0;">FLOWPULSE INTELLIGENCE</h1>
          <p style="font-size:11px;color:#64748b;margin:2px 0 0;">Relatório de SLA & Disponibilidade</p>
        </div>
      </div>
      <div style="font-size:10px;color:#94a3b8;margin-top:6px;">
        Gerado em: ${now} &nbsp;|&nbsp; Período: ${periodLabel} &nbsp;|&nbsp; Filtro: ${filterLabel}
      </div>
      <div style="height:2px;background:linear-gradient(90deg,#3b82f6,#06b6d4,transparent);margin-top:12px;border-radius:2px;"></div>
    </div>

    <!-- KPI Cards -->
    <div style="display:flex;gap:12px;margin-bottom:24px;">
      <div style="flex:1;border:1px solid #e2e8f0;border-radius:10px;padding:14px;background:#f8fafc;">
        <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.8px;color:#94a3b8;font-weight:600;">Uptime Global</div>
        <div style="font-size:28px;font-weight:800;margin-top:4px;color:${metrics.uptime >= 99.9 ? "#059669" : metrics.uptime >= 99 ? "#d97706" : "#dc2626"};">${metrics.uptime.toFixed(3)}%</div>
      </div>
      <div style="flex:1;border:1px solid #e2e8f0;border-radius:10px;padding:14px;background:#f8fafc;">
        <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.8px;color:#94a3b8;font-weight:600;">Violações SLA</div>
        <div style="font-size:28px;font-weight:800;margin-top:4px;color:${metrics.breaches === 0 ? "#059669" : "#dc2626"};">${metrics.breaches}</div>
      </div>
      <div style="flex:1;border:1px solid #e2e8f0;border-radius:10px;padding:14px;background:#f8fafc;">
        <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.8px;color:#94a3b8;font-weight:600;">Downtime Total</div>
        <div style="font-size:28px;font-weight:800;margin-top:4px;color:#d97706;">${formatDuration(metrics.totalDownSeconds)}</div>
      </div>
      <div style="flex:1;border:1px solid #e2e8f0;border-radius:10px;padding:14px;background:#f8fafc;">
        <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.8px;color:#94a3b8;font-weight:600;">Total Incidentes</div>
        <div style="font-size:28px;font-weight:800;margin-top:4px;color:#1e293b;">${metrics.totalAlerts}</div>
      </div>
    </div>

    <!-- Daily Uptime Bar Chart (simple CSS bars) -->
    <div style="margin-bottom:24px;">
      <h2 style="font-size:12px;font-weight:700;color:#0f172a;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e2e8f0;padding-bottom:6px;">📅 Uptime Diário — 30 dias</h2>
      <div style="display:flex;align-items:flex-end;gap:2px;height:80px;">
        ${metrics.dailyUptime.map((d) => {
          const h = Math.max(4, ((d.uptime - 95) / 5) * 76);
          const color = d.uptime >= 99.9 ? "#059669" : d.uptime >= 99 ? "#d97706" : "#dc2626";
          return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;">
            <div style="width:100%;height:${h}px;background:${color};border-radius:2px 2px 0 0;opacity:0.8;"></div>
          </div>`;
        }).join("")}
      </div>
      <div style="display:flex;gap:2px;margin-top:2px;">
        ${metrics.dailyUptime.map((d, i) => 
          i % 5 === 0 ? `<div style="flex:1;font-size:6px;color:#94a3b8;text-align:center;">${d.day}</div>` : `<div style="flex:1;"></div>`
        ).join("")}
      </div>
    </div>

    <!-- Worst Performance -->
    <div style="margin-bottom:24px;">
      <h2 style="font-size:12px;font-weight:700;color:#0f172a;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e2e8f0;padding-bottom:6px;">🔻 Pior Performance (Top 5)</h2>
      ${metrics.worstHosts.length === 0 
        ? '<p style="color:#94a3b8;font-size:11px;">Nenhum incidente no período.</p>' 
        : `<table style="width:100%;border-collapse:collapse;font-size:10px;">
          <thead>
            <tr style="background:#f1f5f9;">
              <th style="text-align:left;padding:6px 8px;font-size:9px;text-transform:uppercase;color:#64748b;border-bottom:1px solid #e2e8f0;">Host</th>
              <th style="text-align:right;padding:6px 8px;font-size:9px;text-transform:uppercase;color:#64748b;border-bottom:1px solid #e2e8f0;">Downtime</th>
              <th style="text-align:right;padding:6px 8px;font-size:9px;text-transform:uppercase;color:#64748b;border-bottom:1px solid #e2e8f0;">Uptime</th>
            </tr>
          </thead>
          <tbody>
            ${metrics.worstHosts.map((h) => `
              <tr>
                <td style="padding:5px 8px;border-bottom:1px solid #f1f5f9;font-weight:500;">${h.host}</td>
                <td style="padding:5px 8px;border-bottom:1px solid #f1f5f9;text-align:right;color:#d97706;">${formatDuration(h.downSeconds)}</td>
                <td style="padding:5px 8px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600;color:${h.uptime >= 99.9 ? "#059669" : h.uptime >= 99 ? "#d97706" : "#dc2626"};">${h.uptime.toFixed(3)}%</td>
              </tr>
            `).join("")}
          </tbody>
        </table>`}
    </div>

    <!-- SLA Policies -->
    ${policies.length > 0 ? `
    <div style="margin-bottom:24px;">
      <h2 style="font-size:12px;font-weight:700;color:#0f172a;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e2e8f0;padding-bottom:6px;">🛡️ Políticas de SLA</h2>
      <table style="width:100%;border-collapse:collapse;font-size:10px;">
        <thead>
          <tr style="background:#f1f5f9;">
            <th style="text-align:left;padding:6px 8px;font-size:9px;text-transform:uppercase;color:#64748b;border-bottom:1px solid #e2e8f0;">Política</th>
            <th style="text-align:right;padding:6px 8px;font-size:9px;text-transform:uppercase;color:#64748b;border-bottom:1px solid #e2e8f0;">Tempo Resposta</th>
            <th style="text-align:right;padding:6px 8px;font-size:9px;text-transform:uppercase;color:#64748b;border-bottom:1px solid #e2e8f0;">Tempo Resolução</th>
          </tr>
        </thead>
        <tbody>
          ${policies.map((p) => `
            <tr>
              <td style="padding:5px 8px;border-bottom:1px solid #f1f5f9;font-weight:500;">${p.name}</td>
              <td style="padding:5px 8px;border-bottom:1px solid #f1f5f9;text-align:right;">${formatDuration(p.ack_target_seconds)}</td>
              <td style="padding:5px 8px;border-bottom:1px solid #f1f5f9;text-align:right;">${formatDuration(p.resolve_target_seconds)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>` : ""}

    <!-- Violations -->
    <div style="margin-bottom:24px;">
      <h2 style="font-size:12px;font-weight:700;color:#0f172a;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e2e8f0;padding-bottom:6px;">⚠️ Violações de SLA (${violations.length})</h2>
      ${violations.length === 0 
        ? '<div style="padding:12px;background:#f0fdf4;border-radius:8px;text-align:center;"><span style="color:#059669;font-weight:600;font-size:12px;">✅ Nenhuma violação de SLA no período!</span></div>'
        : `<table style="width:100%;border-collapse:collapse;font-size:10px;">
          <thead>
            <tr style="background:#f1f5f9;">
              <th style="text-align:left;padding:6px 8px;font-size:9px;text-transform:uppercase;color:#64748b;border-bottom:1px solid #e2e8f0;">Severidade</th>
              <th style="text-align:left;padding:6px 8px;font-size:9px;text-transform:uppercase;color:#64748b;border-bottom:1px solid #e2e8f0;">Host</th>
              <th style="text-align:left;padding:6px 8px;font-size:9px;text-transform:uppercase;color:#64748b;border-bottom:1px solid #e2e8f0;">Alerta</th>
              <th style="text-align:left;padding:6px 8px;font-size:9px;text-transform:uppercase;color:#64748b;border-bottom:1px solid #e2e8f0;">Status</th>
              <th style="text-align:left;padding:6px 8px;font-size:9px;text-transform:uppercase;color:#64748b;border-bottom:1px solid #e2e8f0;">Violação</th>
            </tr>
          </thead>
          <tbody>
            ${violations.slice(0, 30).map((a) => {
              const host = a.payload?.hostname || a.payload?.host || "—";
              const vType = [a.ack_breached_at ? "ACK" : "", a.resolve_breached_at ? "Resolução" : ""].filter(Boolean).join(" + ");
              const sevColor = a.severity === "disaster" || a.severity === "high" ? "#dc2626" : "#d97706";
              return `<tr>
                <td style="padding:5px 8px;border-bottom:1px solid #f1f5f9;"><span style="background:${sevColor}15;color:${sevColor};padding:1px 6px;border-radius:4px;font-size:9px;font-weight:600;">${a.severity}</span></td>
                <td style="padding:5px 8px;border-bottom:1px solid #f1f5f9;">${host}</td>
                <td style="padding:5px 8px;border-bottom:1px solid #f1f5f9;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${a.title}</td>
                <td style="padding:5px 8px;border-bottom:1px solid #f1f5f9;">${a.status}</td>
                <td style="padding:5px 8px;border-bottom:1px solid #f1f5f9;"><span style="background:#dc262615;color:#dc2626;padding:1px 6px;border-radius:4px;font-size:9px;font-weight:600;">${vType}</span></td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>`}
    </div>

    <!-- Footer -->
    <div style="margin-top:32px;text-align:center;font-size:9px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px;">
      FLOWPULSE INTELLIGENCE — SLA Governance Report — ${now}
    </div>
  `;

  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      width: 800,
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pdfWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    // Multi-page support
    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pdfHeight;

    while (heightLeft > 0) {
      position = -(imgHeight - heightLeft);
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;
    }

    const filename = `SLA_Report_${period === "current" ? "MesAtual" : "MesAnterior"}_${new Date().toISOString().slice(0, 10)}.pdf`;
    pdf.save(filename);
  } finally {
    document.body.removeChild(container);
  }
}
