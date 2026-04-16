import React, { useState, useEffect, useRef } from 'react';
import { Send, Bot, Loader2, Trash2, Zap, Globe, MessageSquare, Brain, X, RefreshCw, Upload, Check, FileText, Pencil, Save } from 'lucide-react';
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
  category?: 'training' | 'portfolio' | 'rules';
}

export default function AgentGuide({ agentId, token, category = 'training' }: AgentGuideProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [isFetchingMemories, setIsFetchingMemories] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<'training' | 'portfolio' | 'rules'>(category);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setUploadCategory(category);
  }, [category]);

  const [showRuleNotice, setShowRuleNotice] = useState(false);
  const [editingMemoryId, setEditingMemoryId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');

  const fetchMemories = async () => {
    try {
      const data = await apiFetch(`/api/agents/${agentId}/memory`);
      // Filter memories by category if provided
      const filteredData = data.filter((m: any) => {
        if (category === 'training') return !m.topic.startsWith('rule_') && !m.topic.startsWith('portfolio_');
        if (category === 'rules') return m.topic.startsWith('rule_');
        if (category === 'portfolio') return m.topic.startsWith('portfolio_');
        return true;
      });
      
      // If new memories were added (compared to previous count), show notice
      if (memories.length > 0 && filteredData.length > memories.length) {
        setShowRuleNotice(true);
        setTimeout(() => setShowRuleNotice(false), 5000);
      }
      
      setMemories(filteredData);
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
        const welcomeMessages = {
          training: "Hello! I'm ready to learn. Teach me anything — product info, how to greet clients, pricing, FAQs, or how to handle objections. I'll remember everything you tell me!",
          portfolio: "Hello! Tell me about your portfolio. Share your past projects, success stories, and case studies so I can showcase them to potential clients.",
          rules: "Hello! What are the rules I should follow? Tell me about your business policies, response guidelines, and what I should or shouldn't say."
        };
        setMessages([{
          role: 'agent',
          content: welcomeMessages[category] || welcomeMessages.training
        }]);
      }
    } catch (err) {
      setMessages([{
        role: 'agent',
        content: "Hello! I'm ready to learn. I'll remember everything you tell me!"
      }]);
    }
  };

  useEffect(() => {
    fetchMemories();
    fetchChatHistory();
  }, [agentId, category]);

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
        body: JSON.stringify({ message: userMsg, category: uploadCategory }),
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
    if (!confirm('Delete this memory?')) return;
    try {
      await apiFetch(`/api/agents/${agentId}/memory/${memoryId}`, { method: 'DELETE' });
      setMemories(prev => prev.filter(m => m.id !== memoryId));
    } catch (err) {
      console.error('Failed to delete memory');
    }
  };

  const handleUpdateMemory = async (memoryId: number) => {
    try {
      await apiFetch(`/api/agents/${agentId}/memory/${memoryId}`, {
        method: 'PUT',
        body: JSON.stringify({ content: editContent })
      });
      setMemories(prev => prev.map(m => m.id === memoryId ? { ...m, content: editContent } : m));
      setEditingMemoryId(null);
    } catch (err) {
      console.error('Failed to update memory');
    }
  };

  const handleClearHistory = async () => {
    if (!confirm('Download and Clear training chat history? Memories will be kept.')) return;
    try {
      // 1. Download history
      const historyText = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
      const blob = new Blob([historyText], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `agent_${agentId}_training_history_${new Date().toISOString().split('T')[0]}.txt`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      // 2. Clear from DB
      await apiFetch(`/api/agents/${agentId}/train-chat-history`, { method: 'DELETE' });
      setMessages([{
        role: 'agent',
        content: "Chat history downloaded and cleared! I still remember everything I learned. Start a new training session!"
      }]);
    } catch (err) {
      console.error('Failed to clear history');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('category', uploadCategory);
    try {
      const response = await fetch(`/api/agents/${agentId}/train-file`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: fd,
      });
      if (response.ok) {
        setUploadSuccess(true);
        setTimeout(() => setUploadSuccess(false), 3000);
        fetchMemories();
        setMessages(prev => [...prev, { role: 'agent', content: `I've successfully read and learned from "${file.name}" (Category: ${uploadCategory}).` }]);
      }
    } catch (e) {}
    finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
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
              <div className="flex items-center gap-2">
                <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Internal Memory Active • No Tokens Required</p>
              </div>
            </div>
          </div>
          <button onClick={handleClearHistory}
            className="p-2 text-gray-300 hover:text-gray-500 hover:bg-gray-100 rounded-xl transition-all"
            title="Clear chat history">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="h-[400px] overflow-y-auto p-6 space-y-4 custom-scrollbar relative">
          <AnimatePresence>
            {showRuleNotice && (
              <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-emerald-500 text-white px-6 py-3 rounded-2xl shadow-xl flex items-center gap-3 border border-emerald-400"
              >
                <div className="w-6 h-6 bg-white/20 rounded-lg flex items-center justify-center">
                  <Check className="w-4 h-4" />
                </div>
                <span className="text-xs font-black uppercase tracking-widest">New {category === 'rules' ? 'Rule' : 'Knowledge'} Added!</span>
              </motion.div>
            )}
          </AnimatePresence>

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
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Learning Locally...</span>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-5 border-t border-gray-50 bg-white">
          <div className="flex items-center gap-3">
            <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} accept=".txt,.pdf,.doc,.docx" />
            <button onClick={() => fileInputRef.current?.click()} disabled={isUploading}
              className="p-3.5 bg-gray-50 text-gray-400 rounded-xl hover:bg-gray-100 transition-all border border-gray-100 flex items-center justify-center">
              {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            </button>
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
          {uploadSuccess && (
            <div className="flex items-center gap-2 text-emerald-500 text-[10px] font-bold uppercase tracking-widest animate-fade-in">
              <Check className="w-3 h-3" /> File uploaded & learned!
            </div>
          )}
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
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      {editingMemoryId === memory.id ? (
                        <button onClick={() => handleUpdateMemory(memory.id)}
                          className="p-0.5 text-emerald-500 hover:bg-emerald-50 rounded">
                          <Save className="w-3 h-3" />
                        </button>
                      ) : (
                        <button onClick={() => { setEditingMemoryId(memory.id); setEditContent(memory.content); }}
                          className="p-0.5 text-gray-400 hover:text-primary hover:bg-primary/5 rounded">
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                      <button onClick={() => handleDeleteMemory(memory.id)}
                        className="p-0.5 text-gray-200 hover:text-red-500 rounded">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  {editingMemoryId === memory.id ? (
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full bg-white border border-primary/20 rounded-lg p-2 text-[11px] font-bold focus:ring-2 focus:ring-primary/10 outline-none min-h-[60px]"
                      autoFocus
                    />
                  ) : (
                    <p className="text-[11px] font-bold text-gray-700 leading-snug">{memory.content}</p>
                  )}
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