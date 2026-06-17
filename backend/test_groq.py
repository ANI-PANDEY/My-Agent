import asyncio
from app.agent.graph import build_graph
from langchain_core.messages import HumanMessage
from dotenv import load_dotenv

load_dotenv()

async def main():
    workflow = build_graph()
    agent_app = workflow.compile()
    inputs = {"chat_messages": [HumanMessage(content="What is the capital of France?")]}
    
    async for event in agent_app.astream_events(inputs, version="v2"):
        if "data" in event and "chunk" in event["data"]:
            chunk = event["data"]["chunk"]
            if hasattr(chunk, "tool_calls") and chunk.tool_calls:
                print(f"\n[Tool called: {chunk.tool_calls}]")
            elif hasattr(chunk, "content") and chunk.content:
                print(chunk.content, end="", flush=True)

asyncio.run(main())
