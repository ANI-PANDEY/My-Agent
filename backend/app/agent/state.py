from typing import Annotated, Sequence, TypedDict, List
from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages

class AgentState(TypedDict):
    """
    The state structure passed between nodes in the graph.
    """
    # The `add_messages` reducer ensures new messages are appended to the existing list
    chat_messages: Annotated[Sequence[BaseMessage], add_messages]
    
    # Keep track of tools that have been executed during the current graph run
    current_executed_tools: List[str]
    
    # Flag to pause the workflow or request human review
    requires_human_approval: bool
