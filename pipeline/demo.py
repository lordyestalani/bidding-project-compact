"""Create three clearly labeled sample budgets through the API. No fake FX data."""

import json
import os
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from uuid import NAMESPACE_URL, uuid5


def main():
    base = os.environ.get("API_BASE_URL", "http://api:8000").rstrip("/")
    if urlparse(base).hostname not in ("api", "127.0.0.1", "localhost"):
        raise ValueError("Demo loading is limited to the local application.")

    def send(path, body, method="POST"):
        request = Request(
            base + "/api" + path,
            data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json"},
            method=method,
        )
        with urlopen(request, timeout=10) as response:
            return json.load(response)

    samples = [
        (
            "USD customer",
            [
                ("Customer payment", "incoming", "USD", "100000"),
                ("Supplier costs", "outgoing", "PHP", "5000000"),
            ],
        ),
        (
            "USD supplier",
            [
                ("Customer payment", "incoming", "PHP", "6000000"),
                ("Supplier quote", "outgoing", "USD", "90000"),
            ],
        ),
        (
            "PHP only",
            [
                ("Customer payment", "incoming", "PHP", "2000000"),
                ("Supplier costs", "outgoing", "PHP", "1500000"),
            ],
        ),
    ]
    created = 0
    for name, lines in samples:
        project = send(
            "/projects",
            {
                "name": "[Sample] " + name,
                "request_id": str(uuid5(NAMESPACE_URL, "bidding-fx-demo-v1/" + name)),
            },
        )
        if project["version"] != 1:
            continue
        send(
            "/projects/" + project["id"],
            {
                "name": project["name"],
                "customer": "Fictional customer",
                "notes": "Synthetic sample budget. Scenario rates are hypothetical.",
                "version": project["version"],
                "lines": [
                    {
                        "label": label,
                        "direction": direction,
                        "currency": currency,
                        "amount": amount,
                    }
                    for label, direction, currency, amount in lines
                ],
            },
            "PUT",
        )
        created += 1
    print(
        f"{created} sample budgets prepared. Existing edited samples were preserved. No FX observations were created."
    )


if __name__ == "__main__":
    main()
