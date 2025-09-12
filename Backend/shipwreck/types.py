from pydantic import BaseModel

class QueryRequestItem(BaseModel):
    query: str