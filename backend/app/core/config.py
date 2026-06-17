from pydantic_settings import BaseSettings
import os
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseSettings):
    PROJECT_NAME: str = "OmniAgent API"
    API_V1_STR: str = "/api"
    # The API key must be present in the environment or .env file
    # If not present, the app will fail to start, which is a good fail-fast mechanism.
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    GOOGLE_API_KEY: str = os.getenv("GOOGLE_API_KEY", os.getenv("OPENAI_API_KEY", ""))
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")

settings = Settings()
