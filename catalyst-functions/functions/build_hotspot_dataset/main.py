import zcatalyst_sdk
import json
from collections import defaultdict
from sklearn.cluster import DBSCAN

def handler(context,basicio):

    try:

        app = zcatalyst_sdk.initialize()
        zcql = app.zcql()

        rows = zcql.execute_query("""
        SELECT latitude,
               longitude
        FROM casemaster
        """)

        hotspots = defaultdict(int)

        for row in rows:

            case = row["casemaster"]

            lat = round(float(case["latitude"]),2)
            lon = round(float(case["longitude"]),2)

            hotspots[(lat,lon)] += 1

        hotspotid = 1

        for key,count in hotspots.items():

            lat,lon = key

            zcql.execute_query(f"""
            INSERT INTO hotspot_clusters
            (
                hotspotid,
                latitude,
                longitude,
                crimecount
            )
            VALUES
            (
                {hotspotid},
                {lat},
                {lon},
                {count}
            )
            """)

            hotspotid += 1

        basicio.write(json.dumps({
            "status":"success",
            "hotspots":hotspotid-1
        }))

    except Exception as e:

        basicio.write(json.dumps({
            "status":"error",
            "message":str(e)
        }))

    context.close()