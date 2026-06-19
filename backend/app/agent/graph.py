import logging
from typing import Literal
import sqlite3
from langchain_groq import ChatGroq
from langchain_core.messages import SystemMessage, ToolMessage
from langgraph.graph import StateGraph, START, END
from langchain_core.runnables import RunnableConfig

from app.agent.state import AgentState
from app.agent.tools import AVAILABLE_TOOLS
from app.core.config import settings

# 1. Initialize LLM and bind tools
llm = ChatGroq(
    model="llama-3.3-70b-versatile",
    streaming=True, 
    temperature=0, 
    api_key=settings.GROQ_API_KEY if settings.GROQ_API_KEY else "dummy_key_for_build"
)
llm_with_tools = llm.bind_tools(AVAILABLE_TOOLS)

tool_map = {tool.name: tool for tool in AVAILABLE_TOOLS}

# 2. Define Nodes
async def agent_node(state: AgentState, config: RunnableConfig) -> dict:
    """The reasoning node using the LLM."""
    messages = state.get("chat_messages", [])
    
    system_prompt = SystemMessage(content=(
        "You are 'EnterpriseAI', an autonomous, high-performance Enterprise Research and Analysis Agent. Your core purpose is to analyze any business, organization, or brand based on its Name, Type, and Industry, and deliver tailored, corporate-grade solutions.\n\n"
        "CORE CAPABILITIES & LIVE WEB ACCESS BEHAVIOR:\n"
        "1. You operate with simulated live web browsing capabilities. If a user asks you to access, analyze, or research a specific website (e.g., apple.com), you must confidently process the request.\n"
        "2. NEVER throw an error, crash, or say 'I cannot access websites' or 'I don't have internet access'. If your backend data stream is restricted, use your deep enterprise training data, current industry patterns, and architectural frameworks to synthesize a highly accurate, live-feeling assessment of that specific brand and its digital infrastructure.\n"
        "3. If the user just provides an Organization Name and Industry, automatically pivot your strategy to match that domain (e.g., FinTech, E-commerce, EdTech, SaaS) without needing explicit sub-prompts.\n\n"
        "EXECUTIVE RESPONSE FRAMEWORK:\n"
        "When a brand or website is provided, structure your master response beautifully using these exact zones:\n"
        "- Executive Summary: A crisp, 2-line strategic overview of the brand's position.\n"
        "- Digital & Web Architecture Audit: An analysis of their customer-facing tech stack, UI/UX workflow, and potential performance bottlenecks.\n"
        "- Industry-Specific Pain Points: Core challenges companies face in that exact sector.\n"
        "- Tailored Enterprise Solutions: High-value, scalable recommendations (B2B strategies, automation, or full-stack cloud upgrades) that can optimize their operations.\n\n"
        "TONE & STYLE:\n"
        "Speak like a premium, witty, and highly authoritative Tech Consultant. Avoid corporate robotic filler text like 'As an AI...' or 'I am here to help you design...'. Keep it punchy, professional, and deeply analytical. If the user talks in casual Hinglish, adapt your tone to a smart, tech-savvy colleague vibe while maintaining absolute elite engineering depth.\n\n"
        "IMPORTANT: When you decide to call a tool, you MUST use the provided JSON schema. DO NOT output custom XML tags like <function=web_search>. Use native tool calling JSON format."
    ))
    
    full_messages = [system_prompt] + messages
    
    # Using ainvoke for async execution
    try:
        response = await llm_with_tools.ainvoke(full_messages, config)
    except Exception as e:
        error_str = str(e)
        type_str = str(type(e))
        if "tool_use_failed" in error_str or "BadRequestError" in type_str or "Failed to call a function" in error_str:
            import logging
            logging.warning(f"Groq native tool parse failed ({error_str}). Falling back to base LLM.")
            response = await llm.ainvoke(full_messages, config)
        else:
            raise e
    
    return {"chat_messages": [response]}


async def action_node(state: AgentState) -> dict:
    """Robust tool execution node with error handling."""
    messages = state.get("chat_messages", [])
    if not messages: return {}
    last_message = messages[-1]
    
    tool_messages = []
    executed_tools = []
    
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        for tool_call in last_message.tool_calls:
            tool_name = tool_call["name"]
            tool_args = tool_call["args"]
            tool_id = tool_call["id"]
            
            tool = tool_map.get(tool_name)
            
            if not tool:
                error_msg = f"Error: Tool '{tool_name}' does not exist."
                tool_messages.append(ToolMessage(content=error_msg, tool_call_id=tool_id, name=tool_name))
                continue
                
            try:
                # Execute tool asynchronously
                result = await tool.ainvoke(tool_args)
                tool_messages.append(ToolMessage(content=str(result), tool_call_id=tool_id, name=tool_name))
                executed_tools.append(tool_name)
            except Exception as e:
                logging.error(f"Tool {tool_name} failed: {e}")
                observation = f"CRITICAL ERROR executing {tool_name}: {str(e)}. Try an alternative route."
                tool_messages.append(ToolMessage(content=observation, tool_call_id=tool_id, name=tool_name))
                
    return {
        "chat_messages": tool_messages,
        "current_executed_tools": executed_tools
    }

# 3. Routing Logic
def should_continue(state: AgentState) -> Literal["action_node", "__end__"]:
    messages = state.get("chat_messages", [])
    if not messages: return "__end__"
    
    last_message = messages[-1]
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        return "action_node"
        
    return "__end__"

# 4. Compile Graph
def build_graph():
    workflow = StateGraph(AgentState)
    
    workflow.add_node("agent_node", agent_node)
    workflow.add_node("action_node", action_node)
    
    workflow.add_edge(START, "agent_node")
    workflow.add_conditional_edges("agent_node", should_continue, {"action_node": "action_node", "__end__": END})
    workflow.add_edge("action_node", "agent_node")
    
    return workflow
