'use client';

import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send, Bot, User, Loader2, Database, Globe, BrainCircuit, Sparkles, Paperclip, X, Menu, MessageSquare, Plus, Trash2 } from 'lucide-react';

export default function AgentDashboard() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // Tracks the internal LangGraph state: 'thinking', 'database', 'searching', 'typing'
  const [agentState, setAgentState] = useState(null); 
  const [attachments, setAttachments] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  
  const messagesEndRef = useRef(null);

  // Auto-scroll to the bottom of the chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    const saved = localStorage.getItem('agent_sessions');
    if (saved) {
      const parsed = JSON.parse(saved);
      setSessions(parsed);
      if (parsed.length > 0) {
        setActiveSessionId(parsed[0].id);
        setMessages(parsed[0].messages || []);
      } else {
        createNewSession();
      }
    } else {
      createNewSession();
    }
  }, []);

  const createNewSession = () => {
    const newId = `session-${Date.now()}`;
    const newSession = { id: newId, name: 'New Chat', messages: [] };
    setSessions(prev => [newSession, ...prev]);
    setActiveSessionId(newId);
    setMessages([]);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const switchSession = (id) => {
    const session = sessions.find(s => s.id === id);
    if (session) {
      setActiveSessionId(id);
      setMessages(session.messages || []);
      if (window.innerWidth < 768) setIsSidebarOpen(false);
    }
  };

  const deleteSession = (e, id) => {
    e.stopPropagation();
    const updated = sessions.filter(s => s.id !== id);
    setSessions(updated);
    if (activeSessionId === id) {
      if (updated.length > 0) {
        setActiveSessionId(updated[0].id);
        setMessages(updated[0].messages || []);
      } else {
        createNewSession();
      }
    }
  };

  // Save messages to current session
  useEffect(() => {
    if (activeSessionId && messages.length > 0) {
      setSessions(prev => prev.map(s => {
        if (s.id === activeSessionId) {
          let newName = s.name;
          if (newName === 'New Chat') {
             const firstUser = messages.find(m => m.role === 'user');
             if (firstUser) newName = firstUser.content.substring(0, 30) + '...';
          }
          return { ...s, name: newName, messages };
        }
        return s;
      }));
    }
  }, [messages, activeSessionId]);

  // Persist to localstorage whenever sessions change
  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem('agent_sessions', JSON.stringify(sessions));
    }
  }, [sessions]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, agentState]);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setAttachments((prev) => [...prev, ...Array.from(e.target.files)]);
    }
  };

  const removeAttachment = (idx) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if ((!input.trim() && attachments.length === 0) || isLoading || isUploading) return;

    // 1. Add User Message immediately for UX
    let displayContent = input;
    if (attachments.length > 0) {
        displayContent += `\n\n*(Attached ${attachments.length} file${attachments.length > 1 ? 's' : ''})*`;
    }
    const userMessage = { role: 'user', content: displayContent };
    setMessages((prev) => [...prev, userMessage]);
    
    const userPrompt = input;
    const currentAttachments = [...attachments];
    setInput('');
    setAttachments([]);
    
    // Upload files if any
    let extractedContext = "";
    if (currentAttachments.length > 0) {
        setIsUploading(true);
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://my-agent-backend-snowy.vercel.app';
            for (const file of currentAttachments) {
                const formData = new FormData();
                formData.append('file', file);
                const uploadRes = await fetch(`${apiUrl}/api/upload`, {
                    method: 'POST',
                    body: formData,
                });
                if (!uploadRes.ok) throw new Error(`Upload failed for ${file.name}`);
                const data = await uploadRes.json();
                extractedContext += `\n\n[Content from attached file: ${file.name}]\n${data.extracted_text}`;
            }
        } catch (err) {
            console.error(err);
            setMessages((prev) => [...prev, { role: 'system', content: `Error processing attachment: ${err.message}` }]);
            setIsUploading(false);
            return;
        }
        setIsUploading(false);
        // Save the hidden context in the UI state so it gets preserved in history
        setMessages((prev) => {
            const newMessages = [...prev];
            const lastMessage = newMessages[newMessages.length - 1];
            if (lastMessage && lastMessage.role === 'user') {
                newMessages[newMessages.length - 1] = {
                    ...lastMessage,
                    hiddenContext: extractedContext
                };
            }
            return newMessages;
        });
    }

    setIsLoading(true);
    setAgentState('thinking');
    
    // Combine input with extracted file content for the backend
    const finalPayloadMessage = userPrompt + extractedContext;

    // Combines previous UI messages + new actual payload
    const payloadMessages = messages.map(m => ({ 
        role: m.role, 
        content: m.hiddenContext ? `${m.content}${m.hiddenContext}` : m.content 
    }));
    payloadMessages.push({ role: 'user', content: finalPayloadMessage });

    // 2. Add Empty Agent Message Placeholder (marked as streaming)
    setMessages((prev) => [...prev, { role: 'agent', content: '', isStreaming: true }]);

    try {
      // 3. Initiate POST request for the SSE stream
      // Connecting to FastAPI backend via env variable (or localhost for dev)
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://my-agent-backend-snowy.vercel.app';
      const response = await fetch(`${apiUrl}/api/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: payloadMessages, session_id: activeSessionId })
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
    <div className="flex h-screen bg-animated-gradient font-sans text-gray-100 overflow-hidden">
      
      {/* Sidebar Overlay for Mobile */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* Sidebar History */}
      <div className={`fixed inset-y-0 left-0 z-50 w-72 glass-panel border-r border-white/10 transform transition-transform duration-300 ease-in-out flex flex-col ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 bg-[#0B0C10]/95 backdrop-blur-2xl`}>
        <div className="p-5 flex items-center justify-between border-b border-white/10">
          <h2 className="font-semibold text-lg flex items-center gap-2 text-white tracking-wide"><MessageSquare className="w-5 h-5 text-indigo-400"/> History</h2>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-gray-400 hover:text-white transition-colors p-1"><X className="w-6 h-6"/></button>
        </div>
        <div className="p-4">
          <button onClick={createNewSession} className="w-full py-3 px-4 bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors shadow-inner text-indigo-100">
            <Plus className="w-4 h-4" /> New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1.5 custom-scrollbar">
          {sessions.map(s => (
             <div key={s.id} onClick={() => switchSession(s.id)} className={`group cursor-pointer px-4 py-3.5 rounded-xl text-sm flex items-center justify-between transition-all duration-200 ${activeSessionId === s.id ? 'bg-indigo-600/30 border border-indigo-500/50 text-white shadow-md' : 'hover:bg-white/5 text-gray-400 border border-transparent'}`}>
                <span className="truncate pr-3 font-medium">{s.name}</span>
                <button onClick={(e) => deleteSession(e, s.id)} className={`opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-opacity p-1 rounded-md hover:bg-white/10 ${activeSessionId === s.id ? 'opacity-100 text-indigo-200 hover:text-red-300 hover:bg-indigo-500/40' : ''}`}><Trash2 className="w-4 h-4" /></button>
             </div>
          ))}
        </div>
      </div>

      {/* Main Chat Content */}
      <div className="flex-1 flex flex-col h-screen relative w-full">
        {/* Floating Header */}
        <header className="glass-panel sticky top-0 z-10 py-3 px-4 md:py-4 md:px-6 flex items-center justify-between border-x-0 border-t-0 shadow-lg shadow-indigo-900/10 backdrop-blur-xl bg-[#0B0C10]/80">
          <div className="flex items-center space-x-3">
            <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2 mr-1 text-gray-300 hover:text-white rounded-lg hover:bg-white/10 transition-colors">
              <Menu className="w-6 h-6" />
            </button>
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2.5 rounded-xl shadow-lg shadow-indigo-500/30 hidden sm:block">
              <Sparkles className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 tracking-tight">Enterprise AI</h1>
              <p className="text-xs text-green-400 font-medium flex items-center mt-0.5">
                 <span className="w-2 h-2 bg-green-400 rounded-full mr-1.5 animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.6)]"></span>
                 Quantum Core
              </p>
            </div>
          </div>
        </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        <div className="max-w-4xl mx-auto flex flex-col space-y-6 pb-36 md:pb-28">
            
          {/* Empty State */}
          {messages.length === 0 && (
              <div className="text-center mt-16 md:mt-32 animate-zoom-in px-4">
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
        <footer className="fixed bottom-0 w-full md:w-[calc(100%-18rem)] p-4 md:p-6 bg-gradient-to-t from-[#0B0C10] via-[#0B0C10]/90 to-transparent pb-8 right-0">
          <div className="max-w-4xl mx-auto">
            {/* Attachment Preview Area */}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {attachments.map((file, idx) => (
                  <div key={idx} className="flex items-center space-x-2 bg-indigo-500/20 border border-indigo-500/30 text-indigo-200 px-3 py-1.5 rounded-full text-xs font-medium animate-fade-in-up">
                    <span className="truncate max-w-[150px]">{file.name}</span>
                    <button type="button" onClick={() => removeAttachment(idx)} className="hover:text-white transition-colors"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
            <form 
              onSubmit={handleSubmit} 
              className="flex items-center glass-input rounded-full p-2 transition-all focus-within:ring-2 focus-within:ring-indigo-500/50 focus-within:border-indigo-400 bg-[#161822]/80"
            >
              <label className="cursor-pointer text-gray-400 hover:text-indigo-400 transition-colors p-2 rounded-full hover:bg-white/5 ml-1">
                <Paperclip className="w-5 h-5" />
                <input type="file" multiple className="hidden" onChange={handleFileChange} />
              </label>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything or attach files..."
                className="flex-1 bg-transparent border-none focus:ring-0 px-3 py-2 md:px-4 md:py-3 text-white placeholder-gray-400 outline-none font-medium text-base"
                disabled={isLoading || isUploading}
              />
              <button
                type="submit"
                disabled={isLoading || isUploading || (!input.trim() && attachments.length === 0)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white p-3.5 rounded-full transition-all disabled:opacity-50 disabled:hover:bg-indigo-600 disabled:cursor-not-allowed flex items-center justify-center shadow-[0_0_15px_rgba(79,70,229,0.5)] hover:shadow-[0_0_20px_rgba(99,102,241,0.7)] ml-2"
              >
                {isLoading || isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 ml-0.5" />}
              </button>
            </form>
            <p className="text-center text-xs text-gray-500 mt-4 font-medium tracking-wide">
               Secure Multi-Agent Environment • Groq Engine
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
