import zcatalyst_sdk
import requests
import json
import os
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()

ENDPOINT_URL = "https://api.catalyst.zoho.in/quickml/v1/project/54650000000013025/endpoints/predict"
ENDPOINT_KEY = "9e41a5fc3b041bf5c5ea90a6915b3cffe4133a4229495112ac135..."


def handler(context, basicio):

    try:

        app = zcatalyst_sdk.initialize()

        datastore = app.datastore()

        table = datastore.table("forecast_results")

        future_date = (
            datetime.now() + timedelta(days=30)
        ).strftime("%Y-%m-%d")

        payload = {
            "data": {
                "casemaster__crimeregistereddate": future_date
            }
        }

        headers = {
            "X-QUICKML-ENDPOINT-KEY": ENDPOINT_KEY
        }

        response = requests.post(
            ENDPOINT_URL,
            headers=headers,
            json=payload
        )

        result = response.json()

        predicted = result["result"][future_date]

        if predicted >= 40:
            risk = "CRITICAL"
        elif predicted >= 20:
            risk = "HIGH"
        elif predicted >= 10:
            risk = "MEDIUM"
        else:
            risk = "LOW"

        row = {
            "districtid": 26,
            "predictedcrime": float(predicted),
            "risklevel": risk,
            "explanation": "Generated from QuickML Forecasting Endpoint"
        }

        inserted = table.insert_row(row)

        basicio.write(json.dumps({
            "status": "success",
            "forecast": predicted,
            "risklevel": risk,
            "resultid": inserted["ROWID"]
        }))

    except Exception as e:

        basicio.write(json.dumps({
            "status": "error",
            "message": str(e)
        }))

    context.close()