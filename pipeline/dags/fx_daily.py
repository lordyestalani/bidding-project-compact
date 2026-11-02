"""One daily task runs the same checked path as a manual FX backfill."""

from datetime import timedelta
import subprocess

import pendulum
from airflow.sdk import DAG, task, get_current_context
from airflow.timetables.interval import CronDataIntervalTimetable

from pipeline.schedule import previous_day

with DAG(
    dag_id="fx_daily",
    schedule=CronDataIntervalTimetable("0 8 * * *", timezone="Asia/Manila"),
    start_date=pendulum.datetime(2026, 1, 1, tz="Asia/Manila"),
    catchup=False,
    max_active_runs=1,
    is_paused_upon_creation=False,
    default_args={
        "retries": 2,
        "retry_delay": timedelta(minutes=5),
        "execution_timeout": timedelta(minutes=15),
    },
    tags=["portfolio", "fx"],
) as dag:

    @task
    def update_fx():
        day = previous_day(get_current_context()["data_interval_end"])
        subprocess.run(
            [
                "/opt/pipeline-env/bin/python",
                "-m",
                "pipeline.run",
                "--start",
                str(day),
                "--end",
                str(day),
            ],
            check=True,
        )

    update_fx()
