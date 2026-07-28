import zcatalyst_sdk
import json
from collections import defaultdict
from itertools import combinations


def handler(context, basicio):

    try:

        app = zcatalyst_sdk.initialize()
        zcql = app.zcql()

        accused_rows = []

        offset = 0

        while True:

            rows = zcql.execute_query(f"""
            SELECT casemasterid,
                accusedmasterid
            FROM accused
            LIMIT {offset},200
            """)

            if not rows:
                break

            accused_rows.extend(rows)

            print(
                "Fetched",
                len(rows),
                "rows. Total:",
                len(accused_rows)
            )

            if len(rows) < 200:
                break

            offset += 200

        print("FINAL ROW COUNT =", len(accused_rows))

        case_members = defaultdict(list)

        for row in accused_rows:

            caseid = row["accused"]["casemasterid"]
            accusedid = row["accused"]["accusedmasterid"]

            case_members[caseid].append(accusedid)
            print("TOTAL CASES =", len(case_members))

            sample = list(case_members.items())[:10]

            print(sample)

        edge_counts = defaultdict(int)

        for caseid, members in case_members.items():
            multi_cases = 0

            if len(members) > 1:
                multi_cases += 1

            print("MULTI ACCUSED CASES =", multi_cases)
            if len(members) < 2:
                continue

            for a, b in combinations(sorted(members), 2):

                edge_counts[(a, b)] += 1

        
        inserted = 0

        for (a, b), count in edge_counts.items():

            if count >= 2:
                strength = "HIGH"

            else:
                strength = "LOW"

            zcql.execute_query(f"""
            INSERT INTO offenderlinks
            (
                sourceid,
                targetid,
                casescount,
                relationshipstrength
            )
            VALUES
            (
                {a},
                {b},
                {count},
                '{strength}'
            )
            """)

            inserted += 1

        basicio.write(json.dumps({
            "status": "success",
            "edges_created": inserted
        }))

    except Exception as e:

        basicio.write(json.dumps({
            "status": "error",
            "message": str(e)
        }))

    context.close()