from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse
from app.services.agent_service import stream_agent_events

router = APIRouter()

class ChatRequest(BaseModel):
    session_id: str
    message: str

@router.post("/chat/stream")
async def chat_stream_endpoint(request: Request, payload: ChatRequest):
    """
    Endpoint that accepts a POST request and returns an SSE stream of the agent's thought process.
    """
    if not payload.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")
        
    return EventSourceResponse(
        stream_agent_events(session_id=payload.session_id, user_input=payload.message)
    )
