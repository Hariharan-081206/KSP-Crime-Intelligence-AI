import zcatalyst_sdk
import json
import hashlib

embedding = hashlib.sha256(
    text.encode()
).hexdigest()

def handler(context,basicio):

    app = zcatalyst_sdk.initialize()
    zcql = app.zcql()

    docs = zcql.execute_query("""
    SELECT * FROM crimedocuments
    """)

    updated = 0

    for row in docs:

        doc = row["crimedocuments"]

        text = doc["documenttext"]

        embedding = hashlib.sha256(
    text.encode()
).hexdigest()


        embedding_json = json.dumps(embedding)

        documentid = doc["documentid"]

        zcql.execute_query(f"""
        UPDATE crimedocuments
        SET embedding='{embedding_json}'
        WHERE documentid={documentid}
        """)

        updated += 1

    basicio.write(json.dumps({
        "updated":updated
    }))

    context.close()