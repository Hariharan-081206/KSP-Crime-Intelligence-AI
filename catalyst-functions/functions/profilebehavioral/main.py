import zcatalyst_sdk
import json
from collections import defaultdict

def handler(context, basicio):

    try:

        app = zcatalyst_sdk.initialize()

        zcql = app.zcql()

        accused_rows = zcql.execute_query("""
        SELECT accusedmasterid,
        casemasterid
        FROM accused
        """)

        offender_case_count =defaultdict(int)

        for row in accused_rows:

            accusedid = int(
                row["accused"]["accusedmasterid"]
            )

            offender_case_count[accusedid]+=1

        inserted = 0
        updated = 0

        for accusedid, casescount in offender_case_count.items():

            if casescount >= 5:
                risk = "HIGH"

            elif casescount >=2:
                risk = "MEDIUM"

            else:
                risk = "LOW"

            existing = zcql.execute_query(f"""
                SELECT ROWID
                FROM offenderprofiles
                WHERE offenderid = {accusedid}
            """)

            if existing:

                rowid = existing[0]["offenderprofiles"]["ROWID"]

                zcql.execute_query(f"""
            INSERT INTO behavioral_clusters
            (
            accusedmasterid,
            casescount,
            risklevel
            )
            VALUES
            (
            {accusedid},
            {casescount},
            '{risk}'
            )
            """)

                updated += 1

            else:

                zcql.execute_query(f"""
                    INSERT INTO offenderprofiles
                    (
                        offenderid,
                        casescount,
                        risklevel
                    )
                    VALUES
                    (
                        {accusedid},
                        {casescount},
                        '{risk}'
                    )
                """)

                inserted += 1

        basicio.write(json.dumps({
            "status": "success",
            "inserted": inserted,
            "updated": updated,
            "total_processed": len(offender_case_count)
        }))

    except Exception as e:

        basicio.write(json.dumps({
            "status": "error",
            "message": str(e)
        }))

    context.close()