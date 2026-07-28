import zcatalyst_sdk
import json

def handler(context,basicio):

    try:

        app = zcatalyst_sdk.initialize()
        zcql = app.zcql()

        rows = zcql.execute_query("""
        SELECT *
        FROM earlywarnings
        """)

        resultid = 1

        for row in rows:

            e = row["earlywarnings"]

            explanation=f"""
            Forecast exceeds historical average by
            {increase} incidents.
            """

            zcql.execute_query(f"""
            INSERT INTO forecast_results
            (
                resultid,
                districtid,
                predictedcrime,
                risklevel,
                explanation
            )
            VALUES
            (
                {resultid},
                {e["districtid"]},
                {e["predictedcount"] or 0},
                '{e["risklevel"]}',
                '{explanation.replace("'", "''")}'
            )
            """)

            resultid += 1

        basicio.write(json.dumps({
            "status":"success",
            "results":resultid-1
        }))

    except Exception as e:

        basicio.write(json.dumps({
            "status":"error",
            "message":str(e)
        }))

    context.close()