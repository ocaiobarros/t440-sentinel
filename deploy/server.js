#!/usr/bin/env node
/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * │  FLOWPULSE INTELLIGENCE — Servidor On-Premise (Supabase-Compat) │
 * │  Emula PostgREST + GoTrue para que o frontend funcione sem      │
 * │  alterações — basta apontar VITE_SUPABASE_URL para este server  │
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

/* ─── ENV ─────────────────────────────────────────── */
require("dotenv").config({ path: path.join(__dirname, ".env") });

const PORT = parseInt(process.env.PORT || "3060", 10);
const JWT_SECRET = process.env.JWT_SECRET || "flowpulse-secret-change-me";
const JWT_EXPIRY = process.env.JWT_EXPIRY || "24h";
const STORAGE_DIR = process.env.STORAGE_DIR || "/var/lib/flowpulse/data";
const STATIC_DIR = process.env.STATIC_DIR || path.join(__dirname, "dist");
const ANON_KEY = process.env.ANON_KEY || "flowpulse-anon-key";

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
   O Supabase client chama estas rotas automaticamente
   ═══════════════════════════════════════════════════════════ */

// POST /auth/v1/token?grant_type=password  (supabase.auth.signInWithPassword)
app.post("/auth/v1/token", async (req, res) => {
  try {
    const grantType = req.query.grant_type;
    if (grantType === "refresh_token") {
      // Refresh: decode old token and re-issue
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

    // password grant
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

// GET /auth/v1/user  (supabase.auth.getUser)
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

// POST /auth/v1/logout  (supabase.auth.signOut)
app.post("/auth/v1/logout", (_req, res) => res.json({}));

// PUT /auth/v1/user  (supabase.auth.updateUser — e.g. change password)
app.put("/auth/v1/user", requireAuth, async (req, res) => {
  try {
    const { password, data } = req.body;
    if (password) {
      const hash = await bcrypt.hash(password, 12);
      await pool.query(`UPDATE auth_users SET encrypted_password = $1 WHERE id = $2`, [hash, req.user.sub]);
    }
    if (data) {
      // Update profile fields
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
    // Return updated user
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
    refresh_token: token, // simplificado: usa o mesmo token
    user: buildUserObject(u),
  };
}

/* ═══════════════════════════════════════════════════════════
   PostgREST-COMPATIBLE REST ROUTES (/rest/v1/*)
   O Supabase client chama: supabase.from('table').select()
   que gera GET /rest/v1/table?select=*&col=eq.value
   ═══════════════════════════════════════════════════════════ */

// Whitelist de tabelas permitidas
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

// Tabelas que NÃO filtram por tenant_id (ou usam outro mecanismo)
const NO_TENANT_FILTER = new Set(["widgets"]);
// Tabelas onde tenant_id vem via join (widgets -> dashboards)
const TENANT_VIA_JOIN = {
  widgets: { join: "dashboards", on: "dashboard_id", fk: "id" },
};

/**
 * Parseia filtros PostgREST da query string
 * Ex: ?name=eq.MeuMapa&status=in.(open,ack)&order=created_at.desc&limit=100
 */
function parsePostgrestFilters(query, tenantId, table) {
  const conditions = [];
  const values = [];
  let orderBy = "created_at DESC";
  let limitVal = 1000;
  let offsetVal = 0;
  let selectCols = "*";
  let idx = 1;

  // Tenant isolation (exceto tabelas sem tenant_id)
  if (!NO_TENANT_FILTER.has(table) && tenantId) {
    conditions.push(`"${table}".tenant_id = $${idx++}`);
    values.push(tenantId);
  }

  for (const [key, val] of Object.entries(query)) {
    if (key === "order") {
      // order=created_at.desc ou order=name.asc
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

    // PostgREST operators
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
        // in.(val1,val2,val3)
        const inner = val.slice(4, -1); // remove "in.(" and ")"
        const items = inner.split(",");
        const placeholders = items.map((_item, i) => `$${idx + i}`);
        conditions.push(`"${table}"."${col}" IN (${placeholders.join(",")})`);
        items.forEach(item => values.push(item));
        idx += items.length;
      } else if (val.startsWith("cs.")) {
        // contains (array)
        conditions.push(`"${table}"."${col}" @> $${idx++}`);
        values.push(val.slice(3));
      } else if (val.startsWith("not.")) {
        // not.eq.value, not.is.null, etc.
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

// GET /rest/v1/:table — SELECT
app.get("/rest/v1/:table", requireAuth, async (req, res) => {
  try {
    const table = req.params.table;
    if (!ALLOWED_TABLES.has(table)) return res.status(404).json({ message: `relation "${table}" not found` });

    const tenantId = req.user.app_metadata?.tenant_id;
    const { where, values, orderBy, limit, offset } = parsePostgrestFilters(req.query, tenantId, table);

    // Handle widgets (tenant via join)
    let query;
    if (table === "widgets" && tenantId) {
      const extraWhere = where ? `${where} AND "dashboards"."tenant_id" = $${values.length + 1}` : `WHERE "dashboards"."tenant_id" = $1`;
      values.push(tenantId);
      query = `SELECT "widgets".* FROM "${table}" JOIN "dashboards" ON "widgets"."dashboard_id" = "dashboards"."id" ${extraWhere} ORDER BY ${orderBy} LIMIT ${limit} OFFSET ${offset}`;
    } else {
      query = `SELECT * FROM "${table}" ${where} ORDER BY ${orderBy} LIMIT ${limit} OFFSET ${offset}`;
    }

    const { rows } = await pool.query(query, values);

    // Supabase client expects array response
    // Set content-range header for count
    res.setHeader("Content-Range", `0-${rows.length}/*`);
    return res.json(rows);
  } catch (err) {
    console.error(`[REST GET /${req.params.table}]`, err);
    return res.status(400).json({ message: err.message, code: "PGRST000" });
  }
});

// POST /rest/v1/:table — INSERT
app.post("/rest/v1/:table", requireAuth, async (req, res) => {
  try {
    const table = req.params.table;
    if (!ALLOWED_TABLES.has(table)) return res.status(404).json({ message: `relation "${table}" not found` });

    const tenantId = req.user.app_metadata?.tenant_id;
    const prefer = req.headers.prefer || "";
    const returnRep = prefer.includes("return=representation");

    // Handle single or array insert
    const items = Array.isArray(req.body) ? req.body : [req.body];
    const results = [];

    for (const item of items) {
      // Inject tenant_id if table has it and not widgets
      if (!NO_TENANT_FILTER.has(table) && tenantId && !item.tenant_id) {
        item.tenant_id = tenantId;
      }
      // Inject created_by
      if (req.user.sub && !item.created_by && table !== "profiles" && table !== "user_roles") {
        item.created_by = req.user.sub;
      }

      const keys = Object.keys(item);
      const vals = Object.values(item);
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
      const columns = keys.map(k => `"${k}"`).join(", ");

      // Handle upsert (Prefer: resolution=merge-duplicates)
      let sql;
      if (prefer.includes("resolution=merge-duplicates")) {
        const onConflict = req.query.on_conflict || "id";
        const updateSet = keys.filter(k => k !== onConflict).map((k, i) => `"${k}" = EXCLUDED."${k}"`).join(", ");
        sql = `INSERT INTO "${table}" (${columns}) VALUES (${placeholders}) ON CONFLICT ("${onConflict}") DO UPDATE SET ${updateSet} RETURNING *`;
      } else {
        sql = `INSERT INTO "${table}" (${columns}) VALUES (${placeholders}) RETURNING *`;
      }

      const { rows } = await pool.query(sql, vals);
      results.push(rows[0]);
    }

    const status = returnRep ? 201 : 201;
    return res.status(status).json(returnRep ? (Array.isArray(req.body) ? results : results[0]) : {});
  } catch (err) {
    console.error(`[REST POST /${req.params.table}]`, err);
    return res.status(400).json({ message: err.message, code: "PGRST000" });
  }
});

// PATCH /rest/v1/:table — UPDATE
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

// DELETE /rest/v1/:table — DELETE
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
   supabase.rpc('function_name', { args })
   ═══════════════════════════════════════════════════════════ */

// POST /rest/v1/rpc/:fn
app.post("/rest/v1/rpc/:fn", requireAuth, async (req, res) => {
  try {
    const fn = req.params.fn.replace(/[^a-z_]/g, "");
    const tenantId = req.user.app_metadata?.tenant_id;

    // Whitelist de funções permitidas
    const RPC_HANDLERS = {
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
        // Simplified version — returns hosts with their status
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
        // Get current state
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
   STORAGE ROUTES (/storage/v1/*)
   Emula Supabase Storage API
   ═══════════════════════════════════════════════════════════ */

// POST /storage/v1/object/:bucket  (upload)
app.post("/storage/v1/object/:bucket", requireAuth, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  const key = `${req.params.bucket}/${req.file.filename}`;
  return res.json({ Key: key, Id: req.file.filename });
});

// GET /storage/v1/object/public/:bucket/:filename
app.get("/storage/v1/object/public/:bucket/*", (req, res) => {
  const bucket = req.params.bucket;
  const filePath = req.params[0]; // rest of path
  const fullPath = path.join(STORAGE_DIR, bucket, filePath);
  if (!fs.existsSync(fullPath)) return res.status(404).json({ error: "Not found" });
  return res.sendFile(fullPath);
});

// Serve public storage URLs that the Supabase client generates
app.get("/storage/v1/object/sign/:bucket/*", requireAuth, (req, res) => {
  const bucket = req.params.bucket;
  const filePath = req.params[0];
  return res.json({ signedURL: `/storage/v1/object/public/${bucket}/${filePath}` });
});

/* ═══════════════════════════════════════════════════════════
   REALTIME STUB — O Supabase client tenta conectar via WS
   Retornamos 200 em /realtime para evitar erros, mas sem WS
   ═══════════════════════════════════════════════════════════ */
app.get("/realtime/v1/websocket", (_req, res) => {
  res.status(200).json({ message: "Realtime not available in on-premise mode" });
});

/* ═══════════════════════════════════════════════════════════
   EDGE FUNCTIONS STUB (/functions/v1/*)
   Rotas para Edge Functions que o frontend chama via
   supabase.functions.invoke('fn-name')
   ═══════════════════════════════════════════════════════════ */
app.all("/functions/v1/:fn", requireAuth, async (req, res) => {
  const fn = req.params.fn;
  console.warn(`[Edge Function Stub] "${fn}" called — implement in server.js if needed`);
  return res.json({ message: `Edge function "${fn}" not implemented in on-premise mode` });
});

/* ─── LEGACY COMPAT ROUTES ────────────────────────── */
// POST /auth/login — rota legada (redirect para GoTrue)
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
║   Supabase-Compatible API (PostgREST + GoTrue)       ║
║   © 2026 CBLabs                                      ║
║   Porta: ${PORT}                                         ║
║                                                      ║
║   Auth:    /auth/v1/*                                ║
║   REST:    /rest/v1/*                                ║
║   Storage: /storage/v1/*                             ║
║   RPC:     /rest/v1/rpc/*                            ║
╚══════════════════════════════════════════════════════╝
  `);
});
