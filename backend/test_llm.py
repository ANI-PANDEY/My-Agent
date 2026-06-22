import asyncio
from langchain_groq import ChatGroq
from app.agent.tools import AVAILABLE_TOOLS
from dotenv import load_dotenv

load_dotenv()

async def main():
    llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0)
    llm_with_tools = llm.bind_tools(AVAILABLE_TOOLS)
    
    from langchain_core.messages import SystemMessage
    system_prompt = SystemMessage(content=(
        "IMPORTANT: When you decide to call a tool, you MUST use the provided JSON schema. DO NOT output custom XML tags like <function=web_search>. Use native tool calling JSON format."
    ))
    
    res = await llm_with_tools.ainvoke([system_prompt, "What is the capital of France?"])
    print(repr(res))
    print(repr(res))

asyncio.run(main())
