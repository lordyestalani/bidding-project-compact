FROM apache/airflow:3.3.2-python3.12
USER root
RUN python -m venv /opt/pipeline-env && chown -R airflow:0 /opt/pipeline-env
USER airflow
COPY pipeline/requirements.txt /tmp/pipeline-requirements.txt
RUN /opt/pipeline-env/bin/pip install --no-cache-dir -r /tmp/pipeline-requirements.txt
WORKDIR /app
COPY --chown=airflow:0 api /app/api
COPY --chown=airflow:0 pipeline /app/pipeline
COPY --chown=airflow:0 dbt /app/dbt
COPY --chown=airflow:0 db /app/db
ENV PYTHONPATH=/app DBT_BIN=/opt/pipeline-env/bin/dbt DBT_TARGET_PATH=/tmp/dbt-target DBT_LOG_PATH=/tmp/dbt-logs
ENTRYPOINT []
CMD ["python", "-m", "pipeline.airflow_start"]
