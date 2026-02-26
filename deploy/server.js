#!/usr/bin/env node
/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * │  FLOWPULSE INTELLIGENCE — Servidor On-Premise (Supabase-Compat) │
 * │  Emula PostgREST + GoTrue + Edge Functions para que o frontend  │
 * │  funcione sem alterações — basta apontar VITE_SUPABASE_URL      │
 * │  © 2026 CBLabs                                                  │
 * ╚══════════════════════════════════════════════════════════════════╝
 */

const express = require("express");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

/* ─── ENV ─────────────────────────────────────────── */
require("dotenv").config({ path: path.join(__dirname, ".env") });

const PORT = parseInt(process.env.PORT || "3060", 10);
const JWT_SECRET = process.env.JWT_SECRET || "flowpulse-secret-change-me";
const JWT_EXPIRY = process.env.JWT_EXPIRY || "24h";
const STORAGE_DIR = process.env.STORAGE_DIR || "/var/lib/flowpulse/data";
const STATIC_DIR = process.env.STATIC_DIR || path.join(__dirname, "dist");
const ANON_KEY = process.env.ANON_KEY || "flowpulse-anon-key";
const ZABBIX_ENCRYPTION_KEY = process.env.ZABBIX_ENCRYPTION_KEY || "flowpulse-zabbix-key-change-me";

const pool = new Pool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: parseInt(process.env.DB_PORT || "5432", 10),
  database: process.env.DB_NAME || "flowpulse",
  user: process.env.DB_USER || "flowpulse",
  password: process.env.DB_PASS || "flowpulse",
});

const app = express();
app.use(cors({ origin: "*", exposedHeaders: ["content-range", "x-total-count"] }));
app.use(express.json({ limit: "10mb" }));

/* ─── STORAGE ─────────────────────────────────────── */
fs.mkdirSync(STORAGE_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const bucket = req.params.bucket || "default";
      const dir = path.join(STORAGE_DIR, bucket);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ts = Date.now();
      const ext = path.extname(file.originalname);
      cb(null, `${ts}${ext}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
});

/* ═══════════════════════════════════════════════════════════
   AUTH MIDDLEWARE — Extrai JWT do header Authorization
   ═══════════════════════════════════════════════════════════ */
function extractUser(req) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  try {
    return jwt.verify(header.slice(7), JWT_SECRET);
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  const user = extractUser(req);
  if (!user) return res.status(401).json({ error: "not_authenticated", message: "Token ausente ou inválido" });
  req.user = user;
  next();
}

/* ═══════════════════════════════════════════════════════════
   GoTrue-COMPATIBLE AUTH ROUTES (/auth/v1/*)
   ═══════════════════════════════════════════════════════════ */

app.post("/auth/v1/token", async (req, res) => {
  try {
    const grantType = req.query.grant_type;
    if (grantType === "refresh_token") {
      const oldToken = req.body.refresh_token;
      try {
        const decoded = jwt.verify(oldToken, JWT_SECRET, { ignoreExpiration: true });
        const { rows } = await pool.query(
          `SELECT p.id, p.email, p.display_name, p.tenant_id, p.avatar_url, p.language, p.phone, p.job_title,
                  ur.role
           FROM profiles p
           LEFT JOIN user_roles ur ON ur.user_id = p.id AND ur.tenant_id = p.tenant_id
           WHERE p.id = $1`,
          [decoded.sub]
        );
        if (rows.length === 0) return res.status(401).json({ error: "invalid_grant" });
        const u = rows[0];
        const token = mintToken(u);
        return res.json(buildSessionResponse(u, token));
      } catch {
        return res.status(401).json({ error: "invalid_grant", error_description: "Token inválido" });
      }
    }

    const { email, password } = req.body;
    const resolvedEmail = email.includes("@") ? email : `${email}@flowpulse.local`;

    const { rows } = await pool.query(
      `SELECT p.id, p.email, p.display_name, p.tenant_id, p.avatar_url, p.language, p.phone, p.job_title,
              au.encrypted_password, ur.role
       FROM profiles p
       JOIN auth_users au ON au.id = p.id
       LEFT JOIN user_roles ur ON ur.user_id = p.id AND ur.tenant_id = p.tenant_id
       WHERE p.email = $1`,
      [resolvedEmail]
    );
    if (rows.length === 0) return res.status(400).json({ error: "invalid_grant", error_description: "Credenciais inválidas" });

    const u = rows[0];
    const match = await bcrypt.compare(password, u.encrypted_password);
    if (!match) return res.status(400).json({ error: "invalid_grant", error_description: "Credenciais inválidas" });

    const token = mintToken(u);
    return res.json(buildSessionResponse(u, token));
  } catch (err) {
    console.error("[auth/token]", err);
    return res.status(500).json({ error: "server_error", error_description: err.message });
  }
});

app.get("/auth/v1/user", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.email, p.display_name, p.tenant_id, p.avatar_url, p.language, p.phone, p.job_title,
              ur.role
       FROM profiles p
       LEFT JOIN user_roles ur ON ur.user_id = p.id AND ur.tenant_id = p.tenant_id
       WHERE p.id = $1`,
      [req.user.sub]
    );
    if (rows.length === 0) return res.status(404).json({ error: "user_not_found" });
    const u = rows[0];
    return res.json(buildUserObject(u));
  } catch (err) {
    console.error("[auth/user]", err);
    return res.status(500).json({ error: err.message });
  }
});

app.post("/auth/v1/logout", (_req, res) => res.json({}));

