# A short walk through the code

Read these in order. There is one source, one currency pair, and one daily DAG.

## 1. Fetch and preserve the source

`pipeline/source.py` requests USD/PHP observations from the fixed ECB route.
JSON numbers are parsed as Decimal, not floats. The response includes an actual
observation date; a Sunday request may return Friday's rate.

`pipeline/run.py` creates a run, then saves each original response in
`raw.responses` **before** parsing it. Its URL, fetched timestamp, body, and SHA-256
checksum explain where a rate came from. Validated rows enter `raw.observations`
with the run and response IDs. A database lock serializes pipeline executions.

## 2. Stage, check, publish

`dbt/models/stg_fx.sql` selects one explicit run. Its attached tests in
`dbt/models/sources.yml` and `dbt/macros/checks.sql` check nonempty results, unique
dates, nonnull/positive rates, currency pair, and valid observation dates.

Only after `dbt build --select stg_fx` succeeds does `pipeline/run.py` merge the
observations into `analytics.fx_rates` and mark the run successful in the same
transaction. Older retrieved data cannot replace newer retrieved data. Identical
reruns leave one published row per observation date. Raw responses and run-linked
candidates remain available for tracing corrections.

A failed fetch, parse, or dbt check records a failed run and keeps the previous
published rates. There is no separate batch manifest or historical restatement
system. `pipeline/dags/fx_daily.py` schedules this same path at 08:00 Manila time.
`pipeline/schedule.py` selects the preceding calendar day.

## 3. Turn projects into useful results

`db/schema.sql` defines projects and cash-flow lines. `api/models.py` validates
the inputs; `api/store.py` saves a complete project budget in one transaction.
An internal version prevents a stale tab from overwriting newer changes. Creation
request IDs allow a retry without creating the same project twice.

`dbt/models/project_totals.sql` aggregates incoming/outgoing PHP and USD independently.
It also marks an empty or incomplete budget. `project_estimates.sql` applies the
latest published observation on or before today's Manila date. Both are views,
so saved cash-flow changes appear immediately.

For rate **R** in PHP per USD:

```text
Incoming PHP = incoming PHP amounts + incoming USD amounts × R
Outgoing PHP = outgoing PHP amounts + outgoing USD amounts × R
Profit PHP   = incoming PHP equivalent − outgoing PHP equivalent
FX exposure  = incoming USD amounts − outgoing USD amounts
```

Missing amounts are unknown, never silently zero. A PHP-only project needs no FX
rate. Products and sums remain exact before the final four-place API rounding.

## 4. Simulate without changing facts

`api/main.py` exposes project endpoints and a read-only scenario POST. Scenarios
use the same dbt totals with `api/valuation.py`'s Decimal calculation. Integration
tests reconcile that result with the current SQL result at the same rate.

`web/src/App.tsx` selects projects and displays their saved results.
`ProjectEditor.tsx` edits their planned cash flows. `Simulation.tsx` connects the
slider and exact numeric input to the scenario endpoint, discards superseded
responses, and labels the result hypothetical. `api.ts` formats decimal strings
for display without floating-point money rounding.

`api/history.py` applies the same budget arithmetic to published rates from the
last 90 days. `web/src/ProfitChart.tsx` draws the profit/loss line, a zero reference,
and the slider's hypothetical profit level using SVG, without another dependency.
The chart polls the local published data every minute while visible. It uses the
current budget throughout; it does not reconstruct old versions or store profit
snapshots. Source update failures keep the last chart with an explicit warning.
Observation-table profits use the same two-decimal display as the other cards;
API values retain four decimal places. A newly published reference rate refreshes
the project and resets the scenario to that reference rate.

## Three examples you can explain by hand

All rates here are **hypothetical**, not downloaded observations.

| Cash flows | Profit at 55 | Profit at 58 | Why it changes |
| --- | --- | --- | --- |
| USD 100,000 incoming; PHP 5,000,000 outgoing | PHP 500,000 | PHP 800,000 | Net USD 100,000 × rate increase of 3 = PHP 300,000 increase |
| PHP 6,000,000 incoming; USD 90,000 outgoing | PHP 1,050,000 | PHP 780,000 | Net USD −90,000 × 3 = PHP 270,000 decrease |
| PHP 2,000,000 incoming; PHP 1,500,000 outgoing | PHP 500,000 | PHP 500,000 | No USD exposure |

For the first example at 58: incoming is 100,000 × 58 = 5,800,000; subtract
5,000,000 outgoing to get 800,000. The USD-supplier example has the opposite
exposure: a stronger dollar increases costs rather than revenue.

## How to demonstrate it

1. Start the app, load the labeled samples, and fetch a recent real FX interval.
2. Open the USD-customer sample and explain incoming/outgoing/profit.
3. Set the simulation to 55 and 58 and reproduce the first example above.
4. Open the USD-supplier sample and explain why the direction reverses.
5. Show a pipeline run and follow its run ID through raw responses, staged rows,
   and published rates. Rerun the interval and inspect the unchanged logical count.
6. Explain the failure test: a rejected candidate cannot replace a good rate.

The app's API docs show request shapes. The tests provide the executable examples.
That is the whole demonstration; payment accounting is outside this project's scope.
