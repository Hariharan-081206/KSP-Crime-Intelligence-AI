import zcatalyst_sdk
import json
import numpy as np
from sentence_transformers import SentenceTransformer

model = SentenceTransformer("all-MiniLM-L6-v2")

def cosine(a,b):

    a=np.array(a)
    b=np.array(b)

    return np.dot(a,b)/(np.linalg.norm(a)*np.linalg.norm(b))

def handler(context,basicio):

    request = basicio.get_json_body()

    question=request["question"]

    app=zcatalyst_sdk.initialize()

    zcql=app.zcql()

    docs=zcql.execute_query("""
    SELECT * FROM crimedocuments
    """)

    q_embedding=model.encode(question).tolist()

    scores=[]

    for row in docs:

        doc=row["crimedocuments"]

        emb=json.loads(doc["embedding"])

        score=cosine(q_embedding,emb)

        scores.append({
            "score":score,
            "text":doc["documenttext"]
        })

    scores.sort(
        key=lambda x:x["score"],
        reverse=True
    )

    basicio.write(
        json.dumps(scores[:5])
    )

    context.close()