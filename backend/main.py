import uvicorn
from fastapi import FastAPI, HTTPException, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import openai
import os
import logging
from pydantic import BaseModel
from typing import Dict

# Initialize logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# Allow CORS for all origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Datasets dictionary - In a real app, you may want to dynamically load datasets
datasets = {
    "csgo": pd.read_csv("./datasets/csgo.csv"),
    "twitch": pd.read_csv("./datasets/twitch.csv"),
}


class QueryRequest(BaseModel):
    dataset_name: str
    user_query: str


# Endpoint to get available datasets
@app.get("/datasets")
async def get_datasets():
    return {"datasets": list(datasets.keys())}


# Helper function to handle OpenAI response for pandas query generation
def get_pandas_query(user_query: str, data: pd.DataFrame) -> str:
    try:
        openai.api_key = os.getenv('OPENAI_API_KEY')
        if not openai.api_key:
            raise HTTPException(status_code=500, detail="OpenAI API key is missing.")

        response = openai.ChatCompletion.create(
            model="gpt-4",
            messages=[
                {"role": "system",
                 "content": "You are a data assistant that generates only pandas queries based on user "
                            "input. Respond with the code only. Do not include explanations, "
                            "additional text, or formatting like markdown."},
                {"role": "user", "content": f"Query: {user_query}. Data preview: {data.head(5).to_string()}"}
            ]
        )
        pandas_query = response['choices'][0]['message']['content'].strip()
        return pandas_query
    except openai.error.OpenAIError:
        logger.error("Error generating pandas query with OpenAI.")
        return ""  # Return an empty string if OpenAI fails
    except Exception as e:
        logger.error(f"Unexpected error while generating pandas query: {str(e)}")
        return ""  # Return an empty string in case of other errors


# Helper function to execute pandas query safely
def execute_pandas_query(pandas_query: str, data: pd.DataFrame) -> Dict:
    try:
        if not pandas_query:
            return {"error": "There was an issue processing your request. Please try again later."}

        result = eval(pandas_query, {"df": data, "pd": pd})

        if isinstance(result, pd.DataFrame):
            result_dict = result.to_dict(orient="records")
        elif isinstance(result, pd.Series):
            result_dict = result.to_dict()
        else:
            result_dict = {"value": result}

        return result_dict

    except Exception as e:
        logger.error(f"Error executing pandas query: {str(e)}")
        return {"error": "We couldn't process the data at the moment. Please try again later."}


# Helper function to generate humanized response using OpenAI
def get_humanized_response(user_query: str, pandas_query: str, result_dict: Dict) -> str:
    try:
        openai.api_key = os.getenv('OPENAI_API_KEY')
        if not openai.api_key:
            raise HTTPException(status_code=500, detail="OpenAI API key is missing.")

        # If the pandas query failed, we will indicate that in the result
        if "error" in result_dict:
            result_dict = {"value": result_dict["error"]}

        response = openai.ChatCompletion.create(
            model="gpt-4",
            messages=[
                {"role": "system",
                 "content": "You are a data assistant that explains data analysis results in simple terms for "
                            "non-technical users."},
                {"role": "user",
                 "content": f"The user asked: {user_query}\n\nThe pandas query used: {pandas_query}\n\nThe raw result "
                            f"from the query: {result_dict}\n\nExplain the result in simple and human-friendly terms."},
            ]
        )
        humanized_text = response['choices'][0]['message']['content'].strip()
        return humanized_text

    except openai.error.OpenAIError:
        logger.error("Error generating humanized response with OpenAI.")
        return "We encountered an issue generating the response. Please try again later."
    except Exception as e:
        logger.error(f"Unexpected error while humanizing result: {str(e)}")
        return "We encountered an issue processing your request. Please try again later."


@app.post("/query")
async def query_data(query: QueryRequest):
    dataset_name = query.dataset_name
    user_query = query.user_query

    logger.info(f"Received query for dataset: {dataset_name} with query: {user_query}")

    if dataset_name not in datasets:
        logger.error(f"Dataset '{dataset_name}' not found.")
        raise HTTPException(status_code=404, detail="Dataset not found")

    data = datasets[dataset_name]

    pandas_query = get_pandas_query(user_query, data)
    result_dict = execute_pandas_query(pandas_query, data)
    humanized_text = get_humanized_response(user_query, pandas_query, result_dict)

    # Suggest a chart type and data points for visualization
    chart_suggestion = suggest_chart_type(user_query, pandas_query, result_dict)

    return {
        "query": pandas_query if pandas_query else "There was an issue generating the query.",
        "result": result_dict,
        "humanized_response": humanized_text,
        "visualization": {
            "chart_type": chart_suggestion.get("chart_type"),
            "data_points": chart_suggestion.get("data_points")
        }
    }


def suggest_chart_type(user_query: str, pandas_query: str, result_dict: Dict) -> Dict:
    try:
        openai.api_key = os.getenv('OPENAI_API_KEY')
        if not openai.api_key:
            raise HTTPException(status_code=500, detail="OpenAI API key is missing.")

        response = openai.ChatCompletion.create(
            model="gpt-4",
            messages=[
                {"role": "system",
                 "content": "You are a data assistant that determines if a result can be visualized and suggests "
                            "a chart type and data points for visualization. Respond with a JSON object containing "
                            "'chart_type' and 'data_points', or {'chart_type': None, 'data_points': None} if no chart "
                            "is needed. chart_type will give result in one word as for example 'bar' or 'line' and similar."},
                {"role": "user",
                 "content": f"The user asked: {user_query}\n\nThe pandas query used: {pandas_query}\n\n"
                            f"The raw result from the query: {result_dict}\n\nSuggest a visualization."},
            ]
        )
        suggestion = response['choices'][0]['message']['content'].strip()
        return eval(suggestion)  # The response should be a JSON-like string.
    except Exception as e:
        logger.error(f"Error suggesting chart type: {str(e)}")
        return {"chart_type": None, "data_points": None}


@app.get("/preview/{dataset_name}")
async def preview_dataset(dataset_name: str):
    # Check if the dataset exists
    if dataset_name not in datasets:
        logger.error(f"Dataset '{dataset_name}' not found for preview.")
        raise HTTPException(status_code=404, detail="Dataset not found")

    data = datasets[dataset_name]

    try:
        # Extract column names and data types
        column_info = data.dtypes.apply(lambda dtype: str(dtype)).to_dict()

        # Generate a human-readable description of columns
        column_descriptions = [
            f"'{col}' (type: {dtype})" for col, dtype in column_info.items()
        ]
        summary = (
                f"The dataset '{dataset_name}' contains the following columns:\n"
                + "\n".join(column_descriptions)
                + "\n\nYou can query these columns for analysis or visualization."
        )

        return {
            "dataset_name": dataset_name,
            "columns_summary": summary,
            "columns": list(column_info.keys()),
        }

    except Exception as e:
        logger.error(f"Error summarizing dataset '{dataset_name}': {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="An error occurred while summarizing the dataset.",
        )


@app.post("/upload-dataset")
async def upload_dataset(file: UploadFile = File(...)):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported.")

    try:
        data = pd.read_csv(file.file)

        dataset_name = file.filename.rsplit(".", 1)[0]
        if dataset_name in datasets:
            raise HTTPException(status_code=400, detail="A dataset with this name already exists.")

        datasets[dataset_name] = data

        return {"message": f"Dataset '{dataset_name}' uploaded successfully.", "dataset_name": dataset_name}
    except Exception as e:
        logger.error(f"Error uploading dataset: {str(e)}")
        raise HTTPException(status_code=500, detail="An error occurred while processing the dataset.")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
