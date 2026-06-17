import asyncio
from langchain_groq import ChatGroq
from dotenv import load_dotenv
load_dotenv()

async def main():
    llm = ChatGroq(model="llama-3.3-70b-versatile", streaming=True)
    async for chunk in llm.astream("What is 2+2?"):
        print(repr(chunk.content))

asyncio.run(main())
