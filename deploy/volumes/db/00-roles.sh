#!/bin/bash
# ╔══════════════════════════════════════════════════════════════════╗
# ║  Supabase Self-Hosted — Bootstrap Roles                        ║
# ║  Executado automaticamente no primeiro boot do container DB     ║
# ╚══════════════════════════════════════════════════════════════════╝

set -e

# POSTGRES_PASSWORD is available as env var in the container
PW="${POSTGRES_PASSWORD:-your-super-secret-and-long-postgres-password}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL

-- Supabase requires these roles to exist
DO \$\$ BEGIN
  CREATE ROLE authenticator NOINHERIT LOGIN PASSWORD '${PW}';
EXCEPTION WHEN duplicate_object THEN
  ALTER ROLE authenticator PASSWORD '${PW}';
END \$\$;

DO \$\$ BEGIN
  CREATE ROLE anon NOLOGIN NOINHERIT;
EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;

DO \$\$ BEGIN
  CREATE ROLE authenticated NOLOGIN NOINHERIT;
EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;

DO \$\$ BEGIN
  CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;

DO \$\$ BEGIN
  CREATE ROLE supabase_auth_admin NOINHERIT LOGIN PASSWORD '${PW}';
EXCEPTION WHEN duplicate_object THEN
  ALTER ROLE supabase_auth_admin PASSWORD '${PW}';
END \$\$;

DO \$\$ BEGIN
  CREATE ROLE supabase_storage_admin NOINHERIT LOGIN PASSWORD '${PW}';
EXCEPTION WHEN duplicate_object THEN
  ALTER ROLE supabase_storage_admin PASSWORD '${PW}';
END \$\$;

GRANT anon TO authenticator;
GRANT authenticated TO authenticator;
GRANT service_role TO authenticator;
GRANT supabase_admin TO authenticator;

-- Grant schema usage
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

-- Ensure auth schema exists for GoTrue
CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION supabase_auth_admin;
GRANT USAGE ON SCHEMA auth TO supabase_auth_admin;

-- Ensure _realtime schema exists for Realtime
CREATE SCHEMA IF NOT EXISTS _realtime AUTHORIZATION supabase_admin;

-- Ensure extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" SCHEMA extensions;

EOSQL

echo "✔ Supabase roles and schemas bootstrapped successfully"
