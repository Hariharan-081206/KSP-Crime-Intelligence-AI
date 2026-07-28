import zcatalyst_sdk
import json


def handler(context, basicio):

    try:

        app = zcatalyst_sdk.initialize()
        zcql = app.zcql()

        cases = zcql.execute_query("""
        SELECT *
        FROM casemaster
        """)

        hotspots = {}

        for row in cases:

            case = row["casemaster"]

            lat = case.get("latitude")
            lon = case.get("longitude")

            if lat is None or lon is None:
                continue

            lat_key = round(float(lat), 1)
            lon_key = round(float(lon), 1)

            key = f"{lat_key}_{lon_key}"

            hotspots[key] = hotspots.get(key, 0) + 1

        created = 0

        hotspotid = 1

        for key, crimecount in hotspots.items():

            lat, lon = key.split("_")

            if crimecount >= 3:
                risk = "HIGH"

            elif crimecount >= 2:
                risk = "MEDIUM"

            else:
                risk = "LOW"

            zcql.execute_query(f"""
            INSERT INTO hotspot_clusters
            (
                latitude,
                longitude,
                crimecount,
                risklevel
            )
            VALUES
            (
                {lat},
                {lon},
                {crimecount},
                '{risk}'
            )
            """)
            hotspotid += 1
            created += 1

        basicio.write(json.dumps({
            "status": "success",
            "hotspots_created": created
        }))

    except Exception as e:

        basicio.write(json.dumps({
            "status": "error",
            "message": str(e)
        }))

    context.close()