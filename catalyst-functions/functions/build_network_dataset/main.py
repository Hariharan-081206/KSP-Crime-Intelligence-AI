import zcatalyst_sdk
import json

def handler(context,basicio):

    try:

        app = zcatalyst_sdk.initialize()
        zcql = app.zcql()

        accused = zcql.execute_query("""
        SELECT *
        FROM accused
        """)

        case_map = {}

        for row in accused:

            a = row["accused"]

            caseid = a["casemasterid"]

            if caseid not in case_map:
                case_map[caseid] = []

            case_map[caseid].append(
                a["accusedmasterid"]
            )

        edgeid = 1

        for caseid,people in case_map.items():

            for i in range(len(people)):

                for j in range(i+1,len(people)):

                    zcql.execute_query(f"""
                    INSERT INTO offenderlinks
                    (
                        edgeid,
                        sourceid,
                        targetid,
                        casemasterid
                    )
                    VALUES
                    (
                        {edgeid},
                        {people[i]},
                        {people[j]},
                        {caseid}
                    )
                    """)

                    edgeid += 1

        basicio.write(json.dumps({
            "status":"success",
            "edges":edgeid-1
        }))

    except Exception as e:

        basicio.write(json.dumps({
            "status":"error",
            "message":str(e)
        }))

    context.close()