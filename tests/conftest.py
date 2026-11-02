import os
from pathlib import Path
from urllib.parse import urlparse

import pytest


@pytest.fixture(scope="session")
def prepared_database():
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip(
            "Set TEST_DATABASE_URL to the isolated bidding_simple_test database."
        )
    if urlparse(url).path != "/bidding_simple_test":
        raise RuntimeError("Tests only reset bidding_simple_test.")
    import psycopg
    from pipeline.run import dbt

    with psycopg.connect(url, autocommit=True) as conn:
        conn.execute("SELECT pg_advisory_lock(7241999)")
        conn.execute(
            "DROP SCHEMA IF EXISTS analytics CASCADE; DROP SCHEMA IF EXISTS app CASCADE; DROP SCHEMA IF EXISTS raw CASCADE; DROP SCHEMA IF EXISTS ops CASCADE"
        )
        conn.execute(Path("db/schema.sql").read_text())
        dbt(["run", "--select", "project_totals", "project_estimates"], url)
        yield url


@pytest.fixture
def database(prepared_database):
    import psycopg

    with psycopg.connect(prepared_database) as conn:
        conn.execute("TRUNCATE app.projects,ops.runs CASCADE")
    return prepared_database


@pytest.fixture
def client(database):
    from fastapi.testclient import TestClient
    from api.main import create_app

    with TestClient(create_app(database)) as value:
        yield value
