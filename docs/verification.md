# Verification

Verified locally on 2026-11-02. These are results for the smaller rebuild, not
copied acceptance counts from the original project.

| Check | Result |
| --- | --- |
| Python, API, real PostgreSQL/dbt integration, including FX profit history | 37 passed |
| React interaction tests, including chart and polling | 14 passed |
| TypeScript check and Vite production build | Passed |
| Browser journey against isolated test API/database | 1 passed |
| Initial `Start.ps1`, schema/reporting setup, four service health checks | Passed |
| `Stop.ps1` then `Start.ps1 -SkipBuild` | All 3 saved sample projects preserved |
| Repeated synthetic project loader | 3 prepared, then 0 |
| Real ECB/Frankfurter ingestion for 2026-10-30 through 2026-11-01 | Published successfully |
| Airflow DAG import | No import errors |
| Actual `airflow dags test fx_daily 2026-11-02` execution | Task and DAG succeeded |

The browser journey covers creation, incoming USD/outgoing PHP, saving/reloading,
numeric and slider simulation, reset, editing costs, archive/restore, and a
390-pixel viewport without page overflow. Financial examples are independently
specified in the tests. Browser fixtures are explicitly synthetic and isolated
from the application's real FX observations.

The 90-day chart addition was verified against three independently calculated
profit/loss points, PHP-only flat results, incomplete budgets, date bounds,
future/old-observation exclusion, and read-only project facts. UI tests cover
empty/single-point charts, scenario overlays, stale-result warnings, version
conflicts, visible-page polling, and pausing in hidden pages. The browser journey
checks the rendered historical SVG and the scenario line moving with the rate.
The app has 63 real observations in its current 90-day window after a source
backfill. An independent focused chart review found no Critical/Important issues.

One browser assertion initially treated a horizontal SVG line's zero-height box
as invisible. The test now verifies its rendered stroke and changing position;
the browser journey passed afterward, including the final mobile label adjustment.

A minor interaction remains: a newly published daily reference rate refreshes the
project and resets the active slider scenario. Profits display in cents while API
calculations retain four places; the chart description and docs explain this.

The real source run exposed a Sunday request returning a Friday anchor. The
parser was corrected, a regression test was observed failing then passing, and
the actual DAG was rerun successfully. The original observation date is retained.

An independent read-only review identified three frontend defects. Each was
reproduced with a failing test and fixed: navigation during an in-flight save,
resetting an unchanged scenario rate, and a late refresh overriding the archive
filter. All nine UI tests and the full browser journey passed afterward.

One intermediate test run was invalidated by overlapping a PostgreSQL restart
with integration tests. The final documented command ran serially and passed.

## Additional coverage left for later

- Reject a deliberately invalid candidate using a real failing dbt test; the
  existing failure-retention integration test injects a failed check callback.
- Exercise concurrent pipeline runs and older retrieval timestamps explicitly;
  the protections are implemented but do not yet have dedicated race tests.
- Assert DAG timetable/retry/catchup settings automatically; date arithmetic and
  real DAG import/execution are verified.

## Implementation decisions

- Rebuilt directly at the workspace root and removed the old local source after
  the user explicitly authorized a clean slate and confirmed having another copy.
  The original is no longer available in this folder.
- Used file-based review and tests because the downloaded folder had no Git
  metadata when implementation started. At handoff it has an empty `main`
  repository with all source uncommitted and no remote. No commits, worktrees,
  remote pushes, or pull requests were created by this implementation.
- Updated the earlier nested `portfolio/` plan to a root layout under that later
  instruction. Nothing depends on files outside the project.
- Used the official Airflow standalone mode to keep the local educational setup
  small. A production deployment would need a different operational design.
- Kept working notes in ignored `.superpowers/` rather than Git-based helper
  records. This workspace has no commit history for the implementation session.
- Kept public authentication, actual payments, forecasts, holiday-adjusted feeds,
  and project history outside the approved scope. This is a local planned-cash-flow
  demonstration; public multiuser hosting and accounting are separate future work.