app.put("/auth/v1/user", requireAuth, async (req, res) => {
  try {
    const { password, data } = req.body;
    if (password) {
      const hash = await bcrypt.hash(password, 12);
      await pool.query(`UPDATE auth_users SET encrypted_password = $1 WHERE id = $2`, [hash, req.user.sub]);
    }
    if (data) {
      const updates = [];
      const vals = [];
      let idx = 1;
      for (const [k, v] of Object.entries(data)) {
        if (["display_name", "avatar_url", "phone", "job_title", "language"].includes(k)) {
          updates.push(`${k} = $${idx++}`);
          vals.push(v);
        }
      }
      if (updates.length > 0) {
        vals.push(req.user.sub);
        await pool.query(`UPDATE profiles SET ${updates.join(", ")} WHERE id = $${idx}`, vals);
      }
    }
    const { rows } = await pool.query(
      `SELECT p.id, p.email, p.display_name, p.tenant_id, p.avatar_url, p.language, p.phone, p.job_title, ur.role
       FROM profiles p LEFT JOIN user_roles ur ON ur.user_id = p.id AND ur.tenant_id = p.tenant_id
       WHERE p.id = $1`, [req.user.sub]
    );
    return res.json(buildUserObject(rows[0]));
  } catch (err) {
    console.error("[auth/update-user]", err);
    return res.status(500).json({ error: err.message });
  }
});

