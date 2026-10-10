import sys
import os

# Ensure backend and core modules resolve reliably regardless of launch dir
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(current_dir)
if backend_dir not in sys.path:
    sys.path.append(backend_dir)

import uuid
from fastapi import FastAPI, BackgroundTasks, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional

from utils.audio_processor import process_input
from core.transcriber import transcribe_all
from core.summarizer import summarize, generate_title
from core.extractor import extract_action_items, extract_key_decisions, extract_questions
from core.vector_store import build_vector_store, load_vector_store, get_retriever
from core.rag_engine import format_docs
from langchain_core.runnables import RunnablePassthrough, RunnableLambda
from utils.exporter import generate_pdf_report

app = FastAPI(title="AI Meeting Intelligence API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

JOBS_STORE = {}
VECTOR_CHAINS = {}

class ChatRequest(BaseModel):
    question: str

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "meeting-intelligence-backend"}

@app.post("/api/meetings")
async def create_meeting(
    background_tasks: BackgroundTasks,
    source_url: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    language: str = Form("english")
):
    meeting_id = str(uuid.uuid4())
    
    if not source_url and not file:
        raise HTTPException(status_code=400, detail="Provide either source_url or an audio/video file.")

    input_source = source_url
    if file:
        os.makedirs("downloads", exist_ok=True)
        file_path = os.path.join("downloads", f"{meeting_id}_{file.filename}")
        with open(file_path, "wb") as buffer:
            buffer.write(await file.read())
        input_source = file_path

    JOBS_STORE[meeting_id] = {
        "status": "processing",
        "progress": "Downloading and chunking audio...",
        "title": None,
        "summary": None,
        "action_items": None,
        "decisions": None,
        "questions": None,
        "transcript": None
    }

    background_tasks.add_task(process_meeting_pipeline, meeting_id, input_source, language)
    return {"meeting_id": meeting_id, "status": "processing"}

def process_meeting_pipeline(meeting_id: str, source: str, language: str):
    try:
        JOBS_STORE[meeting_id]["progress"] = "Chunking audio..."
        chunks = process_input(source)
        
        JOBS_STORE[meeting_id]["progress"] = f"Transcribing audio ({language})..."
        transcript = transcribe_all(chunks, language=language)
        JOBS_STORE[meeting_id]["transcript"] = transcript

        JOBS_STORE[meeting_id]["progress"] = "Generating summary and title..."
        title = generate_title(transcript)
        summary = summarize(transcript)

        JOBS_STORE[meeting_id]["progress"] = "Extracting action items, decisions, and questions..."
        action_items = extract_action_items(transcript)
        decisions = extract_key_decisions(transcript)
        questions = extract_questions(transcript)

        JOBS_STORE[meeting_id]["progress"] = "Building vector store & RAG chain..."
        vector_store = build_vector_store(transcript, meeting_id)
        retriever = get_retriever(vector_store, k=4)
        
        from core.rag_engine import get_llm
        from langchain_core.prompts import ChatPromptTemplate
        from langchain_core.output_parsers import StrOutputParser
        
        llm = get_llm()
        prompt = ChatPromptTemplate.from_messages([
            ("system", "You are an expert meeting assistant. Answer based ONLY on the meeting transcript context provided below.\n\nContext:\n{context}"),
            ("human", "{question}")
        ])
        rag_chain = {"context": retriever | RunnableLambda(format_docs), "question": RunnablePassthrough()} | prompt | llm | StrOutputParser()
        VECTOR_CHAINS[meeting_id] = rag_chain

        JOBS_STORE[meeting_id].update({
            "status": "completed",
            "progress": "Completed",
            "title": title,
            "summary": summary,
            "action_items": action_items,
            "decisions": decisions,
            "questions": questions
        })
    except Exception as e:
        JOBS_STORE[meeting_id].update({
            "status": "failed",
            "progress": str(e)
        })

@app.get("/api/meetings/{meeting_id}")
def get_meeting(meeting_id: str):
    if meeting_id not in JOBS_STORE:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return JOBS_STORE[meeting_id]

@app.post("/api/meetings/{meeting_id}/chat")
def chat_meeting(meeting_id: str, payload: ChatRequest):
    if meeting_id not in JOBS_STORE or JOBS_STORE[meeting_id]["status"] != "completed":
        raise HTTPException(status_code=400, detail="Meeting is not ready or does not exist.")
    
    chain = VECTOR_CHAINS.get(meeting_id)
    if not chain:
        vector_store = load_vector_store(meeting_id)
        retriever = get_retriever(vector_store, k=4)
        from core.rag_engine import get_llm
        from langchain_core.prompts import ChatPromptTemplate
        from langchain_core.output_parsers import StrOutputParser
        llm = get_llm()
        prompt = ChatPromptTemplate.from_messages([
            ("system", "You are an expert meeting assistant. Answer based ONLY on the meeting transcript context provided below.\n\nContext:\n{context}"),
            ("human", "{question}")
        ])
        chain = {"context": retriever | RunnableLambda(format_docs), "question": RunnablePassthrough()} | prompt | llm | StrOutputParser()
        VECTOR_CHAINS[meeting_id] = chain

    answer = chain.invoke(payload.question)
    return {"answer": answer}

@app.get("/api/meetings/{meeting_id}/export/txt")
def export_txt(meeting_id: str):
    data = JOBS_STORE.get(meeting_id)
    if not data or data["status"] != "completed":
        raise HTTPException(status_code=404, detail="Meeting not found or incomplete.")
    
    content = f"""# {data['title']}\n\n## SUMMARY\n{data['summary']}\n\n## ACTION ITEMS\n{data['action_items']}\n\n## KEY DECISIONS\n{data['decisions']}\n\n## OPEN QUESTIONS\n{data['questions']}\n\n## TRANSCRIPT\n{data['transcript']}"""
    
    path = f"downloads/{meeting_id}_report.txt"
    os.makedirs("downloads", exist_ok=True)
    with open(path, "w") as f:
        f.write(content)
    return FileResponse(path, media_type="text/plain", filename="meeting_report.txt")

@app.get("/api/meetings/{meeting_id}/export/pdf")
def export_pdf(meeting_id: str):
    data = JOBS_STORE.get(meeting_id)
    if not data or data["status"] != "completed":
        raise HTTPException(status_code=404, detail="Meeting not found or incomplete.")
    
    path = f"downloads/{meeting_id}_report.pdf"
    os.makedirs("downloads", exist_ok=True)
    generate_pdf_report(data, path)
    return FileResponse(path, media_type="application/pdf", filename="meeting_report.pdf")