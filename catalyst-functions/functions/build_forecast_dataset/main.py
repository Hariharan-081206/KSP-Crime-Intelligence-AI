import zcatalyst_sdk
import json
from collections import defaultdict

def handler(context, basicio):

    try:

        app = zcatalyst_sdk.initialize()
        zcql = app.zcql()

        rows = zcql.execute_query("""
        SELECT policestationid,
               crimeregistereddate
        FROM casemaster
        """)

        counts = defaultdict(int)

        for row in rows:

            case = row["casemaster"]

            station = case.get("policestationid")

            date = str(
                case.get("crimeregistereddate")
            )[:10]

            counts[(station,date)] += 1

        forecastid = 1

        for key,count in counts.items():

            station,date = key

            zcql.execute_query(f"""
            INSERT INTO crimeforecast
            (
                forecastid,
                districtid,
                incidentdate,
                crimecount
            )
            VALUES
            (
                {forecastid},
                1,
                '{date}',
                {count}
            )
            """)

            forecastid += 1

        basicio.write(json.dumps({
            "status":"success",
            "rows":len(counts)
        }))

    except Exception as e:

        basicio.write(json.dumps({
            "status":"error",
            "message":str(e)
        }))

    context.close()