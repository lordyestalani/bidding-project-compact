"""Fetch -> retain -> stage -> dbt check -> atomically publish."""

import argparse
import hashlib
import json
import os
from datetime import date
from pathlib import Path
import shutil
import subprocess
from urllib.parse import unquote, urlparse
from uuid import uuid4

import psycopg

from pipeline.source import fetch as source_fetch, parse_rates, validate_window

ROOT = Path(__file__).resolve().parents[1]


def dbt(command: list[str], database_url: str):
    parts = urlparse(database_url)
    env = os.environ | {
        "DB_HOST": parts.hostname or "",
        "DB_PORT": str(parts.port or 5432),
        "DB_USER": unquote(parts.username or ""),
        "DB_PASSWORD": unquote(parts.password or ""),
        "DB_NAME": parts.path.lstrip("/"),
    }
    binary = os.environ.get("DBT_BIN") or shutil.which("dbt")
    if not binary:
        raise RuntimeError("dbt is not installed; use the pipeline container.")
    result = subprocess.run(
        [
            binary,
            *command,
            "--project-dir",
            str(ROOT / "dbt"),
            "--profiles-dir",
            str(ROOT / "dbt"),
            "--no-use-colors",
        ],
        env=env,
        capture_output=True,
        text=True,
        timeout=180,
    )
    if result.returncode:
        # Full diagnostic output is local to the developer, never an API error.
        print(result.stdout[-6000:])
        raise RuntimeError(
            "dbt checks failed; previous published data remains unchanged."
        )


def run(
    start: date,
    end: date,
    database_url: str | None = None,
    *,
    fetch=source_fetch,
    check=None
) -> str:
    validate_window(start, end)
    url = database_url or os.environ["DATABASE_URL"]
    run_id = uuid4()
    # A session lock spans fetch, dbt and publication. The other connections used
    # by dbt never take this lock; every pipeline entry point does.
    with psycopg.connect(url, autocommit=True) as conn:
        conn.execute("SELECT pg_advisory_lock(7241981)")
        conn.execute(
            "INSERT INTO ops.runs(id,start_date,end_date,status) VALUES(%s,%s,%s,'running')",
            (run_id, start, end),
        )
        try:
            observations = {}
            for response in fetch(start, end):
                response_id = uuid4()
                conn.execute(
                    "INSERT INTO raw.responses(id,run_id,url,fetched_at,status_code,checksum,body) VALUES(%s,%s,%s,%s,%s,%s,%s)",
                    (
                        response_id,
                        run_id,
                        response.url,
                        response.fetched_at,
                        response.status_code,
                        hashlib.sha256(response.body).hexdigest(),
                        response.body,
                    ),
                )
                if response.status_code != 200:
                    raise ValueError(
                        "The FX source returned an unsuccessful HTTP response."
                    )
                anchor = "/rate/" in response.url
                rows = parse_rates(
                    response.body,
                    date(1999, 1, 4) if anchor else start,
                    start if anchor else end,
                    allow_empty=not anchor,
                    allow_prior=not anchor,
                )
                for observed, rate in rows:
                    if observed in observations and observations[observed][0] != rate:
                        raise ValueError("Source responses disagree on a rate.")
                    observations[observed] = (rate, response_id, response.fetched_at)
            if not observations:
                raise ValueError("No source observations were fetched.")
            with conn.transaction(), conn.cursor() as cursor:
                cursor.executemany(
                    "INSERT INTO raw.observations(run_id,response_id,observation_date,base,quote,rate,fetched_at) VALUES(%s,%s,%s,'USD','PHP',%s,%s)",
                    [
                        (run_id, response_id, observed, rate, fetched_at)
                        for observed, (
                            rate,
                            response_id,
                            fetched_at,
                        ) in observations.items()
                    ],
                )
            if check is None:
                dbt(
                    [
                        "build",
                        "--select",
                        "stg_fx",
                        "--vars",
                        json.dumps({"run_id": str(run_id)}),
                    ],
                    url,
                )
            else:
                check(str(run_id))
            with conn.transaction():
                cursor = conn.execute(
                    """INSERT INTO analytics.fx_rates(observation_date,rate,run_id,response_id,fetched_at)
                    SELECT observation_date,rate,run_id,response_id,fetched_at FROM raw.observations WHERE run_id=%s
                    ON CONFLICT(observation_date) DO UPDATE SET rate=excluded.rate,run_id=excluded.run_id,
                        response_id=excluded.response_id,fetched_at=excluded.fetched_at
                    WHERE excluded.fetched_at >= analytics.fx_rates.fetched_at""",
                    (run_id,),
                )
                conn.execute(
                    "UPDATE ops.runs SET status='success',finished_at=now(),published_count=%s WHERE id=%s",
                    (cursor.rowcount, run_id),
                )
        except Exception:
            conn.execute(
                "UPDATE ops.runs SET status='failed',finished_at=now(),error='Source fetch, validation, or transformation failed. Last successful rates were retained.' WHERE id=%s",
                (run_id,),
            )
            raise
        finally:
            conn.execute("SELECT pg_advisory_unlock(7241981)")
    return str(run_id)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start", type=date.fromisoformat, required=True)
    parser.add_argument("--end", type=date.fromisoformat, required=True)
    args = parser.parse_args()
    print(run(args.start, args.end))
