'use client';

import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send, Bot, User, Loader2, Database, Globe, BrainCircuit, Sparkles } from 'lucide-react';

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
      // Connecting to FastAPI backend via env variable (or localhost for dev)
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const response = await fetch(`${apiUrl}/api/chat/stream`, {
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
    
    let icon = <BrainCircuit className="w-4 h-4 animate-pulse text-indigo-400" />;
    let text = "Neural reasoning...";
    
    if (agentState === 'database') {
        icon = <Database className="w-4 h-4 animate-bounce text-cyan-400" />;
        text = "Accessing encrypted data...";
    } else if (agentState === 'searching') {
        icon = <Globe className="w-4 h-4 animate-spin text-purple-400" />;
        text = "Scanning global networks...";
    }

    return (
      <div className="flex items-center space-x-2 text-xs font-medium text-gray-300 glass-panel px-4 py-2 rounded-full w-max ml-12 mb-4 animate-fade-in-up">
        {icon}
        <span className="tracking-wide">{text}</span>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen bg-animated-gradient font-sans text-gray-100">
      {/* Floating Header */}
      <header className="glass-panel sticky top-0 z-10 py-4 px-6 flex items-center justify-between border-x-0 border-t-0 shadow-lg shadow-indigo-900/10">
        <div className="flex items-center space-x-3">
          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2.5 rounded-xl shadow-lg shadow-indigo-500/30">
            <Sparkles className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 tracking-tight">Enterprise AI Assistant</h1>
            <p className="text-xs text-green-400 font-medium flex items-center mt-0.5">
               <span className="w-2 h-2 bg-green-400 rounded-full mr-1.5 animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.6)]"></span>
               Quantum Core Online
            </p>
          </div>
        </div>
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        <div className="max-w-4xl mx-auto flex flex-col space-y-6 pb-24">
            
          {/* Empty State */}
          {messages.length === 0 && (
              <div className="text-center mt-32 animate-zoom-in">
                  <div className="inline-flex items-center justify-center w-24 h-24 rounded-full glass-panel mb-6 shadow-[0_0_40px_rgba(99,102,241,0.2)]">
                      <Sparkles className="w-10 h-10 text-indigo-400" />
                  </div>
                  <h2 className="text-3xl font-semibold text-white tracking-tight mb-3">How can I assist you?</h2>
                  <p className="text-gray-400 max-w-md mx-auto text-sm leading-relaxed">
                      Powered by LangGraph and Groq. I can reason across vast networks, query internal databases, and stream solutions instantly.
                  </p>
              </div>
          )}

          {/* Messages */}
          {messages.map((msg, idx) => (
            <div 
              key={idx} 
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in-up`}
            >
              <div className={`flex space-x-4 max-w-[85%] md:max-w-[75%] ${msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                
                {/* Avatar */}
                <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center shadow-lg ${msg.role === 'user' ? 'bg-white/10 border border-white/20 backdrop-blur-md' : 'bg-gradient-to-br from-indigo-500 to-purple-600 shadow-indigo-500/30'}`}>
                  {msg.role === 'user' ? <User className="text-gray-200 w-4 h-4" /> : <Bot className="text-white w-5 h-5" />}
                </div>
                
                {/* Message Bubble */}
                <div className={`px-5 py-4 rounded-2xl shadow-lg ${msg.role === 'user' ? 'bg-gradient-to-br from-indigo-600 to-purple-700 text-white rounded-tr-sm border border-white/10' : 'glass-panel text-gray-100 rounded-tl-sm'}`}>
                  {msg.role === 'agent' ? (
                     <div className="prose-dark leading-relaxed">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                        {/* Blinking Cursor while streaming */}
                        {msg.isStreaming && <span className="inline-block w-1.5 h-4 ml-1 bg-indigo-400 animate-pulse align-middle rounded-sm shadow-[0_0_5px_rgba(129,140,248,0.8)]"></span>}
                     </div>
                  ) : (
                     <p className="text-[15px] leading-relaxed">{msg.content}</p>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Agent Action Status */}
          {renderAgentState()}

          {/* Invisible div for auto-scrolling */}
          <div ref={messagesEndRef} className="h-4" />
        </div>
      </main>

      {/* Floating Input Area */}
      <footer className="fixed bottom-0 w-full p-4 md:p-6 bg-gradient-to-t from-[#0B0C10] via-[#0B0C10]/90 to-transparent pb-8">
        <div className="max-w-4xl mx-auto">
          <form 
            onSubmit={handleSubmit} 
            className="flex items-center glass-input rounded-full p-2 transition-all focus-within:ring-2 focus-within:ring-indigo-500/50 focus-within:border-indigo-400"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything..."
              className="flex-1 bg-transparent border-none focus:ring-0 px-5 py-3 text-white placeholder-gray-400 outline-none font-medium"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 text-white p-3.5 rounded-full transition-all disabled:opacity-50 disabled:hover:bg-indigo-600 disabled:cursor-not-allowed flex items-center justify-center shadow-[0_0_15px_rgba(79,70,229,0.5)] hover:shadow-[0_0_20px_rgba(99,102,241,0.7)]"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 ml-0.5" />}
            </button>
          </form>
          <p className="text-center text-xs text-gray-500 mt-4 font-medium tracking-wide">
             Secure Multi-Agent Environment • Groq Engine
          </p>
        </div>
      </footer>
    </div>
  );
}
