import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import openai
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

datasets = {
    "csgo": pd.read_csv("./datasets/csgo.csv"),
}


@app.get("/datasets")
async def get_datasets():
    return {"datasets": list(datasets.keys())}


@app.post("/query")
async def query_data(dataset_name: str, user_query: str):
    if dataset_name not in datasets:
        raise HTTPException(status_code=404, detail="Dataset not found")
    data = datasets[dataset_name]

    openai.api_key = os.environ['OPENAI_API_KEY']
    response = openai.ChatCompletion.create(
        model="gpt-4",
        messages=[
            {"role": "system", "content": "You are a data assistant that generates only pandas queries based on user "
                                          "input. Respond with the code only. Do not include explanations, "
                                          "additional text, or formatting like markdown."},
            {"role": "user", "content": f"Query: {user_query}. Data preview: {data.head(5).to_string()}"}
        ]
    )
    pandas_query = response['choices'][0]['message']['content'].strip()

    try:
        result = eval(pandas_query, {"df": data, "pd": pd})

        # Convert the result into a frontend-friendly format
        if isinstance(result, pd.DataFrame):
            result_dict = result.to_dict(orient="records")
        elif isinstance(result, pd.Series):
            result_dict = result.to_dict()
        else:
            result_dict = {"value": result}

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error executing query: {str(e)}")

    try:
        humanized_response = openai.ChatCompletion.create(
            model="gpt-4",
            messages=[
                {"role": "system",
                 "content": "You are a data assistant that explains data analysis results in simple terms for "
                            "non-technical users."},
                {"role": "user",
                 "content": f"The user asked: {user_query}\n\nThe pandas query used: {pandas_query}\n\nThe raw result "
                            f"from the query: {result_dict}\n\nExplain the result in simple and human-friendly terms."},
            ],
        )
        humanized_text = humanized_response['choices'][0]['message']['content'].strip()

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error humanizing the result: {str(e)}")

    return {
        "query": pandas_query,
        "result": result_dict,
        "humanized_response": humanized_text
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
