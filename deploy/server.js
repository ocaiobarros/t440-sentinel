#!/usr/bin/env node
/**
 * ┌──────────────────────────────────────────────────────────────┐
 * │  FLOWPULSE INTELLIGENCE — Servidor On-Premise (Standalone)  │
 * │  Substitui Supabase Auth + Edge Functions + Storage         │
 * │  © 2026 CBLabs                                              │
 * └──────────────────────────────────────────────────────────────┘
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

const pool = new Pool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: parseInt(process.env.DB_PORT || "5432", 10),
  database: process.env.DB_NAME || "flowpulse",
  user: process.env.DB_USER || "flowpulse",
  password: process.env.DB_PASS || "flowpulse",
});

const app = express();
app.use(cors());
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
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

/* ─── AUTH MIDDLEWARE ──────────────────────────────── */
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token ausente" });
  }
  try {
    const decoded = jwt.verify(header.slice(7), JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Token inválido ou expirado" });
  }
}

/* ─── AUTH ROUTES ─────────────────────────────────── */

// POST /auth/login
app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    // Suporte a username simplificado (ex: "admin" → "admin@flowpulse.local")
    const resolvedEmail = email.includes("@") ? email : `${email}@flowpulse.local`;

    const { rows } = await pool.query(
      `SELECT p.id, p.email, p.display_name, p.tenant_id, p.avatar_url,
              au.encrypted_password
       FROM profiles p
       JOIN auth_users au ON au.id = p.id
       WHERE p.email = $1`,
      [resolvedEmail]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: "Credenciais inválidas" });
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.encrypted_password);
    if (!match) {
      return res.status(401).json({ error: "Credenciais inválidas" });
    }

    // Buscar role
    const roleResult = await pool.query(
      `SELECT role FROM user_roles WHERE user_id = $1 AND tenant_id = $2 LIMIT 1`,
      [user.id, user.tenant_id]
    );
    const role = roleResult.rows[0]?.role || "viewer";

    const token = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        tenant_id: user.tenant_id,
        role,
        app_metadata: { tenant_id: user.tenant_id },
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    return res.json({
      access_token: token,
      user: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        tenant_id: user.tenant_id,
        role,
      },
    });
  } catch (err) {
    console.error("[auth/login]", err);
    return res.status(500).json({ error: "Erro interno" });
  }
});

// POST /auth/change-password
app.post("/auth/change-password", authMiddleware, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!new_password || new_password.length < 6) {
      return res.status(400).json({ error: "Senha deve ter pelo menos 6 caracteres" });
    }

    const { rows } = await pool.query(
      `SELECT encrypted_password FROM auth_users WHERE id = $1`,
      [req.user.sub]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Usuário não encontrado" });

    const match = await bcrypt.compare(current_password, rows[0].encrypted_password);
    if (!match) return res.status(401).json({ error: "Senha atual incorreta" });

    const hash = await bcrypt.hash(new_password, 12);
    await pool.query(`UPDATE auth_users SET encrypted_password = $1 WHERE id = $2`, [hash, req.user.sub]);

    return res.json({ message: "Senha atualizada com sucesso" });
  } catch (err) {
    console.error("[auth/change-password]", err);
    return res.status(500).json({ error: "Erro interno" });
  }
});

// GET /auth/session — retorna dados do usuário logado
app.get("/auth/session", authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.email, p.display_name, p.tenant_id, p.avatar_url, p.language, p.phone, p.job_title,
              ur.role
       FROM profiles p
       LEFT JOIN user_roles ur ON ur.user_id = p.id AND ur.tenant_id = p.tenant_id
       WHERE p.id = $1`,
      [req.user.sub]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Perfil não encontrado" });
    return res.json({ user: rows[0] });
  } catch (err) {
    console.error("[auth/session]", err);
    return res.status(500).json({ error: "Erro interno" });
  }
});

/* ─── CRUD GENÉRICO (com RLS via tenant_id) ───────── */
function tenantQuery(req) {
  return req.user?.tenant_id;
}

// GET /api/:table
app.get("/api/:table", authMiddleware, async (req, res) => {
  try {
    const table = req.params.table.replace(/[^a-z_]/g, "");
    const tenantId = tenantQuery(req);
    const { rows } = await pool.query(
      `SELECT * FROM ${table} WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1000`,
      [tenantId]
    );
    return res.json(rows);
  } catch (err) {
    console.error(`[api/${req.params.table}]`, err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/:table
app.post("/api/:table", authMiddleware, async (req, res) => {
  try {
    const table = req.params.table.replace(/[^a-z_]/g, "");
    const tenantId = tenantQuery(req);
    const data = { ...req.body, tenant_id: tenantId };
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const columns = keys.join(", ");

    const { rows } = await pool.query(
      `INSERT INTO ${table} (${columns}) VALUES (${placeholders}) RETURNING *`,
      values
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error(`[api/${req.params.table}]`, err);
    return res.status(500).json({ error: err.message });
  }
});

/* ─── STORAGE ROUTES ──────────────────────────────── */

// POST /storage/:bucket/upload
app.post("/storage/:bucket/upload", authMiddleware, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado" });
  const url = `/storage/${req.params.bucket}/${req.file.filename}`;
  return res.json({ url, filename: req.file.filename });
});

// GET /storage/:bucket/:filename
app.get("/storage/:bucket/:filename", (req, res) => {
  const filePath = path.join(STORAGE_DIR, req.params.bucket, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Arquivo não encontrado" });
  return res.sendFile(filePath);
});

/* ─── RPC ROUTES (substituem Edge Functions) ──────── */

// POST /rpc/get_user_tenant_id
app.post("/rpc/get_user_tenant_id", authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT tenant_id FROM profiles WHERE id = $1`,
      [req.user.sub]
    );
    return res.json(rows[0]?.tenant_id || null);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /rpc/check_viability
app.post("/rpc/check_viability", authMiddleware, async (req, res) => {
  try {
    const { lat, lon, map_id } = req.body;
    const tenantId = tenantQuery(req);
    const { rows } = await pool.query(
      `SELECT * FROM check_viability($1, $2, $3, $4)`,
      [lat, lon, tenantId, map_id]
    );
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /rpc/get_map_effective_status
app.post("/rpc/get_map_effective_status", authMiddleware, async (req, res) => {
  try {
    const { map_id } = req.body;
    const { rows } = await pool.query(`SELECT * FROM get_map_effective_status($1)`, [map_id]);
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/* ─── SPA FALLBACK ────────────────────────────────── */
app.use(express.static(STATIC_DIR));
app.get("*", (_req, res) => {
  res.sendFile(path.join(STATIC_DIR, "index.html"));
});

/* ─── START ───────────────────────────────────────── */
app.listen(PORT, "0.0.0.0", () => {
  console.log(`
╔══════════════════════════════════════════════════╗
║   FLOWPULSE INTELLIGENCE — On-Premise Server     ║
║   © 2026 CBLabs                                  ║
║   Porta: ${PORT}                                     ║
╚══════════════════════════════════════════════════╝
  `);
});
