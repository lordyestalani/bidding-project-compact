"""Idempotent first setup. Never resets projects or published rates."""

import os
import psycopg
from pipeline.run import ROOT, dbt

if __name__ == "__main__":
    url = os.environ["DATABASE_URL"]
    with psycopg.connect(url) as conn:
        conn.execute((ROOT / "db/schema.sql").read_text())
    dbt(["build", "--select", "project_totals", "project_estimates"], url)
    print("Schema and reporting views ready. Existing data preserved.")
