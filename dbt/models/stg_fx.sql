select o.*
from {{ source('raw', 'observations') }} o
join {{ source('ops', 'runs') }} r on r.id = o.run_id
where o.run_id = '{{ var("run_id", "00000000-0000-0000-0000-000000000000") }}'::uuid
  and o.observation_date <= r.end_date
