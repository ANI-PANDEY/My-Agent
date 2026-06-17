import asyncio
from app.agent.graph import build_graph
from langchain_core.messages import HumanMessage
from dotenv import load_dotenv

load_dotenv()

async def main():
    workflow = build_graph()
    agent_app = workflow.compile()
    inputs = {"chat_messages": [HumanMessage(content="What is 2+2?")]}
    
    async for event in agent_app.astream_events(inputs, version="v2"):
        if event["event"] == "on_chat_model_stream":
            chunk = event["data"]["chunk"]
            if chunk.content:
                print(chunk.content, end="", flush=True)

asyncio.run(main())
