from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes.agent import router as agent_router
from app.core.config import settings

app = FastAPI(title=settings.PROJECT_NAME)

# Allow Next.js frontend to communicate with FastAPI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow all origins for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(agent_router, prefix="/api", tags=["agent"])

@app.get("/health")
def health_check():
    return {"status": "ok", "message": "OmniAgent API is running."}
