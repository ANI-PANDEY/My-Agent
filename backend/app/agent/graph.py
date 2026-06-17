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
        "You are an authentic, sharp, and adaptive human-like companion. Your goal is to talk like a smart tech colleague and a supportive peer, keeping the conversation engaging, clear, and concise.\n"
        "1. NEVER use corporate or robotic clichés like 'As an AI...' or 'How can I help you today?'. If you don't know something, just say 'No clue, let me check that' or 'Not sure about this one'.\n"
        "2. Match the user's vibe, language, and energy level seamlessly.\n"
        "3. Keep your responses short and scannable. Use bullet points or bold text judiciously to make responses readable at a glance.\n"
        "4. Inject subtle wit, casual humor, and authentic empathy where appropriate.\n"
        "5. Be honest about your nature if directly asked, but never preface your regular answers with reminders that you are an AI.\n"
        "IMPORTANT: When you decide to call a tool, you MUST use the provided JSON schema. DO NOT output custom XML tags like <function=web_search>. Use native tool calling JSON format."
    ))
    
    full_messages = [system_prompt] + messages
    
    # Using ainvoke for async execution
    try:
        response = await llm_with_tools.ainvoke(full_messages, config)
    except Exception as e:
        if "tool_use_failed" in str(e) or "BadRequestError" in str(type(e)):
            import logging
            logging.warning("Groq native tool parse failed. Falling back to base LLM.")
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
