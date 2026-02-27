#!/bin/bash
# ╔══════════════════════════════════════════════════════════════════╗
# ║  Supabase Self-Hosted — Bootstrap Roles                        ║
# ║  Executado automaticamente no primeiro boot do container DB     ║
# ╚══════════════════════════════════════════════════════════════════╝

set -e

# DB init defaults — Supabase image uses supabase_admin as superuser
PW="${POSTGRES_PASSWORD:-your-super-secret-and-long-postgres-password}"
DB_USER="${POSTGRES_USER:-supabase_admin}"
DB_NAME="${POSTGRES_DB:-postgres}"

psql -v ON_ERROR_STOP=1 --username "$DB_USER" --dbname "$DB_NAME" <<-EOSQL

-- The postgres role is required by GoTrue migrations (grant ... to postgres)
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    CREATE ROLE postgres LOGIN SUPERUSER CREATEDB CREATEROLE REPLICATION BYPASSRLS;
  END IF;
END \$\$;

-- Authenticator role (used by PostgREST)
DO \$\$ BEGIN
  CREATE ROLE authenticator NOINHERIT LOGIN PASSWORD '${PW}';
EXCEPTION WHEN duplicate_object THEN
  ALTER ROLE authenticator PASSWORD '${PW}';
END \$\$;

DO \$\$ BEGIN
  CREATE ROLE anon NOLOGIN NOINHERIT;
EXCEPTION WHEN duplicate_object THEN NULL;
END \$\$;

DO \$\$ BEGIN
  CREATE ROLE authenticated NOLOGIN NOINHERIT;
EXCEPTION WHEN duplicate_object THEN NULL;
END \$\$;

DO \$\$ BEGIN
  CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END \$\$;

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

-- Auth admin needs CREATE on database + public schema for GoTrue migrations
GRANT CREATE ON DATABASE ${DB_NAME} TO supabase_auth_admin;
GRANT CREATE ON DATABASE ${DB_NAME} TO supabase_storage_admin;

GRANT USAGE, CREATE ON SCHEMA public TO supabase_auth_admin;
GRANT USAGE, CREATE ON SCHEMA public TO supabase_storage_admin;

-- Critical: force schema resolution to auth/storage first (avoids enum/type drift)
ALTER ROLE supabase_auth_admin SET search_path = auth, public;
ALTER ROLE supabase_storage_admin SET search_path = storage, public;

GRANT ALL ON ALL TABLES IN SCHEMA public TO supabase_auth_admin, supabase_storage_admin;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO supabase_auth_admin, supabase_storage_admin;

-- Ensure auth schema exists for GoTrue
CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION supabase_auth_admin;
GRANT ALL ON SCHEMA auth TO supabase_auth_admin;
GRANT USAGE ON SCHEMA auth TO postgres, supabase_admin, authenticated, anon, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT REFERENCES ON TABLES TO postgres, supabase_admin;

-- PostgREST (authenticator) needs to call auth.uid()/auth.jwt() inside RLS policies
-- These functions are created by GoTrue migrations; grant EXECUTE after they exist
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

-- GoTrue migrations need postgres to SELECT from auth tables
GRANT SELECT ON ALL TABLES IN SCHEMA auth TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT SELECT ON TABLES TO postgres;

-- Ensure storage schema exists
CREATE SCHEMA IF NOT EXISTS storage AUTHORIZATION supabase_storage_admin;
GRANT ALL ON SCHEMA storage TO supabase_storage_admin;

-- Ensure _realtime and realtime schemas exist for Realtime
CREATE SCHEMA IF NOT EXISTS _realtime AUTHORIZATION supabase_admin;
CREATE SCHEMA IF NOT EXISTS realtime AUTHORIZATION supabase_admin;
GRANT USAGE ON SCHEMA realtime TO supabase_admin;
GRANT ALL ON SCHEMA realtime TO supabase_admin;

-- Ensure extensions schema
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO postgres, supabase_auth_admin, supabase_storage_admin, anon, authenticated, service_role;

EOSQL

echo "✔ Supabase roles and schemas bootstrapped successfully"
