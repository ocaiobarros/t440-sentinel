
-- ============================================================
-- FIX: Split RESTRICTIVE "FOR ALL" manage policies into
-- separate INSERT / UPDATE / DELETE so they don't block
-- cross-tenant SELECT for shared resources.
-- Also fix get_map_effective_status RPC guard for cross-tenant.
-- ============================================================

-- ── 1. flow_map_hosts ──
DROP POLICY IF EXISTS fmh_manage ON public.flow_map_hosts;

CREATE POLICY fmh_insert ON public.flow_map_hosts
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    ((tenant_id = jwt_tenant_id()) AND (has_role(auth.uid(), tenant_id, 'admin'::app_role) OR has_role(auth.uid(), tenant_id, 'editor'::app_role)))
    OR is_super_admin(auth.uid())
  );

CREATE POLICY fmh_update ON public.flow_map_hosts
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    ((tenant_id = jwt_tenant_id()) AND (has_role(auth.uid(), tenant_id, 'admin'::app_role) OR has_role(auth.uid(), tenant_id, 'editor'::app_role)))
    OR is_super_admin(auth.uid())
  )
  WITH CHECK (
    ((tenant_id = jwt_tenant_id()) AND (has_role(auth.uid(), tenant_id, 'admin'::app_role) OR has_role(auth.uid(), tenant_id, 'editor'::app_role)))
    OR is_super_admin(auth.uid())
  );

CREATE POLICY fmh_delete ON public.flow_map_hosts
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (
    ((tenant_id = jwt_tenant_id()) AND (has_role(auth.uid(), tenant_id, 'admin'::app_role) OR has_role(auth.uid(), tenant_id, 'editor'::app_role)))
    OR is_super_admin(auth.uid())
  );

-- ── 2. flow_map_links ──
DROP POLICY IF EXISTS fml_manage ON public.flow_map_links;

CREATE POLICY fml_insert ON public.flow_map_links
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    ((tenant_id = jwt_tenant_id()) AND (has_role(auth.uid(), tenant_id, 'admin'::app_role) OR has_role(auth.uid(), tenant_id, 'editor'::app_role)))
    OR is_super_admin(auth.uid())
  );

CREATE POLICY fml_update ON public.flow_map_links
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    ((tenant_id = jwt_tenant_id()) AND (has_role(auth.uid(), tenant_id, 'admin'::app_role) OR has_role(auth.uid(), tenant_id, 'editor'::app_role)))
    OR is_super_admin(auth.uid())
  )
  WITH CHECK (
    ((tenant_id = jwt_tenant_id()) AND (has_role(auth.uid(), tenant_id, 'admin'::app_role) OR has_role(auth.uid(), tenant_id, 'editor'::app_role)))
    OR is_super_admin(auth.uid())
  );

CREATE POLICY fml_delete ON public.flow_map_links
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (
    ((tenant_id = jwt_tenant_id()) AND (has_role(auth.uid(), tenant_id, 'admin'::app_role) OR has_role(auth.uid(), tenant_id, 'editor'::app_role)))
    OR is_super_admin(auth.uid())
  );

-- ── 3. flow_map_link_items ──
DROP POLICY IF EXISTS fmli_manage ON public.flow_map_link_items;

CREATE POLICY fmli_insert ON public.flow_map_link_items
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    ((tenant_id = jwt_tenant_id()) AND (has_role(auth.uid(), tenant_id, 'admin'::app_role) OR has_role(auth.uid(), tenant_id, 'editor'::app_role)))
    OR is_super_admin(auth.uid())
  );

CREATE POLICY fmli_update ON public.flow_map_link_items
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    ((tenant_id = jwt_tenant_id()) AND (has_role(auth.uid(), tenant_id, 'admin'::app_role) OR has_role(auth.uid(), tenant_id, 'editor'::app_role)))
    OR is_super_admin(auth.uid())
  )
  WITH CHECK (
    ((tenant_id = jwt_tenant_id()) AND (has_role(auth.uid(), tenant_id, 'admin'::app_role) OR has_role(auth.uid(), tenant_id, 'editor'::app_role)))
    OR is_super_admin(auth.uid())
  );

CREATE POLICY fmli_delete ON public.flow_map_link_items
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (
    ((tenant_id = jwt_tenant_id()) AND (has_role(auth.uid(), tenant_id, 'admin'::app_role) OR has_role(auth.uid(), tenant_id, 'editor'::app_role)))
    OR is_super_admin(auth.uid())
  );

