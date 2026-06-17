import asyncio
from langchain_groq import ChatGroq
from app.agent.tools import AVAILABLE_TOOLS
from dotenv import load_dotenv

load_dotenv()

async def main():
    llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0)
    llm_with_tools = llm.bind_tools(AVAILABLE_TOOLS)
    res = await llm_with_tools.ainvoke("What is the capital of France?")
    print(repr(res))

asyncio.run(main())
