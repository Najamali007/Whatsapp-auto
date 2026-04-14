import React, { useState, useEffect, useRef } from 'react';
import { Send, Bot, Loader2, Trash2, Zap, Globe, MessageSquare, Brain, X, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { apiFetch } from '../lib/api';

interface Memory {
  id: number;
  topic: string;
  content: string;
  source: 'chat' | 'document';
  updated_at: string;
}

interface ChatMessage {
  id?: number;
  role: 'user' | 'agent';
  content: string;
}

interface AgentGuideProps {
  agentId: number;
  token: string;
}

export default function AgentGuide({ agentId, token }: AgentGuideProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [isFetchingMemories, setIsFetchingMemories] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchMemories = async () => {
    try {
      const data = await apiFetch(`/api/agents/${agentId}/memory`);
      setMemories(data);
    } catch (err) {
      console.error('Failed to fetch memories');
    } finally {
      setIsFetchingMemories(false);
    }
  };

  const fetchChatHistory = async () => {
    try {
      const data = await apiFetch(`/api/agents/${agentId}/train-chat-history`);
      if (data.length > 0) {
        setMessages(data.map((m: any) => ({ id: m.id, role: m.role, content: m.content })));
      } else {
        setMessages([{
          role: 'agent',
          content: "Hello! I'm ready to learn. Teach me anything — product info, how to greet clients, pricing, FAQs, or how to handle objections. I'll remember everything you tell me!"
        }]);
      }
    } catch (err) {
      setMessages([{
        role: 'agent',
        content: "Hello! I'm ready to learn. Teach me anything — product info, how to greet clients, pricing, FAQs, or how to handle objections. I'll remember everything you tell me!"
      }]);
    }
  };

  useEffect(() => {
    fetchMemories();
    fetchChatHistory();
  }, [agentId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsLoading(true);

    try {
      const data = await apiFetch(`/api/agents/${agentId}/train-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg }),
      });

      setMessages(prev => [...prev, { role: 'agent', content: data.response }]);
      // Refresh memories after each exchange
      fetchMemories();
    } catch (error: any) {
      setMessages(prev => [...prev, { role: 'agent', content: `Error: ${error.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteMemory = async (memoryId: number) => {
    try {
      await apiFetch(`/api/agents/${agentId}/memory/${memoryId}`, { method: 'DELETE' });
      setMemories(prev => prev.filter(m => m.id !== memoryId));
    } catch (err) {
      console.error('Failed to delete memory');
    }
  };

  const handleClearHistory = async () => {
    if (!confirm('Clear training chat history? Memories will be kept.')) return;
    try {
      await apiFetch(`/api/agents/${agentId}/train-chat-history`, { method: 'DELETE' });
      setMessages([{
        role: 'agent',
        content: "Chat history cleared! I still remember everything I learned. Start a new training session!"
      }]);
    } catch (err) {
      console.error('Failed to clear history');
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-full w-full gap-6 p-6 md:p-10 overflow-hidden">
      {/* Chat Interface */}
      <div className="flex-1 flex flex-col bg-white border border-gray-100 rounded-[2.5rem] shadow-xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-gray-50 bg-gray-50/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
              <Brain className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest text-gray-900">Train with Chat</h3>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Everything you say is remembered</p>
            </div>
          </div>
          <button onClick={handleClearHistory}
            className="p-2 text-gray-300 hover:text-gray-500 hover:bg-gray-100 rounded-xl transition-all"
            title="Clear chat history">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="h-[400px] overflow-y-auto p-6 space-y-4 custom-scrollbar">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-primary text-white rounded-tr-none font-medium'
                  : 'bg-gray-50 text-gray-800 rounded-tl-none border border-gray-100 font-medium'
              }`}>
                {msg.content}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-gray-50 p-4 rounded-2xl rounded-tl-none border border-gray-100 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Processing & Storing...</span>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-5 border-t border-gray-50 bg-white">
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Teach your agent anything..."
              className="flex-1 bg-gray-50 border border-gray-100 rounded-2xl px-5 py-3.5 text-sm font-bold focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all"
            />
            <button onClick={handleSend} disabled={!input.trim() || isLoading}
              className="p-3.5 bg-primary text-white rounded-xl shadow-lg shadow-primary/20 hover:bg-primary/90 disabled:opacity-50 transition-all">
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Memory Panel */}
      <div className="w-full md:w-72 flex flex-col gap-4">
        <div className="bg-white border border-gray-100 rounded-[2rem] p-5 shadow-lg flex flex-col h-[550px] overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-gray-400 flex items-center gap-2">
              <Brain className="w-3.5 h-3.5 text-primary" /> Long-term Memory
            </h3>
            <span className="px-2 py-0.5 bg-primary/10 rounded-full text-[10px] font-black text-primary border border-primary/20">
              {memories.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
            {isFetchingMemories ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-gray-200" />
              </div>
            ) : memories.length === 0 ? (
              <div className="text-center py-10 opacity-40">
                <Brain className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">No memories yet</p>
                <p className="text-[9px] text-gray-300 mt-1">Start training to build memory</p>
              </div>
            ) : (
              memories.map(memory => (
                <div key={memory.id}
                  className="p-3.5 bg-gray-50 border border-gray-100 rounded-2xl group hover:border-primary/20 transition-all">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${memory.source === 'document' ? 'bg-purple-500' : 'bg-primary'}`} />
                      <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">{memory.topic}</span>
                    </div>
                    <button onClick={() => handleDeleteMemory(memory.id)}
                      className="p-0.5 text-gray-200 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <p className="text-[11px] font-bold text-gray-700 leading-snug">{memory.content}</p>
                  <span className={`mt-1.5 inline-block text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md ${
                    memory.source === 'document' ? 'bg-purple-50 text-purple-400' : 'bg-primary/5 text-primary'
                  }`}>{memory.source}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Tips */}
        <div className="bg-primary/5 border border-primary/10 rounded-[1.5rem] p-5">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-primary mb-3 flex items-center gap-2">
            <Zap className="w-3 h-3" /> What to teach
          </h4>
          <ul className="space-y-2">
            {[
              '"Our price is $99/month"',
              '"Always greet with Salam"',
              '"If asked about refunds, say 7 days policy"',
              '"Our main competitor is X, we are better because..."',
            ].map((tip, i) => (
              <li key={i} className="flex gap-2 text-[10px] font-bold text-gray-500 leading-relaxed">
                <div className="w-1 h-1 rounded-full bg-primary mt-1.5 shrink-0" />
                {tip}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}