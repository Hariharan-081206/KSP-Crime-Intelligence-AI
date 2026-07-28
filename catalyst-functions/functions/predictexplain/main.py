import zcatalyst_sdk
import json
from dotenv import load_dotenv

load_dotenv()

def handler(context, basicio):

    try:

        app = zcatalyst_sdk.initialize()

        zcql = app.zcql()

        rows = zcql.execute_query("""
        SELECT *
        FROM forecast_results
        ORDER BY ROWID DESC
        LIMIT 1
        """)

        if not rows:

            basicio.write(json.dumps({
                "status": "error",
                "message": "No forecast data found"
            }))

            context.close()
            return

        forecast = rows[0]["forecast_results"]

        predicted = float(forecast["predictedcrime"])

        district = forecast["districtid"]

        risk = forecast["risklevel"]

        if risk == "CRITICAL":

            explanation = (
                f"District {district} is forecasted to experience "
                f"{round(predicted)} crimes. Forecast indicates a "
                f"critical crime risk level requiring immediate law "
                f"enforcement attention and resource allocation."
            )

        elif risk == "HIGH":

            explanation = (
                f"District {district} is forecasted to experience "
                f"{round(predicted)} crimes. Crime levels are expected "
                f"to remain high and require enhanced monitoring."
            )

        elif risk == "MEDIUM":

            explanation = (
                f"District {district} is forecasted to experience "
                f"{round(predicted)} crimes. Moderate criminal activity "
                f"is anticipated."
            )

        else:

            explanation = (
                f"District {district} is forecasted to experience "
                f"{round(predicted)} crimes. Current trends suggest "
                f"relatively low criminal activity."
            )

        basicio.write(json.dumps({
            "status": "success",
            "districtid": district,
            "predictedcrime": predicted,
            "risklevel": risk,
            "explanation": explanation
        }))

    except Exception as e:

        basicio.write(json.dumps({
            "status": "error",
            "message": str(e)
        }))

    context.close()