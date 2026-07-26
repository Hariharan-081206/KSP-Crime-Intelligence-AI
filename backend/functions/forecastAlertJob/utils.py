from datetime import datetime

def get_current_time():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

def risk_level(prediction):

    prediction = float(prediction)

    if prediction >= 40:
        return "CRITICAL"

    if prediction >= 20:
        return "HIGH"

    if prediction >= 10:
        return "MEDIUM"

    return "LOW"
