from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from agent import SQLAgent, SQLAgentOutput
from pydantic import BaseModel

class QueryRequestItem(BaseModel):
    query: str


app = FastAPI()
agent = SQLAgent()


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],  # CRA dev server
    allow_credentials=True,
    allow_methods=["*"],    # or ["POST"]
    allow_headers=["*"],    # needed for application/json
)

@app.get("/")
def read_root():
    return {"Hello": "World"}


@app.post("/query")
def serve_query(queryItem: QueryRequestItem)->SQLAgentOutput:
    return agent.query(queryItem.query)