/* ── Auth helpers ─────────────────────────────────── */
function mintToken(u) {
  return jwt.sign(
    {
      sub: u.id,
      email: u.email,
      role: "authenticated",
      app_metadata: { tenant_id: u.tenant_id, role: u.role || "viewer" },
      user_metadata: { display_name: u.display_name },
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

function buildUserObject(u) {
  return {
    id: u.id,
    email: u.email,
    role: "authenticated",
    app_metadata: { tenant_id: u.tenant_id, role: u.role || "viewer" },
    user_metadata: { display_name: u.display_name, avatar_url: u.avatar_url },
    aud: "authenticated",
    created_at: new Date().toISOString(),
  };
}

function buildSessionResponse(u, token) {
  return {
    access_token: token,
    token_type: "bearer",
    expires_in: 86400,
    refresh_token: token,
    user: buildUserObject(u),
  };
}

/* ═══════════════════════════════════════════════════════════
   PostgREST-COMPATIBLE REST ROUTES (/rest/v1/*)
   ═══════════════════════════════════════════════════════════ */

const ALLOWED_TABLES = new Set([
  "tenants", "profiles", "user_roles", "dashboards", "widgets",
  "zabbix_connections", "flow_maps", "flow_map_hosts", "flow_map_links",
  "flow_map_link_items", "flow_map_link_events", "flow_map_ctos",
  "flow_map_cables", "flow_map_reservas", "flow_map_effective_cache",
  "alert_rules", "alert_instances", "alert_events", "alert_notifications",
  "notification_channels", "escalation_policies", "escalation_steps",
  "sla_policies", "maintenance_windows", "maintenance_scopes",
  "audit_logs", "flow_audit_logs", "webhook_tokens",
  "telemetry_config", "telemetry_heartbeat",
  "printer_configs", "billing_logs", "rms_connections",
]);

const NO_TENANT_FILTER = new Set(["widgets"]);

function parsePostgrestFilters(query, tenantId, table) {
  const conditions = [];
  const values = [];
  let orderBy = "created_at DESC";
  let limitVal = 1000;
  let offsetVal = 0;
  let selectCols = "*";
  let idx = 1;

  if (!NO_TENANT_FILTER.has(table) && tenantId) {
    conditions.push(`"${table}".tenant_id = $${idx++}`);
    values.push(tenantId);
  }

  for (const [key, val] of Object.entries(query)) {
    if (key === "order") {
      const parts = val.split(".");
      const col = parts[0].replace(/[^a-z_]/g, "");
      const dir = parts[1]?.toUpperCase() === "ASC" ? "ASC" : "DESC";
      const nulls = parts.find(p => p.startsWith("nulls"));
      orderBy = `"${col}" ${dir}${nulls ? ` NULLS ${nulls === "nullslast" ? "LAST" : "FIRST"}` : ""}`;
      continue;
    }
    if (key === "limit") { limitVal = Math.min(parseInt(val, 10) || 1000, 5000); continue; }
    if (key === "offset") { offsetVal = parseInt(val, 10) || 0; continue; }
    if (key === "select") { selectCols = val; continue; }
    if (key === "on_conflict" || key === "columns" || key === "apikey") continue;

    const col = key.replace(/[^a-z_]/g, "");
    if (!col) continue;

    if (typeof val === "string") {
      if (val.startsWith("eq.")) {
        conditions.push(`"${table}"."${col}" = $${idx++}`);
        values.push(val.slice(3));
      } else if (val.startsWith("neq.")) {
        conditions.push(`"${table}"."${col}" != $${idx++}`);
        values.push(val.slice(4));
      } else if (val.startsWith("gt.")) {
        conditions.push(`"${table}"."${col}" > $${idx++}`);
        values.push(val.slice(3));
      } else if (val.startsWith("gte.")) {
        conditions.push(`"${table}"."${col}" >= $${idx++}`);
        values.push(val.slice(4));
      } else if (val.startsWith("lt.")) {
        conditions.push(`"${table}"."${col}" < $${idx++}`);
        values.push(val.slice(3));
      } else if (val.startsWith("lte.")) {
        conditions.push(`"${table}"."${col}" <= $${idx++}`);
        values.push(val.slice(4));
      } else if (val.startsWith("like.")) {
        conditions.push(`"${table}"."${col}" LIKE $${idx++}`);
        values.push(val.slice(5));
      } else if (val.startsWith("ilike.")) {
        conditions.push(`"${table}"."${col}" ILIKE $${idx++}`);
        values.push(val.slice(6));
      } else if (val.startsWith("is.")) {
        const v = val.slice(3);
        if (v === "null") conditions.push(`"${table}"."${col}" IS NULL`);
        else if (v === "true") conditions.push(`"${table}"."${col}" IS TRUE`);
        else if (v === "false") conditions.push(`"${table}"."${col}" IS FALSE`);
      } else if (val.startsWith("in.")) {
        const inner = val.slice(4, -1);
        const items = inner.split(",");
        const placeholders = items.map((_item, i) => `$${idx + i}`);
        conditions.push(`"${table}"."${col}" IN (${placeholders.join(",")})`);
        items.forEach(item => values.push(item));
        idx += items.length;
      } else if (val.startsWith("cs.")) {
        conditions.push(`"${table}"."${col}" @> $${idx++}`);
        values.push(val.slice(3));
      } else if (val.startsWith("not.")) {
        const rest = val.slice(4);
        if (rest.startsWith("eq.")) {
          conditions.push(`"${table}"."${col}" != $${idx++}`);
          values.push(rest.slice(3));
        } else if (rest.startsWith("is.null")) {
          conditions.push(`"${table}"."${col}" IS NOT NULL`);
        }
      }
    }
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return { where, values, orderBy, limit: limitVal, offset: offsetVal, selectCols };
}

// GET /rest/v1/:table
app.get("/rest/v1/:table", requireAuth, async (req, res) => {
  try {
    const table = req.params.table;
    if (!ALLOWED_TABLES.has(table)) return res.status(404).json({ message: `relation "${table}" not found` });

    const tenantId = req.user.app_metadata?.tenant_id;
    const { where, values, orderBy, limit, offset } = parsePostgrestFilters(req.query, tenantId, table);

    let query;
    if (table === "widgets" && tenantId) {
      const extraWhere = where ? `${where} AND "dashboards"."tenant_id" = $${values.length + 1}` : `WHERE "dashboards"."tenant_id" = $1`;
      values.push(tenantId);
      query = `SELECT "widgets".* FROM "${table}" JOIN "dashboards" ON "widgets"."dashboard_id" = "dashboards"."id" ${extraWhere} ORDER BY ${orderBy} LIMIT ${limit} OFFSET ${offset}`;
    } else {
      query = `SELECT * FROM "${table}" ${where} ORDER BY ${orderBy} LIMIT ${limit} OFFSET ${offset}`;
    }

    const { rows } = await pool.query(query, values);
    res.setHeader("Content-Range", `0-${rows.length}/*`);
    return res.json(rows);
  } catch (err) {
    console.error(`[REST GET /${req.params.table}]`, err);
    return res.status(400).json({ message: err.message, code: "PGRST000" });
  }
});

// POST /rest/v1/:table
app.post("/rest/v1/:table", requireAuth, async (req, res) => {
  try {
    const table = req.params.table;
    if (!ALLOWED_TABLES.has(table)) return res.status(404).json({ message: `relation "${table}" not found` });

    const tenantId = req.user.app_metadata?.tenant_id;
    const prefer = req.headers.prefer || "";
    const returnRep = prefer.includes("return=representation");

    const items = Array.isArray(req.body) ? req.body : [req.body];
    const results = [];

    for (const item of items) {
      if (!NO_TENANT_FILTER.has(table) && tenantId && !item.tenant_id) {
        item.tenant_id = tenantId;
      }
      if (req.user.sub && !item.created_by && table !== "profiles" && table !== "user_roles") {
        item.created_by = req.user.sub;
      }

      const keys = Object.keys(item);
      const vals = Object.values(item);
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
      const columns = keys.map(k => `"${k}"`).join(", ");

      let sql;
      if (prefer.includes("resolution=merge-duplicates")) {
        const onConflict = req.query.on_conflict || "id";
        const updateSet = keys.filter(k => k !== onConflict).map((k) => `"${k}" = EXCLUDED."${k}"`).join(", ");
        sql = `INSERT INTO "${table}" (${columns}) VALUES (${placeholders}) ON CONFLICT ("${onConflict}") DO UPDATE SET ${updateSet} RETURNING *`;
      } else {
        sql = `INSERT INTO "${table}" (${columns}) VALUES (${placeholders}) RETURNING *`;
      }

      const { rows } = await pool.query(sql, vals);
      results.push(rows[0]);
    }

    return res.status(201).json(returnRep ? (Array.isArray(req.body) ? results : results[0]) : {});
  } catch (err) {
    console.error(`[REST POST /${req.params.table}]`, err);
    return res.status(400).json({ message: err.message, code: "PGRST000" });
  }
});

// PATCH /rest/v1/:table
app.patch("/rest/v1/:table", requireAuth, async (req, res) => {
  try {
    const table = req.params.table;
    if (!ALLOWED_TABLES.has(table)) return res.status(404).json({ message: `relation "${table}" not found` });

    const tenantId = req.user.app_metadata?.tenant_id;
    const { where, values: filterValues } = parsePostgrestFilters(req.query, tenantId, table);

    if (!where) return res.status(400).json({ message: "PATCH requires filters" });

    const data = req.body;
    const setClauses = [];
    const allValues = [...filterValues];
    let idx = filterValues.length + 1;

    for (const [key, val] of Object.entries(data)) {
      setClauses.push(`"${key}" = $${idx++}`);
      allValues.push(val);
    }

    const sql = `UPDATE "${table}" SET ${setClauses.join(", ")} ${where} RETURNING *`;
    const { rows } = await pool.query(sql, allValues);

    const prefer = req.headers.prefer || "";
    return res.json(prefer.includes("return=representation") ? rows : {});
  } catch (err) {
    console.error(`[REST PATCH /${req.params.table}]`, err);
    return res.status(400).json({ message: err.message, code: "PGRST000" });
  }
});

// DELETE /rest/v1/:table
app.delete("/rest/v1/:table", requireAuth, async (req, res) => {
  try {
    const table = req.params.table;
    if (!ALLOWED_TABLES.has(table)) return res.status(404).json({ message: `relation "${table}" not found` });

    const tenantId = req.user.app_metadata?.tenant_id;
    const { where, values } = parsePostgrestFilters(req.query, tenantId, table);

    if (!where) return res.status(400).json({ message: "DELETE requires filters" });

    const sql = `DELETE FROM "${table}" ${where} RETURNING *`;
    const { rows } = await pool.query(sql, values);
    return res.json(rows);
  } catch (err) {
    console.error(`[REST DELETE /${req.params.table}]`, err);
    return res.status(400).json({ message: err.message, code: "PGRST000" });
  }
});

/* ═══════════════════════════════════════════════════════════
   RPC ROUTES (/rest/v1/rpc/*)
   ═══════════════════════════════════════════════════════════ */

app.post("/rest/v1/rpc/:fn", requireAuth, async (req, res) => {
  try {
    const fn = req.params.fn.replace(/[^a-z_]/g, "");
    const tenantId = req.user.app_metadata?.tenant_id;

    const RPC_HANDLERS = {
      is_super_admin: async () => {
        const userId = req.body.p_user_id || req.user.sub;
        const { rows } = await pool.query(
          `SELECT EXISTS (
            SELECT 1 FROM profiles
            WHERE id = $1 AND email IN ('caio.barros@madeplant.com.br', 'admin@flowpulse.local')
          ) AS result`,
          [userId]
        );
        return rows[0]?.result ?? false;
      },
      get_user_tenant_id: async () => {
        const { rows } = await pool.query(`SELECT tenant_id FROM profiles WHERE id = $1`, [req.user.sub]);
        return rows[0]?.tenant_id || null;
      },
      check_viability: async () => {
        const { lat, lon, map_id } = req.body;
        const { rows } = await pool.query(
          `SELECT * FROM (
            SELECT c.id AS cto_id, c.name AS cto_name,
              (6371000.0 * acos(LEAST(1.0, GREATEST(-1.0,
                cos(radians($1)) * cos(radians(c.lat)) * cos(radians(c.lon) - radians($2)) +
                sin(radians($1)) * sin(radians(c.lat))
              )))) AS distance_m,
              c.capacity::TEXT AS capacity, c.occupied_ports,
              (c.capacity::TEXT::INT - c.occupied_ports) AS free_ports,
              c.status_calculated::TEXT AS status_calculated
            FROM flow_map_ctos c
            WHERE c.tenant_id = $3 AND c.map_id = $4
              AND abs(c.lat - $1) < 0.002 AND abs(c.lon - $2) < 0.003
          ) sub WHERE sub.distance_m <= 200 ORDER BY sub.distance_m ASC LIMIT 5`,
          [lat, lon, tenantId, map_id]
        );
        return rows;
      },
      get_map_effective_status: async () => {
        const { map_id } = req.body;
        const { rows } = await pool.query(
          `SELECT h.id AS host_id, h.current_status::TEXT AS effective_status,
                  (h.current_status = 'DOWN') AS is_root_cause, 0 AS depth
           FROM flow_map_hosts h WHERE h.map_id = $1 AND h.tenant_id = $2`,
          [map_id, tenantId]
        );
        return rows;
      },
      alert_transition: async () => {
        const { p_alert_id, p_to, p_user_id, p_message, p_payload } = req.body;
        const { rows: [alert] } = await pool.query(
          `SELECT status, tenant_id FROM alert_instances WHERE id = $1 AND tenant_id = $2`,
          [p_alert_id, tenantId]
        );
        if (!alert) throw new Error("alert not found");
        await pool.query(
          `UPDATE alert_instances SET status = $1,
           acknowledged_at = CASE WHEN $1 = 'ack' THEN COALESCE(acknowledged_at, now()) ELSE acknowledged_at END,
           acknowledged_by = CASE WHEN $1 = 'ack' THEN COALESCE(acknowledged_by, $3) ELSE acknowledged_by END,
           resolved_at = CASE WHEN $1 = 'resolved' THEN COALESCE(resolved_at, now()) ELSE resolved_at END,
           resolved_by = CASE WHEN $1 = 'resolved' THEN COALESCE(resolved_by, $3) ELSE resolved_by END,
           updated_at = now()
           WHERE id = $2`,
          [p_to, p_alert_id, req.user.sub]
        );
        await pool.query(
          `INSERT INTO alert_events (tenant_id, alert_id, event_type, from_status, to_status, user_id, message, payload)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [tenantId, p_alert_id,
           alert.status === 'open' && p_to === 'ack' ? 'ACK' : p_to === 'resolved' ? 'RESOLVE' : 'UPDATE',
           alert.status, p_to, req.user.sub, p_message || null, p_payload || '{}']
        );
        return null;
      },
      bump_telemetry_heartbeat: async () => {
        const { p_tenant_id, p_source } = req.body;
        const tid = p_tenant_id || tenantId;
        await pool.query(
          `INSERT INTO telemetry_heartbeat (tenant_id, last_webhook_at, last_webhook_source, event_count, updated_at)
           VALUES ($1, now(), $2, 1, now())
           ON CONFLICT (tenant_id) DO UPDATE SET
             last_webhook_at = now(), last_webhook_source = $2,
             event_count = telemetry_heartbeat.event_count + 1, updated_at = now()`,
          [tid, p_source || "zabbix-webhook"]
        );
        return null;
      },
    };

    const handler = RPC_HANDLERS[fn];
    if (!handler) return res.status(404).json({ message: `function "${fn}" not found` });
    const result = await handler();
    return res.json(result);
  } catch (err) {
    console.error(`[RPC /${req.params.fn}]`, err);
    return res.status(400).json({ message: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   ZABBIX PROXY — AES-GCM Decryption + Zabbix JSON-RPC
   Emula a Edge Function "zabbix-proxy"
   ═══════════════════════════════════════════════════════════ */

// Zabbix auth token cache (connectionId → { token, expiresAt })
const zabbixTokenCache = new Map();

async function decryptAesGcm(ciphertext, iv, tag, keyStr) {
  // Derive 256-bit key from any input
  let keyBuffer;
  if (/^[0-9a-fA-F]{64}$/.test(keyStr)) {
    keyBuffer = Buffer.from(keyStr, "hex");
  } else {
    keyBuffer = crypto.createHash("sha256").update(keyStr).digest();
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", keyBuffer, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  let decrypted = decipher.update(Buffer.from(ciphertext, "hex"), undefined, "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

function buildZabbixApiUrl(base) {
  const trimmed = base.replace(/\/+$/, "");
  if (trimmed.endsWith("/api_jsonrpc.php")) return trimmed;
  return `${trimmed}/api_jsonrpc.php`;
}

async function zabbixLogin(url, username, password) {
  const endpoint = buildZabbixApiUrl(url);
  const resp = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "user.login", params: { username, password }, id: 1 }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await resp.json();
  if (data.error) throw new Error(`Zabbix login failed: ${JSON.stringify(data.error)}`);
  return data.result;
}

async function zabbixCall(url, authToken, method, params = {}) {
  const allowed = [
    "host.get", "hostgroup.get", "item.get", "history.get", "trigger.get",
    "problem.get", "event.get", "template.get", "application.get",
    "graph.get", "trend.get", "dashboard.get",
  ];
  if (!allowed.includes(method)) throw new Error(`Method "${method}" not allowed`);

  const endpoint = buildZabbixApiUrl(url);
  const resp = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, auth: authToken, id: 2 }),
    signal: AbortSignal.timeout(30000),
  });
  if (!resp.ok) throw new Error(`Zabbix HTTP ${resp.status}`);
  const data = await resp.json();
  if (data.error) throw new Error(`Zabbix API error (${method}): ${JSON.stringify(data.error)}`);
  return data.result;
}

async function getZabbixAuthToken(url, username, password, connectionId) {
  const cached = zabbixTokenCache.get(connectionId);
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  const token = await zabbixLogin(url, username, password);
  zabbixTokenCache.set(connectionId, { token, expiresAt: Date.now() + 10 * 60 * 1000 });
  return token;
}

/** Core function to perform a Zabbix API call given a connection_id */
async function executeZabbixProxy(connectionId, method, params, tenantId) {
  const { rows } = await pool.query(
    `SELECT id, url, username, password_ciphertext, password_iv, password_tag, is_active
     FROM zabbix_connections WHERE id = $1 AND tenant_id = $2`,
    [connectionId, tenantId]
  );
  if (rows.length === 0) throw new Error("Connection not found or access denied");
  const conn = rows[0];
  if (!conn.is_active) throw new Error("Connection is disabled");

  const password = await decryptAesGcm(conn.password_ciphertext, conn.password_iv, conn.password_tag, ZABBIX_ENCRYPTION_KEY);
  const authToken = await getZabbixAuthToken(conn.url, conn.username, password, conn.id);
  return await zabbixCall(conn.url, authToken, method, params);
}

/* ═══════════════════════════════════════════════════════════
   EDGE FUNCTIONS (/functions/v1/*)
   Implementação local das Edge Functions do Supabase
   ═══════════════════════════════════════════════════════════ */

const EDGE_FUNCTION_HANDLERS = {
  /* ── zabbix-proxy ────────────────────────────── */
  "zabbix-proxy": async (req, res) => {
    try {
      const { connection_id, method, params } = req.body;
      if (!connection_id || !method) return res.status(400).json({ error: "connection_id and method are required" });
      const tenantId = req.user.app_metadata?.tenant_id;
      const result = await executeZabbixProxy(connection_id, method, params || {}, tenantId);
      return res.json({ result });
    } catch (err) {
      console.error("[zabbix-proxy]", err);
      if (err.message.includes("login failed")) zabbixTokenCache.clear();
      return res.status(500).json({ error: err.message });
    }
  },

  /* ── printer-status ──────────────────────────── */
  "printer-status": async (req, res) => {
    try {
      const tenantId = req.body.tenant_id || req.user.app_metadata?.tenant_id;
      const action = req.body.action;
      if (!tenantId) return res.status(400).json({ error: "missing tenant_id" });

      // Get active zabbix connection
      const { rows: connRows } = await pool.query(
        `SELECT id FROM zabbix_connections WHERE tenant_id = $1 AND is_active = true LIMIT 1`,
        [tenantId]
      );
      const connectionId = connRows[0]?.id;

      // Get printer configs
      const { rows: configs } = await pool.query(
        `SELECT zabbix_host_id, host_name, base_counter FROM printer_configs WHERE tenant_id = $1`,
        [tenantId]
      );
      // Sanitize base_counter
      const printerConfigs = configs.map(c => ({
        ...c,
        base_counter: typeof c.base_counter === "number" && !isNaN(c.base_counter) ? c.base_counter : 0,
      }));

      if (!connectionId || printerConfigs.length === 0) {
        return res.json({ printers: [], total: 0, grid: [], peak: null, message: "Nenhuma impressora configurada." });
      }

      const hostIds = printerConfigs.map(c => c.zabbix_host_id);

      // Counter keys
      const COUNTER_KEYS = ["kyocera.counter.total", "number.of.printed.pages", ".1.3.6.1.2.1.43.10.2.1.4.1.1"];
      const TONER_KEYS = ["kyocera.toner.percent", "black", "cyan", "magenta", "yellow"];

      // Fetch printer items from Zabbix
      const items = await executeZabbixProxy(connectionId, "item.get", {
        output: ["itemid", "key_", "name", "lastvalue", "units", "hostid", "value_type"],
        hostids: hostIds,
        search: {
          key_: "kyocera.counter.total,number.of.printed.pages,.1.3.6.1.2.1.43.10.2.1.4.1.1,kyocera.toner.percent,black,cyan,magenta,yellow,cosumablecalculated,consumablecalculated,kyocera.serial,.1.3.6.1.2.1.43.5.1.1.17.1",
        },
        searchByAny: true,
        searchWildcardsEnabled: true,
        limit: 2000,
      }, tenantId);

      // Get host names
      const hosts = await executeZabbixProxy(connectionId, "host.get", {
        output: ["hostid", "host", "name"],
        hostids: hostIds,
      }, tenantId);
      const hostMap = new Map((hosts || []).map(h => [h.hostid, h]));

      const getCounterValue = (hostId) => {
        for (const key of COUNTER_KEYS) {
          const item = (items || []).find(i => i.hostid === hostId && i.key_.toLowerCase().includes(key.toLowerCase()));
          if (item) { const v = parseInt(item.lastvalue); if (!isNaN(v)) return v; }
        }
        return 0;
      };

      const getSerialNumber = (hostId) => {
        const serKeys = ["kyocera.serial", ".1.3.6.1.2.1.43.5.1.1.17.1"];
        for (const key of serKeys) {
          const item = (items || []).find(i => i.hostid === hostId && i.key_.toLowerCase().includes(key.toLowerCase()));
          if (item?.lastvalue) return item.lastvalue;
        }
        return "";
      };

      const getTonerLevels = (hostId) => {
        const levels = [];
        const hostItems = (items || []).filter(i => i.hostid === hostId);
        for (const item of hostItems) {
          const k = item.key_.toLowerCase();
          if (TONER_KEYS.some(tk => k === tk || k.includes(tk)) || k.startsWith("cosumablecalculated") || k.startsWith("consumablecalculated")) {
            const v = parseFloat(item.lastvalue);
            if (!isNaN(v)) levels.push({ key: item.name || item.key_, value: v > 100 ? 100 : v });
          }
        }
        return levels;
      };

      if (action === "counters") {
        const printers = printerConfigs.map(cfg => {
          const zabbixCounter = getCounterValue(cfg.zabbix_host_id);
          const billingCounter = cfg.base_counter + zabbixCounter;
          const serial = getSerialNumber(cfg.zabbix_host_id);
          const host = hostMap.get(cfg.zabbix_host_id);
          return { hostId: cfg.zabbix_host_id, name: cfg.host_name || host?.name || host?.host || cfg.zabbix_host_id, ip: host?.host ?? "", zabbixCounter, baseCounter: cfg.base_counter, billingCounter, serial };
        });
        return res.json({ printers, total: printers.reduce((s, p) => s + p.billingCounter, 0) });
      }

      if (action === "low_toner") {
        const lowPrinters = [];
        for (const cfg of printerConfigs) {
          const levels = getTonerLevels(cfg.zabbix_host_id);
          const lowLevels = levels.filter(l => l.value < 10);
          if (lowLevels.length > 0) {
            const host = hostMap.get(cfg.zabbix_host_id);
            lowPrinters.push({ name: cfg.host_name || host?.name || host?.host || cfg.zabbix_host_id, supplies: lowLevels.map(l => ({ name: l.key, level: Math.round(l.value) })) });
          }
        }
        return res.json({ printers: lowPrinters });
      }

      if (action === "monthly_snapshot") {
        const now = new Date();
        const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const entries = printerConfigs.map(cfg => {
          const zabbixCounter = getCounterValue(cfg.zabbix_host_id);
          const billingCounter = cfg.base_counter + zabbixCounter;
          const serial = getSerialNumber(cfg.zabbix_host_id);
          const host = hostMap.get(cfg.zabbix_host_id);
          return { hostId: cfg.zabbix_host_id, name: cfg.host_name || host?.name || host?.host || "", ip: host?.host ?? "", zabbixCounter, baseCounter: cfg.base_counter, billingCounter, serial };
        });
        const totalPages = entries.reduce((s, e) => s + e.billingCounter, 0);
        await pool.query(
          `INSERT INTO billing_logs (tenant_id, period, entries, total_pages) VALUES ($1, $2, $3, $4)`,
          [tenantId, period, JSON.stringify(entries), totalPages]
        );
        return res.json({ ok: true, period, totalPages, count: entries.length });
      }

      if (action === "supply_forecast") {
        const nowTs = Math.floor(Date.now() / 1000);
        const fifteenDaysAgo = nowTs - 15 * 86400;
        const oneDayAgo = nowTs - 86400;

        const forecasts = [];
        for (const cfg of printerConfigs) {
          const hostItems = (items || []).filter(i => i.hostid === cfg.zabbix_host_id);
          const tonerItems = hostItems.filter(i => {
            const k = i.key_.toLowerCase();
            return TONER_KEYS.some(tk => k === tk || k.includes(tk)) || k.startsWith("cosumablecalculated") || k.startsWith("consumablecalculated");
          });
          if (tonerItems.length === 0) continue;

          const host = hostMap.get(cfg.zabbix_host_id);
          const printerName = cfg.host_name || host?.name || host?.host || cfg.zabbix_host_id;
          const supplies = [];

          for (const item of tonerItems) {
            const currentLevel = parseFloat(item.lastvalue);
            if (isNaN(currentLevel)) continue;
            const clampedCurrent = Math.min(100, Math.max(0, currentLevel));

            try {
              const historyType = item.value_type === "3" ? 3 : 0;
              const history = await executeZabbixProxy(connectionId, "history.get", {
                output: ["clock", "value"], itemids: [item.itemid], history: historyType,
                time_from: fifteenDaysAgo, time_till: nowTs, sortfield: "clock", sortorder: "ASC", limit: 500,
              }, tenantId);

              if (!history || history.length < 2) {
                supplies.push({ name: item.name || item.key_, currentLevel: clampedCurrent, dailyConsumption: 0, daysRemaining: null, estimatedDate: null, dataInsufficient: true });
                continue;
              }
              const latestClock = parseInt(history[history.length - 1].clock);
              if (latestClock < oneDayAgo) {
                supplies.push({ name: item.name || item.key_, currentLevel: clampedCurrent, dailyConsumption: 0, daysRemaining: null, estimatedDate: null, dataInsufficient: true });
                continue;
              }
              const earliestVal = parseFloat(history[0].value);
              const latestVal = parseFloat(history[history.length - 1].value);
              const earliestClock = parseInt(history[0].clock);
              const timeSpanDays = (latestClock - earliestClock) / 86400;
              if (timeSpanDays < 1) {
                supplies.push({ name: item.name || item.key_, currentLevel: clampedCurrent, dailyConsumption: 0, daysRemaining: null, estimatedDate: null, dataInsufficient: true });
                continue;
              }
              const consumption = earliestVal - latestVal;
              const dailyConsumption = consumption > 0 ? consumption / timeSpanDays : 0;
              let daysRemaining = null, estimatedDate = null;
              if (dailyConsumption > 0.01) {
                daysRemaining = Math.round(clampedCurrent / dailyConsumption);
                estimatedDate = new Date(Date.now() + daysRemaining * 86400 * 1000).toISOString().slice(0, 10);
              }
              supplies.push({ name: item.name || item.key_, currentLevel: clampedCurrent, dailyConsumption: Math.round(dailyConsumption * 100) / 100, daysRemaining, estimatedDate, dataInsufficient: false });
            } catch (histErr) {
              console.warn(`[printer-status/forecast] history error for item ${item.itemid}:`, histErr.message);
              supplies.push({ name: item.name || item.key_, currentLevel: clampedCurrent, dailyConsumption: 0, daysRemaining: null, estimatedDate: null, dataInsufficient: true });
            }
          }
          if (supplies.length > 0) forecasts.push({ name: printerName, hostId: cfg.zabbix_host_id, supplies });
        }
        return res.json({ printers: forecasts });
      }

      if (action === "usage_heatmap") {
        const hostId = req.body.host_id;
        // Fetch history for counter items over the last 7 days
        const nowTs = Math.floor(Date.now() / 1000);
        const sevenDaysAgo = nowTs - 7 * 86400;

        const targetHostIds = hostId ? [hostId] : hostIds;
        const grid = [];
        const hourlyTotals = new Map(); // "day-hour" → value

        for (const hid of targetHostIds) {
          // Find counter item for this host
          const counterItem = (items || []).find(i => {
            if (i.hostid !== hid) return false;
            const k = i.key_.toLowerCase();
            return COUNTER_KEYS.some(ck => k.includes(ck.toLowerCase()));
          });
          if (!counterItem) continue;

          try {
            const historyType = counterItem.value_type === "3" ? 3 : 0;
            const history = await executeZabbixProxy(connectionId, "history.get", {
              output: ["clock", "value"], itemids: [counterItem.itemid], history: historyType,
              time_from: sevenDaysAgo, time_till: nowTs, sortfield: "clock", sortorder: "ASC", limit: 5000,
            }, tenantId);

            if (!history || history.length < 2) continue;

            // Calculate delta per hour bucket
            for (let i = 1; i < history.length; i++) {
              const prevVal = parseInt(history[i - 1].value) || 0;
              const currVal = parseInt(history[i].value) || 0;
              const delta = currVal - prevVal;
              if (delta <= 0) continue;

              const ts = new Date(parseInt(history[i].clock) * 1000);
              const day = (ts.getDay() + 6) % 7; // Monday=0
              const hour = ts.getHours();
              const key = `${day}-${hour}`;
              hourlyTotals.set(key, (hourlyTotals.get(key) || 0) + delta);
            }
          } catch (e) {
            console.warn(`[printer-status/heatmap] history error for host ${hid}:`, e.message);
          }
        }

        // Build grid
        let peak = null;
        for (let day = 0; day < 7; day++) {
          for (let hour = 0; hour < 24; hour++) {
            const value = hourlyTotals.get(`${day}-${hour}`) || 0;
            grid.push({ day, hour, value });
            if (!peak || value > peak.value) peak = { day, hour, value };
          }
        }

        return res.json({ grid, peak: peak && peak.value > 0 ? peak : null });
      }

      return res.status(400).json({ error: "unknown action" });
    } catch (err) {
      console.error("[printer-status]", err);
      return res.status(500).json({ error: err.message });
    }
  },

  /* ── zabbix-connections (test) ───────────────── */
  "zabbix-connections": async (req, res) => {
    return res.json({ message: "Use REST API for zabbix_connections" });
  },

  /* ── system-status ───────────────────────────── */
  "system-status": async (req, res) => {
    const uptime = process.uptime();
    return res.json({
      status: "healthy",
      uptime_seconds: Math.round(uptime),
      mode: "on-premise",
      version: "1.0.0",
      database: "connected",
    });
  },
};

// Route edge function calls
app.all("/functions/v1/:fn", requireAuth, async (req, res) => {
  const fn = req.params.fn;
  const handler = EDGE_FUNCTION_HANDLERS[fn];
  if (handler) return handler(req, res);
  console.warn(`[Edge Function] "${fn}" not implemented — returning empty result`);
  return res.json({ message: `Edge function "${fn}" not implemented in on-premise mode`, result: null });
});

/* ═══════════════════════════════════════════════════════════
   STORAGE ROUTES (/storage/v1/*)
   ═══════════════════════════════════════════════════════════ */

app.post("/storage/v1/object/:bucket", requireAuth, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  const key = `${req.params.bucket}/${req.file.filename}`;
  return res.json({ Key: key, Id: req.file.filename });
});

app.get("/storage/v1/object/public/:bucket/*", (req, res) => {
  const bucket = req.params.bucket;
  const filePath = req.params[0];
  const fullPath = path.join(STORAGE_DIR, bucket, filePath);
  if (!fs.existsSync(fullPath)) return res.status(404).json({ error: "Not found" });
  return res.sendFile(fullPath);
});

app.get("/storage/v1/object/sign/:bucket/*", requireAuth, (req, res) => {
  const bucket = req.params.bucket;
  const filePath = req.params[0];
  return res.json({ signedURL: `/storage/v1/object/public/${bucket}/${filePath}` });
});

/* ── REALTIME STUB ─────────────────────────────── */
app.get("/realtime/v1/websocket", (_req, res) => {
  res.status(200).json({ message: "Realtime not available in on-premise mode" });
});

/* ═══════════════════════════════════════════════════════════
   HEALTHZ — Endpoint de Saúde (sem auth)
   ═══════════════════════════════════════════════════════════ */
app.get("/healthz", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    return res.json({ status: "ok", version: process.env.npm_package_version || "3.0.0", mode: "on-premise", database: "connected", uptime_seconds: Math.round(process.uptime()) });
  } catch (err) {
    return res.status(503).json({ status: "degraded", version: process.env.npm_package_version || "3.0.0", database: "unreachable", error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   SIGNUP — Criação de usuário local (admin only)
   ═══════════════════════════════════════════════════════════ */
app.post("/auth/v1/signup", requireAuth, async (req, res) => {
  try {
    const caller = req.user;
    const callerRole = caller.app_metadata?.role;
    if (callerRole !== "admin") return res.status(403).json({ error: "forbidden", error_description: "Apenas admins podem criar usuários" });

    const { email, password, data } = req.body;
    if (!email || !password) return res.status(400).json({ error: "invalid_request", error_description: "email e password são obrigatórios" });

    const resolvedEmail = email.includes("@") ? email : `${email}@flowpulse.local`;
    const tenantId = caller.app_metadata?.tenant_id;
    const hash = await bcrypt.hash(password, 12);

    // Create auth_users entry
    const { rows: [authUser] } = await pool.query(
      `INSERT INTO auth_users (email, encrypted_password) VALUES ($1, $2) RETURNING id`,
      [resolvedEmail, hash]
    );

    // Create profile
    const displayName = data?.display_name || email.split("@")[0];
    await pool.query(
      `INSERT INTO profiles (id, tenant_id, display_name, email) VALUES ($1, $2, $3, $4)`,
      [authUser.id, tenantId, displayName, resolvedEmail]
    );

    // Create role
    const role = data?.role || "viewer";
    await pool.query(
      `INSERT INTO user_roles (user_id, tenant_id, role) VALUES ($1, $2, $3)`,
      [authUser.id, tenantId, role]
    );

    return res.status(201).json(buildUserObject({ id: authUser.id, email: resolvedEmail, display_name: displayName, tenant_id: tenantId, role }));
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "user_exists", error_description: "Usuário já existe" });
    console.error("[auth/signup]", err);
    return res.status(500).json({ error: "server_error", error_description: err.message });
  }
});

/* ── LEGACY COMPAT ─────────────────────────────── */
app.post("/auth/login", (req, res) => {
  req.query.grant_type = "password";
  return app.handle(Object.assign(req, { url: "/auth/v1/token?grant_type=password", method: "POST" }), res);
});

/* ─── SPA FALLBACK ────────────────────────────────── */
app.use(express.static(STATIC_DIR));
app.get("*", (_req, res) => {
  const indexPath = path.join(STATIC_DIR, "index.html");
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  return res.status(404).json({ error: "Frontend não encontrado. Execute o build primeiro." });
});

/* ─── START ───────────────────────────────────────── */
app.listen(PORT, "0.0.0.0", () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║   FLOWPULSE INTELLIGENCE — On-Premise Server         ║
║   100% Local — Zero External Dependencies            ║
║   © 2026 CBLabs                                      ║
║   Porta: ${PORT}                                         ║
║                                                      ║
║   Health:  /healthz                                  ║
║   Auth:    /auth/v1/*  (login, signup, user, logout) ║
║   REST:    /rest/v1/*                                ║
║   Storage: /storage/v1/*                             ║
║   RPC:     /rest/v1/rpc/*                            ║
║   Edge:    /functions/v1/*                           ║
║                                                      ║
║   ✔ zabbix-proxy (Zabbix JSON-RPC Gateway)           ║
║   ✔ printer-status (Billing + Forecast + Heatmap)    ║
║   ✔ system-status                                    ║
╚══════════════════════════════════════════════════════╝
  `);
});
