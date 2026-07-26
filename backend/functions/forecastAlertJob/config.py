import os
from dotenv import load_dotenv

load_dotenv()

PREDICT_FORECAST_URL = os.getenv("PREDICT_FORECAST_URL")

PREDICT_EXPLAIN_URL = os.getenv("PREDICT_EXPLAIN_URL")

LOW_THRESHOLD = 10
MEDIUM_THRESHOLD = 20
HIGH_THRESHOLD = 40

FORECAST_TABLE = "forecast_results"
EARLY_WARNING_TABLE = "earlywarnings"

DEFAULT_RECOMMENDATION = "Increase police patrol in predicted hotspot."