{% test has_rows(model) %}
select 1 where not exists (select 1 from {{ model }})
{% endtest %}

{% test valid_fx(model) %}
select * from {{ model }}
where base <> 'USD' or quote <> 'PHP' or rate <= 0 or rate >= 1000000000000
    or scale(rate) > 8
    or observation_date > (now() at time zone 'Asia/Manila')::date
{% endtest %}
