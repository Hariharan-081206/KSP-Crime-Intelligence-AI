

from config import LOW_THRESHOLD, MEDIUM_THRESHOLD, HIGH_THRESHOLD


def calculate_risk(prediction):

    prediction = float(prediction)

    if prediction >= HIGH_THRESHOLD:
        return "CRITICAL"

    elif prediction >= MEDIUM_THRESHOLD:
        return "HIGH"

    elif prediction >= LOW_THRESHOLD:
        return "MEDIUM"

    return "LOW"


def should_generate_alert(prediction):

    prediction = float(prediction)

    return prediction >= MEDIUM_THRESHOLD


def generate_recommendation(risk):

    recommendations = {

        "LOW":
            "Continue routine monitoring.",

        "MEDIUM":
            "Increase police patrol frequency.",

        "HIGH":
            "Deploy additional patrol units and monitor hotspot areas.",

        "CRITICAL":
            "Immediate district-level intervention required. Deploy rapid response teams."

    }

    return recommendations[risk]

