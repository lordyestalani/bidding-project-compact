"""Write the generated local password without exposing it in command output."""

import json
import os
from pathlib import Path

path = Path(os.environ["AIRFLOW__CORE__SIMPLE_AUTH_MANAGER_PASSWORDS_FILE"])
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps({"admin": os.environ["AIRFLOW_PASSWORD"]}))
path.chmod(0o600)
os.execvp("airflow", ["airflow", "standalone"])
