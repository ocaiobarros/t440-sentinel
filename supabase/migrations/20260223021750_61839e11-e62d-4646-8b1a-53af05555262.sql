
-- 0) Coluna current_status em flow_map_hosts usando enum link_status
ALTER TABLE public.flow_map_hosts
  ADD COLUMN IF NOT EXISTS current_status public.link_status NOT NULL DEFAULT 'UNKNOWN';

-- 1) Índices para hot path da Engine
CREATE INDEX IF NOT EXISTS idx_fmh_map_status
  ON public.flow_map_hosts (map_id, current_status);

CREATE INDEX IF NOT EXISTS idx_fml_map_origin
  ON public.flow_map_links (map_id, origin_host_id);

CREATE INDEX IF NOT EXISTS idx_fml_map_dest
  ON public.flow_map_links (map_id, dest_host_id);

-- 2) Realtime com replica identity
ALTER TABLE public.flow_map_hosts REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.flow_map_hosts;

-- 3) RPC: Engine de Propagação (BFS batch, tenant-safe)
CREATE OR REPLACE FUNCTION public.get_map_effective_status(p_map_id uuid)
RETURNS TABLE(
  host_id uuid,
  effective_status text,
  is_root_cause boolean,
  depth integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
SET row_security TO 'on'
AS $$
WITH
guard AS (
  SELECT m.id
  FROM public.flow_maps m
  WHERE m.id = p_map_id
    AND m.tenant_id = public.jwt_tenant_id()
),
map_nodes AS (
  SELECT h.id, h.current_status
  FROM public.flow_map_hosts h
  JOIN guard g ON g.id = h.map_id
),
roots AS (
  SELECT DISTINCT n.id
  FROM map_nodes n
  WHERE n.current_status <> 'DOWN'
    AND EXISTS (
      SELECT 1
      FROM public.flow_map_links l
      JOIN guard g ON g.id = l.map_id
      WHERE l.map_id = p_map_id
        AND (
          (l.origin_host_id = n.id AND l.origin_role = 'CORE')
          OR
          (l.dest_host_id   = n.id AND l.dest_role   = 'CORE')
        )
    )
),
fallback_roots AS (
  SELECT DISTINCT n.id
  FROM map_nodes n
  WHERE n.current_status <> 'DOWN'
    AND NOT EXISTS (SELECT 1 FROM roots)
    AND EXISTS (
      SELECT 1
      FROM public.flow_map_links l
      JOIN guard g ON g.id = l.map_id
      WHERE l.map_id = p_map_id
        AND (l.origin_host_id = n.id OR l.dest_host_id = n.id)
    )
),
seed AS (
  SELECT id FROM roots
  UNION
  SELECT id FROM fallback_roots
),
reachable AS (
  WITH RECURSIVE r(id, depth) AS (
    SELECT s.id, 0 FROM seed s
    UNION
    SELECT
      CASE WHEN l.origin_host_id = r.id THEN l.dest_host_id ELSE l.origin_host_id END,
      r.depth + 1
    FROM r
    JOIN public.flow_map_links l
      ON l.map_id = p_map_id
     AND (l.origin_host_id = r.id OR l.dest_host_id = r.id)
    JOIN map_nodes nb
      ON nb.id = CASE WHEN l.origin_host_id = r.id THEN l.dest_host_id ELSE l.origin_host_id END
    WHERE nb.current_status <> 'DOWN'
  )
  SELECT id, MIN(depth) AS depth
  FROM r
  GROUP BY id
)
SELECT
  n.id AS host_id,
  CASE
    WHEN n.current_status = 'DOWN' THEN 'DOWN'
    WHEN r.id IS NOT NULL THEN n.current_status::text
    ELSE 'ISOLATED'
  END AS effective_status,
  (n.current_status = 'DOWN') AS is_root_cause,
  COALESCE(r.depth, -1)::int AS depth
FROM map_nodes n
LEFT JOIN reachable r ON r.id = n.id;
$$;

GRANT EXECUTE ON FUNCTION public.get_map_effective_status(uuid) TO authenticated;
