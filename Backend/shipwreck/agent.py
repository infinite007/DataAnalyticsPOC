from langchain_openai import ChatOpenAI
from langchain_community.agent_toolkits import create_sql_agent
from langchain_community.agent_toolkits.sql.toolkit import SQLDatabaseToolkit
from langchain_community.utilities import SQLDatabase
from config import sql_agent_args
from dataclasses import dataclass
from typing import List, Dict
import pandas as pd
import os


@dataclass
class SQLAgentOutput:
    output: List[Dict]
    query: str
    content: str


class SQLAgent:
    def __init__(self, db_uri="sqlite:///../data/student_data.sqlite", 
                 llm_model="gpt-3.5-turbo", llm_temperature=0) -> None:
        
        openai_api_key = os.environ["OPENAI_API_KEY"]
        self.db = SQLDatabase.from_uri(db_uri)

        self.llm = ChatOpenAI(model=llm_model, 
                              openai_api_key=openai_api_key,
                              temperature=llm_temperature)

        self.db_agent = create_sql_agent(self.llm, 
                                         SQLDatabaseToolkit(db=self.db, llm=self.llm),
                                        #  agent_type="tool-calling", 
                                        #  verbose=True,
                                         **sql_agent_args)
    
    def query(self, q):
        output = self.db_agent.invoke({
            "input": q
        })

        intermediate_steps = output["intermediate_steps"]
        content = output["output"]
        query = intermediate_steps[-1][0].tool_input.get("query", "")
        sql_output = pd.read_sql(query, self.db._engine).to_dict(orient="records")
        
        return SQLAgentOutput(
            content=content,
            query=query,
            output=sql_output
        )


if __name__ == "__main__":
    agent = SQLAgent()
    output = agent.query("give me number of students who have score and A+ in Physics")
    print(output)