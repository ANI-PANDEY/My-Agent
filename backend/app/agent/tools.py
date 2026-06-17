import asyncio
from langchain_core.tools import tool
from pydantic import BaseModel, Field

class FetchProfileInput(BaseModel):
    user_id: str = Field(description="The ID of the user to fetch")

@tool("fetch_user_profile", args_schema=FetchProfileInput)
async def fetch_user_profile(user_id: str) -> dict:
    """
    Fetches a user's profile information from the database given their user_id.
    Useful for getting details like the user's name, email, subscription tier, and preferences.
    """
    await asyncio.sleep(0.5) # Simulate database latency
    
    mock_db = {
        "user_123": {
            "name": "Alice Smith",
            "email": "alice@company.com",
            "subscription": "premium",
            "preferences": {"theme": "dark"}
        },
        "user_456": {
            "name": "Bob Jones",
            "email": "bob@company.com",
            "subscription": "free",
            "preferences": {"theme": "light"}
        }
    }
    
    return mock_db.get(user_id, {"error": f"User profile not found for ID: {user_id}"})

class WebSearchInput(BaseModel):
    query: str = Field(description="The search query string")

@tool("web_search", args_schema=WebSearchInput)
async def web_search(query: str) -> str:
    """
    Searches the internet for current information, real-time data, or news.
    Use this when the user asks for up-to-date facts outside your training data.
    """
    await asyncio.sleep(1.0) # Simulate API latency
    
    return f"Simulated search results for '{query}': Example domain says X. Another source says Y."


AVAILABLE_TOOLS = [fetch_user_profile, web_search]
