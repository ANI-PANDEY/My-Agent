'use client';

import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send, Bot, User, Loader2, Database, Globe, BrainCircuit } from 'lucide-react';

export default function AgentDashboard() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Tracks the internal LangGraph state: 'thinking', 'database', 'searching', 'typing'
  const [agentState, setAgentState] = useState(null); 
  
  const messagesEndRef = useRef(null);

  // Auto-scroll to the bottom of the chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, agentState]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    // 1. Add User Message
    const userMessage = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setAgentState('thinking');
    
    // 2. Add Empty Agent Message Placeholder (marked as streaming)
    setMessages((prev) => [...prev, { role: 'agent', content: '', isStreaming: true }]);

    try {
      // 3. Initiate POST request for the SSE stream
      // Connecting to FastAPI backend running on port 8000
      const response = await fetch('http://localhost:8000/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input, session_id: 'session-123' })
      });

      if (!response.ok) throw new Error('Network response was not ok');

      // 4. Manually read the SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let buffer = '';

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
            buffer += decoder.decode(value, { stream: true });
            
            const events = buffer.split(/\r?\n\r?\n/);
            buffer = events.pop(); // Keep incomplete event in buffer
            
            for (const event of events) {
              const lines = event.split(/\r?\n/);
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const dataStr = line.replace('data: ', '').trim();
                  if (dataStr === '[DONE]') {
                     setAgentState(null);
                     break;
                  }
                  if (!dataStr) continue;
                  
                  try {
                     const data = JSON.parse(dataStr);
                     
                     // --- HANDLE AGENT STATES ---
                   if (data.event === 'node_start') {
                       if (data.node === 'action_node') setAgentState('using_tool');
                       else if (data.node === 'agent_node') setAgentState('thinking');
                   } 
                   else if (data.event === 'tool_call') {
                       // Show specific UI based on which tool the agent decided to use
                       if (data.tool === 'fetch_user_profile') setAgentState('database');
                       if (data.tool === 'web_search') setAgentState('searching');
                   } 
                   // --- HANDLE TOKEN STREAMING ---
                   else if (data.event === 'token') {
                       setAgentState('typing'); // Hide the state badge while typing the final answer
                       setMessages((prev) => {
                           const newMessages = [...prev];
                           const lastIndex = newMessages.length - 1;
                           const lastMessage = newMessages[lastIndex];
                           if (lastMessage.role === 'agent' && lastMessage.isStreaming) {
                               newMessages[lastIndex] = {
                                   ...lastMessage,
                                   content: lastMessage.content + data.text
                               };
                           }
                           return newMessages;
                       });
                   }
                   else if (data.event === 'error') {
                        setAgentState(null);
                        setMessages((prev) => {
                           const newMessages = [...prev];
                           const lastIndex = newMessages.length - 1;
                           const lastMessage = newMessages[lastIndex];
                           if (lastMessage.role === 'agent' && lastMessage.isStreaming) {
                               newMessages[lastIndex] = {
                                   ...lastMessage,
                                   content: lastMessage.content + `\n\n**System Error:** ${data.text}`
                               };
                           }
                           return newMessages;
                       });
                   }
                } catch (err) {
                   console.error("Error parsing SSE data line", dataStr, err);
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error fetching chat:', error);
      setMessages((prev) => [...prev, { role: 'system', content: 'Connection error. Make sure FastAPI backend is running on port 8000.' }]);
    } finally {
      setIsLoading(false);
      setAgentState(null);
      // Mark the message as finished to remove the typing cursor
      setMessages((prev) => {
          const newMessages = [...prev];
          const lastIndex = newMessages.length - 1;
          const lastMessage = newMessages[lastIndex];
          if (lastMessage && lastMessage.role === 'agent') {
              newMessages[lastIndex] = {
                  ...lastMessage,
                  isStreaming: false
              };
          }
          return newMessages;
      });
    }
  };

  // Helper to render the dynamic agent status UI
  const renderAgentState = () => {
    if (!agentState || agentState === 'typing') return null;
    
    let icon = <BrainCircuit className="w-4 h-4 animate-pulse" />;
    let text = "Agent is reasoning...";
    
    if (agentState === 'database') {
        icon = <Database className="w-4 h-4 animate-bounce text-blue-500" />;
        text = "Querying internal user database...";
    } else if (agentState === 'searching') {
        icon = <Globe className="w-4 h-4 animate-spin text-green-500" />;
        text = "Scraping the web for answers...";
    }

    return (
      <div className="flex items-center space-x-2 text-xs font-medium text-gray-500 bg-white border border-gray-200 px-3 py-1.5 rounded-full w-max ml-12 mb-2 shadow-sm animate-in fade-in slide-in-from-bottom-2">
        {icon}
        <span>{text}</span>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 font-sans">
      {/* Header */}
      <header className="bg-white border-b shadow-sm py-4 px-6 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center space-x-3">
          <div className="bg-indigo-600 p-2 rounded-lg shadow-inner">
            <Bot className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800">OmniAgent Dashboard</h1>
            <p className="text-xs text-green-500 font-medium flex items-center">
               <span className="w-2 h-2 bg-green-500 rounded-full mr-1.5 animate-pulse"></span>
               System Online & Connected
            </p>
          </div>
        </div>
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        <div className="max-w-4xl mx-auto flex flex-col space-y-6">
            
          {/* Empty State */}
          {messages.length === 0 && (
              <div className="text-center text-gray-400 mt-20">
                  <Bot className="w-16 h-16 mx-auto mb-4 opacity-20" />
                  <p className="text-lg font-medium text-gray-600">Hello! I am your Autonomous Agent.</p>
                  <p className="text-sm mt-2">Ask me to look up user data, search the web, or analyze trends.</p>
              </div>
          )}

          {/* Messages */}
          {messages.map((msg, idx) => (
            <div 
              key={idx} 
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`flex space-x-3 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                {/* Avatar */}
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center shadow-sm ${msg.role === 'user' ? 'bg-indigo-100 border border-indigo-200' : 'bg-indigo-600'}`}>
                  {msg.role === 'user' ? <User className="text-indigo-600 w-4 h-4" /> : <Bot className="text-white w-4 h-4" />}
                </div>
                
                {/* Message Bubble */}
                <div className={`px-5 py-4 rounded-2xl shadow-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-sm' : 'bg-white border border-gray-100 text-gray-800 rounded-tl-sm'}`}>
                  {msg.role === 'agent' ? (
                     <div className="prose prose-sm max-w-none prose-indigo leading-relaxed">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                        {/* Blinking Cursor while streaming */}
                        {msg.isStreaming && <span className="inline-block w-1.5 h-4 ml-1 bg-indigo-500 animate-pulse align-middle"></span>}
                     </div>
                  ) : (
                     <p className="text-sm leading-relaxed">{msg.content}</p>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Agent Action Status (e.g. "Querying database...") */}
          {renderAgentState()}

          {/* Invisible div for auto-scrolling */}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input Form Area */}
      <footer className="bg-white border-t p-4 pb-8 md:p-6 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <div className="max-w-4xl mx-auto">
          <form 
            onSubmit={handleSubmit} 
            className="flex items-center bg-gray-50 border border-gray-200 rounded-full p-1.5 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-all"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Give the agent a task (e.g., 'What is the subscription status for user_123?')..."
              className="flex-1 bg-transparent border-none focus:ring-0 px-4 py-2 text-gray-700 placeholder-gray-400 outline-none"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white p-2.5 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-md"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 ml-0.5" />}
            </button>
          </form>
          <p className="text-center text-xs text-gray-400 mt-3 font-medium">
             Agent logic powered by LangGraph. Verify critical actions.
          </p>
        </div>
      </footer>
    </div>
  );
}
