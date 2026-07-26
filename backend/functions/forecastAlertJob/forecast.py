import time
import requests

from config import PREDICT_FORECAST_URL


def generate_forecast(db):
    """
    Triggers the predictforecast function and
    returns the latest forecast stored in forecast_results.
    """

    response = requests.post(
        PREDICT_FORECAST_URL,
        timeout=60
    )

    response.raise_for_status()

    # Wait for predictforecast to save the result
    for _ in range(10):

        forecast = db.get_latest_forecast()

        if forecast is not None:
            return forecast

        time.sleep(2)

    raise Exception("Forecast generation failed. No forecast found.")