-- ── 4. flow_map_cables ──
DROP POLICY IF EXISTS cable_manage ON public.flow_map_cables;

CREATE POLICY cable_insert ON public.flow_map_cables
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    ((tenant_id = jwt_tenant_id()) AND (has_role(auth.uid(), tenant_id, 'admin'::app_role) OR has_role(auth.uid(), tenant_id, 'editor'::app_role)))
    OR is_super_admin(auth.uid())
  );

CREATE POLICY cable_update ON public.flow_map_cables
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    ((tenant_id = jwt_tenant_id()) AND (has_role(auth.uid(), tenant_id, 'admin'::app_role) OR has_role(auth.uid(), tenant_id, 'editor'::app_role)))
    OR is_super_admin(auth.uid())
  )
  WITH CHECK (
    ((tenant_id = jwt_tenant_id()) AND (has_role(auth.uid(), tenant_id, 'admin'::app_role) OR has_role(auth.uid(), tenant_id, 'editor'::app_role)))
    OR is_super_admin(auth.uid())
  );

CREATE POLICY cable_delete ON public.flow_map_cables
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (
    ((tenant_id = jwt_tenant_id()) AND (has_role(auth.uid(), tenant_id, 'admin'::app_role) OR has_role(auth.uid(), tenant_id, 'editor'::app_role)))
    OR is_super_admin(auth.uid())
  );

-- ── 5. flow_map_ctos ──
DROP POLICY IF EXISTS cto_manage ON public.flow_map_ctos;

CREATE POLICY cto_insert ON public.flow_map_ctos
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    ((tenant_id = jwt_tenant_id()) AND (has_role(auth.uid(), tenant_id, 'admin'::app_role) OR has_role(auth.uid(), tenant_id, 'editor'::app_role)))
    OR is_super_admin(auth.uid())
  );

CREATE POLICY cto_update ON public.flow_map_ctos
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    ((tenant_id = jwt_tenant_id()) AND (has_role(auth.uid(), tenant_id, 'admin'::app_role) OR has_role(auth.uid(), tenant_id, 'editor'::app_role)))
    OR is_super_admin(auth.uid())
  )
  WITH CHECK (
    ((tenant_id = jwt_tenant_id()) AND (has_role(auth.uid(), tenant_id, 'admin'::app_role) OR has_role(auth.uid(), tenant_id, 'editor'::app_role)))
    OR is_super_admin(auth.uid())
  );

CREATE POLICY cto_delete ON public.flow_map_ctos
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (
    ((tenant_id = jwt_tenant_id()) AND (has_role(auth.uid(), tenant_id, 'admin'::app_role) OR has_role(auth.uid(), tenant_id, 'editor'::app_role)))
    OR is_super_admin(auth.uid())
  );

-- ── 6. Fix get_map_effective_status: allow cross-tenant via has_resource_access ──
CREATE OR REPLACE FUNCTION public.get_map_effective_status(p_map_id uuid)
 RETURNS TABLE(host_id uuid, effective_status text, is_root_cause boolean, depth integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET row_security TO 'on'
AS $$
WITH
guard AS (
  SELECT m.id
  FROM public.flow_maps m
  WHERE m.id = p_map_id
    AND (
      m.tenant_id = public.jwt_tenant_id()
      OR public.is_super_admin(auth.uid())
      OR public.has_resource_access(auth.uid(), m.tenant_id, 'flow_map'::text, m.id)
    )
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
  WITH RECURSIVE r(id, depth, visited) AS (
    SELECT s.id, 0, ARRAY[s.id] FROM seed s
    UNION ALL
    SELECT
      CASE WHEN l.origin_host_id = r.id THEN l.dest_host_id ELSE l.origin_host_id END,
      r.depth + 1,
      r.visited || CASE WHEN l.origin_host_id = r.id THEN l.dest_host_id ELSE l.origin_host_id END
    FROM r
    JOIN public.flow_map_links l
      ON l.map_id = p_map_id
     AND (l.origin_host_id = r.id OR l.dest_host_id = r.id)
    JOIN map_nodes nb
      ON nb.id = CASE WHEN l.origin_host_id = r.id THEN l.dest_host_id ELSE l.origin_host_id END
    WHERE nb.current_status <> 'DOWN'
      AND NOT (CASE WHEN l.origin_host_id = r.id THEN l.dest_host_id ELSE l.origin_host_id END = ANY(r.visited))
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
