
CREATE OR REPLACE VIEW public.vw_financial_daily_performance
WITH (security_invoker = on)
AS
WITH daily_agg AS (
  SELECT
    tenant_id,
    transaction_date AS date,
    scenario,
    SUM(CASE WHEN type = 'RECEBER' THEN amount ELSE 0 END) AS total_receber,
    SUM(CASE WHEN type = 'PAGAR' THEN amount ELSE 0 END) AS total_pagar,
    SUM(CASE WHEN type = 'RECEBER' THEN amount ELSE -amount END) AS daily_net_flow
  FROM public.financial_transactions
  GROUP BY tenant_id, transaction_date, scenario
),
with_running AS (
  SELECT
    tenant_id,
    date,
    scenario,
    total_receber,
    total_pagar,
    daily_net_flow,
    SUM(daily_net_flow) OVER (
      PARTITION BY tenant_id, scenario
      ORDER BY date
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS running_balance
  FROM daily_agg
),
pivoted AS (
  SELECT
    r.tenant_id,
    r.date,
    r.scenario,
    r.total_receber,
    r.total_pagar,
    r.daily_net_flow,
    r.running_balance,
    r.running_balance - COALESCE(
      (SELECT p.running_balance
       FROM with_running p
       WHERE p.tenant_id = r.tenant_id
         AND p.date = r.date
         AND p.scenario = 'PREVISTO'),
      0
    ) AS variance
  FROM with_running r
)
SELECT * FROM pivoted;

GRANT SELECT ON public.vw_financial_daily_performance TO authenticated;
GRANT SELECT ON public.vw_financial_daily_performance TO anon;
