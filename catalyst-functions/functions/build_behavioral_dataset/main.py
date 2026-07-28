import zcatalyst_sdk
import json
from collections import defaultdict

def handler(context,basicio):

    try:

        app = zcatalyst_sdk.initialize()
        zcql = app.zcql()

        accused = zcql.execute_query("""
        SELECT *
        FROM accused
        """)

        offenders = {}

        for row in accused:

            person = row["accused"]

            offenderid = person["accusedmasterid"]

            if offenderid not in offenders:

                offenders[offenderid] = {
                    "count":0,
                    "age":person.get("ageyear"),
                    "gender":person.get("genderid")
                }

            offenders[offenderid]["count"] += 1

        profileid = 1

        for offenderid,data in offenders.items():

            count = data["count"]

            if count >= 10:
                risk = "HIGH"
            elif count >= 5:
                risk = "MEDIUM"
            else:
                risk = "LOW"

            zcql.execute_query(f"""
            INSERT INTO behavioral_clusters
            (
                profileid,
                accusedmasterid,
                ageyear,
                genderid,
                casescount,
                risklevel
            )
            VALUES
            (
                {profileid},
                {offenderid},
                {data["age"] or 0},
                {data["gender"] or 0},
                {count},
                '{risk}'
            )
            """)

            profileid += 1

        basicio.write(json.dumps({
            "status":"success",
            "profiles":profileid-1
        }))

    except Exception as e:

        basicio.write(json.dumps({
            "status":"error",
            "message":str(e)
        }))

    context.close()