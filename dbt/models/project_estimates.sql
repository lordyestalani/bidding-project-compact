with rate as (
    select rate, observation_date
    from {{ source('analytics', 'fx_rates') }}
    where observation_date <= (now() at time zone 'Asia/Manila')::date
    order by observation_date desc limit 1
), values as (
    select t.*, r.rate, r.observation_date,
        complete and (r.rate is not null or (in_usd = 0 and out_usd = 0)) as available
    from {{ ref('project_totals') }} t left join rate r on true
)
select *,
    case when available then round(in_php + in_usd * coalesce(rate, 0), 4) end as incoming_php,
    case when available then round(out_php + out_usd * coalesce(rate, 0), 4) end as outgoing_php,
    case when available then round(in_php - out_php + (in_usd - out_usd) * coalesce(rate, 0), 4) end as profit_php,
    case when complete then in_usd - out_usd end as net_usd
from values
