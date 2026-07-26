import zcatalyst_sdk
import json
from datetime import datetime


def handler(context, basicio):

    try:

        app = zcatalyst_sdk.initialize()

        zcql = app.zcql()

        cases = zcql.execute_query("""
        SELECT *
        FROM casemaster
        LIMIT 50
        """)

        processed = 0

        for row in cases:

            case = row["casemaster"]

            casemasterid = case.get("casemasterid")
            crimeno = case.get("crimeno")
            caseno = case.get("caseno")
            latitude = case.get("latitude")
            longitude = case.get("longitude")
            facts = case.get("brieffacts")
            documentid = int(datetime.now().timestamp() * 1000) + processed
            document_text = f"""
Crime No: {crimeno}
Case No: {caseno}
Latitude: {latitude}
Longitude: {longitude}
Facts: {facts}
"""

            zcql.execute_query(f"""
            INSERT INTO crimedocuments
            (
                documentid,
                casemasterid,
                documenttext,
                embedding
            )
            VALUES
            (
                {documentid},
                {casemasterid},
                '{document_text.replace("'", "''")}',
                'PENDING'
            )
            """)
            processed += 1

        basicio.write(
            json.dumps({
                "status": "success",
                "processed_cases": processed
            })
        )

    except Exception as e:

        basicio.write(
            json.dumps({
                "status": "error",
                "message": str(e)
            })
        )

    context.close()