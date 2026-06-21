from fastapi import APIRouter, HTTPException, Request, UploadFile, File
import io
import zipfile
import PyPDF2
import base64
from groq import AsyncGroq
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage
from app.core.config import settings
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

@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """
    Endpoint to handle file uploads, including ZIPs, PDFs, and Audio (via Groq Whisper).
    """
    content = await file.read()
    filename = file.filename.lower()
    
    extracted_text = ""
    
    try:
        if filename.endswith(".zip"):
            with zipfile.ZipFile(io.BytesIO(content)) as z:
                for info in z.infolist():
                    if not info.is_dir() and not info.filename.startswith("__MACOSX"):
                        try:
                            # Try to decode as text
                            file_data = z.read(info.filename)
                            text = file_data.decode("utf-8")
                            extracted_text += f"\n--- File: {info.filename} ---\n{text}\n"
                        except UnicodeDecodeError:
                            continue
        elif filename.endswith(".pdf"):
            reader = PyPDF2.PdfReader(io.BytesIO(content))
            for page in reader.pages:
                extracted_text += page.extract_text() + "\n"
        elif filename.endswith((".mp3", ".wav", ".m4a", ".ogg", ".flac", ".mp4")):
            # Transcribe audio using Groq Whisper
            client = AsyncGroq(api_key=settings.GROQ_API_KEY)
            file_obj = (file.filename, content)
            transcription = await client.audio.transcriptions.create(
                file=file_obj,
                model="distil-whisper-large-v3-en"
            )
            extracted_text = f"[Audio Transcription: {transcription.text}]"
        elif filename.endswith((".png", ".jpg", ".jpeg", ".webp", ".gif")):
            # Extract data using Groq Vision Model
            base64_image = base64.b64encode(content).decode('utf-8')
            mime_type = f"image/{filename.split('.')[-1]}"
            if mime_type == "image/jpg": mime_type = "image/jpeg"
            
            vision_llm = ChatGroq(
                model="llama-3.2-11b-vision-preview",
                temperature=0,
                api_key=settings.GROQ_API_KEY if settings.GROQ_API_KEY else "dummy_key"
            )
            message = HumanMessage(
                content=[
                    {"type": "text", "text": "Analyze this image in extreme detail. If there is text, extract all of it perfectly. If there is code, write it out. If it is a diagram or UI, explain its structure and purpose."},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{mime_type};base64,{base64_image}"},
                    },
                ]
            )
            response = await vision_llm.ainvoke([message])
            extracted_text = f"[Image Analysis & Extracted Data:\n{response.content}]"
        else:
            # Assume text
            extracted_text = content.decode("utf-8")
            
        return {"filename": file.filename, "extracted_text": extracted_text.strip()}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to process file: {str(e)}")
