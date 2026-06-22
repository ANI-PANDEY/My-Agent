import asyncio
from app.agent.graph import build_graph
from langchain_core.messages import HumanMessage
from dotenv import load_dotenv

load_dotenv()

async def main():
    workflow = build_graph()
    agent_app = workflow.compile()
    inputs = {"chat_messages": [HumanMessage(content="What is the capital of France?")]}
    
    async for chunk in agent_app.astream(inputs):
        for node, values in chunk.items():
            print(f"\n--- Node: {node} ---")
            if "chat_messages" in values:
                msg = values["chat_messages"][-1]
                if hasattr(msg, "tool_calls") and msg.tool_calls:
                    print(f"Tool Call: {msg.tool_calls}")
                else:
                    print(f"Content: {msg.content}")
 
asyncio.run(main())
