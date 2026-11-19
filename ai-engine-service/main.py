import os
import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_groq import ChatGroq
from langchain_core.prompts import PromptTemplate

app = FastAPI(
    title="Enterprise AI Engine Service",
    version="2.0.0",
    description="Multi-provider resilient AI engine (Groq Primary + Gemini Failover)."
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

gemini_key = os.getenv("GEMINI_API_KEY")
groq_key = os.getenv("GROQ_API_KEY")

# Primary: Groq GPT-OSS 120B (Ultra-fast, high intelligence)
primary_llm = ChatGroq(
    model="openai/gpt-oss-120b",
    api_key=groq_key,
    max_retries=1,
    timeout=15
)

# Failover 1: Groq Qwen 3.8 27B
groq_fallback = ChatGroq(
    model="qwen/qwen3.8-27b",
    api_key=groq_key,
    max_retries=0,
    timeout=15
)

# Failover 2: Gemini 3.8 Flash
gemini_fallback = ChatGoogleGenerativeAI(
    model="gemini-3.8-flash",
    google_api_key=gemini_key,
    max_retries=0,
    timeout=15
)

resilient_llm = primary_llm.with_fallbacks([groq_fallback, gemini_fallback])

PROMPT_TEMPLATE = PromptTemplate.from_template(
    "You are an expert {agent_role} in a corporate enterprise. "
    "Your objective is: {task}. "
    "Provide a concise, professional response acting exactly as this role. "
    "Limit your response to 2-3 sentences."
)

class TaskRequest(BaseModel):
    task_id: str
    prompt: str
    agents_involved: List[str]

@app.get("/health")
async def health_check():
    return {
        "status": "UP",
        "service": "Python AI Engine (Groq Primary + Gemini Failover)",
        "groq_loaded": bool(groq_key),
        "gemini_loaded": bool(gemini_key)
    }

async def run_agent(agent: str, task_prompt: str):
    print(f"[{agent}] Starting execution...", flush=True)
    chain = PROMPT_TEMPLATE | resilient_llm
    try:
        response = await asyncio.wait_for(
            chain.ainvoke({"agent_role": agent, "task": task_prompt}),
            timeout=30.0
        )
        print(f"[{agent}] Completed.", flush=True)
        return {
            "agent": agent,
            "status": "COMPLETED",
            "output": response.content
        }
    except asyncio.TimeoutError:
        print(f"[{agent}] Timed out across all providers.", flush=True)
        return {
            "agent": agent,
            "status": "FAILED",
            "output": "All AI providers timed out."
        }
    except Exception as e:
        print(f"[{agent}] Error: {repr(e)}", flush=True)
        return {
            "agent": agent,
            "status": "FAILED",
            "output": f"LLM Execution Failed: {str(e)}"
        }

@app.post("/execute-workflow")
async def execute_workflow(request: TaskRequest):
    print(f"Received workflow: {request.task_id}", flush=True)

    tasks = [run_agent(agent, request.prompt) for agent in request.agents_involved]
    pipeline_trace = await asyncio.gather(*tasks)

    completed_count = sum(1 for item in pipeline_trace if item["status"] == "COMPLETED")
    if completed_count == len(pipeline_trace):
        overall_status = "SUCCESS"
    elif completed_count > 0:
        overall_status = "PARTIAL_SUCCESS"
    else:
        overall_status = "FAILED"

    return {
        "task_id": request.task_id,
        "overall_status": overall_status,
        "pipeline_trace": pipeline_trace
    }