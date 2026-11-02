select p.id as project_id,
    count(c.project_id) > 0 and count(c.project_id) = count(c.amount) as complete,
    coalesce(sum(c.amount) filter (where c.direction = 'incoming' and c.currency = 'PHP'), 0) as in_php,
    coalesce(sum(c.amount) filter (where c.direction = 'incoming' and c.currency = 'USD'), 0) as in_usd,
    coalesce(sum(c.amount) filter (where c.direction = 'outgoing' and c.currency = 'PHP'), 0) as out_php,
    coalesce(sum(c.amount) filter (where c.direction = 'outgoing' and c.currency = 'USD'), 0) as out_usd
from {{ source('app', 'projects') }} p
left join {{ source('app', 'cash_flows') }} c on c.project_id = p.id
group by p.id
