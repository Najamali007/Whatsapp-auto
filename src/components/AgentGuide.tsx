import React, { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, Loader2, Trash2, AlertCircle, CheckCircle2, MessageSquare, Zap, Target, Globe, Mic, Square } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { apiFetch } from '../lib/api';

interface Rule {
  id: number;
  trigger_type: string;
  trigger_value: string;
  action_type: string;
  action_value: string;
  description: string;
  is_active: number;
  created_at: string;
}

interface Message {
  role: 'user' | 'agent';
  content: string;
}

interface AgentGuideProps {
  agentId: number;
  token: string;
}

export default function AgentGuide({ agentId, token }: AgentGuideProps) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'agent', content: "Hello! I'm ready to be trained. Tell me what I should do when certain things happen on WhatsApp. For example: 'When a client shares a website URL, forward it to the Audits group'." }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [rules, setRules] = useState<Rule[]>([]);
  const [isFetchingRules, setIsFetchingRules] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      
      const chunks: BlobPart[] = [];
      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        await handleVoiceNote(blob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Failed to start recording:', err);
      alert('Could not access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const handleVoiceNote = async (blob: Blob) => {
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('audio', blob, 'recording.webm');

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Transcription failed');
      }

      const result = await response.json();
      const transcription = result.text?.trim() || '';
      
      if (transcription) {
        setMessages(prev => [...prev, { role: 'user', content: transcription }]);
        setIsLoading(true);
        try {
          const data = await apiFetch(`/api/agents/${agentId}/guide`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: transcription }),
            heavy: true,
          });

          setMessages(prev => [...prev, { role: 'agent', content: data.response }]);
          fetchRules(); // Refresh rules in case a new one was added
        } catch (error: any) {
          setMessages(prev => [...prev, { role: 'agent', content: `Sorry, I encountered an error: ${error.message}` }]);
        }
      } else {
        setMessages(prev => [...prev, { role: 'agent', content: "I couldn't hear anything in that voice note. Could you try again?" }]);
      }
    } catch (err: any) {
      console.error('Transcription error:', err);
      setMessages(prev => [...prev, { role: 'agent', content: `Transcription failed: ${err.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRules = async () => {
    try {
      const data = await apiFetch(`/api/agents/${agentId}/rules`);
      setRules(data);
    } catch (error) {
      console.error('Failed to fetch rules:', error);
    } finally {
      setIsFetchingRules(false);
    }
  };

  useEffect(() => {
    fetchRules();
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
      const data = await apiFetch(`/api/agents/${agentId}/guide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg }),
        heavy: true,
      });

      setMessages(prev => [...prev, { role: 'agent', content: data.response }]);
      fetchRules(); // Refresh rules in case a new one was added
    } catch (error: any) {
      setMessages(prev => [...prev, { role: 'agent', content: `Sorry, I encountered an error: ${error.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteRule = async (ruleId: number) => {
    if (!confirm('Are you sure you want to delete this rule?')) return;
    try {
      await apiFetch(`/api/agents/${agentId}/rules/${ruleId}`, {
        method: 'DELETE',
      });
      fetchRules();
    } catch (error) {
      console.error('Failed to delete rule');
    }
  };

  return (
    <div className="flex flex-col h-full max-w-6xl mx-auto p-6 md:p-12 gap-8">
      <div className="flex flex-col md:flex-row gap-8 flex-1 overflow-hidden">
        {/* Chat Interface */}
        <div className="flex-1 flex flex-col bg-white border border-gray-100 rounded-[2.5rem] shadow-xl shadow-gray-200/50 overflow-hidden">
          <div className="p-6 border-b border-gray-50 bg-gray-50/30 flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest text-gray-900">Agent Trainer</h3>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Guide your agent with natural language</p>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-hide">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-4 rounded-2xl ${
                  msg.role === 'user' 
                    ? 'bg-primary text-white rounded-tr-none' 
                    : 'bg-gray-50 text-gray-800 rounded-tl-none border border-gray-100'
                }`}>
                  <p className="text-sm font-medium leading-relaxed">{msg.content}</p>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-50 p-4 rounded-2xl rounded-tl-none border border-gray-100 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Processing...</span>
                </div>
              </div>
            )}
          </div>

          <div className="p-6 border-t border-gray-50 bg-white">
            <div className="relative flex items-center gap-3">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder={isRecording ? `Recording... ${Math.floor(recordingTime / 60)}:${(recordingTime % 60).toString().padStart(2, '0')}` : "Type instructions for your agent..."}
                  className={`w-full bg-gray-50 border border-gray-100 rounded-2xl px-6 py-4 pr-14 text-sm font-bold focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all ${isRecording ? 'animate-pulse border-red-200 text-red-500' : ''}`}
                  disabled={isRecording}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading || isRecording}
                  className="absolute right-2 top-2 p-3 bg-primary text-white rounded-xl shadow-lg shadow-primary/20 hover:bg-primary-hover disabled:opacity-50 disabled:shadow-none transition-all"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              
              <button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isLoading}
                className={`p-4 rounded-2xl transition-all shadow-lg ${
                  isRecording 
                    ? 'bg-red-500 text-white animate-pulse shadow-red-500/20' 
                    : 'bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-primary'
                }`}
                title={isRecording ? 'Stop Recording' : 'Record Voice Instruction'}
              >
                {isRecording ? <Square className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Rules List */}
        <div className="w-full md:w-80 flex flex-col gap-6">
          <div className="bg-white border border-gray-100 rounded-[2rem] p-6 shadow-lg shadow-gray-200/30 flex flex-col h-full">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Active Rules</h3>
              <div className="px-2 py-0.5 bg-primary/10 rounded-full border border-primary/20">
                <span className="text-[10px] font-black text-primary">{rules.length}</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-2 scrollbar-hide">
              {isFetchingRules ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-200" />
                </div>
              ) : rules.length === 0 ? (
                <div className="text-center py-10 opacity-40">
                  <Zap className="w-8 h-8 mx-auto mb-2" />
                  <p className="text-[10px] font-black uppercase tracking-widest">No rules yet</p>
                </div>
              ) : (
                rules.map(rule => (
                  <div key={rule.id} className="p-4 bg-gray-50 border border-gray-100 rounded-2xl group relative hover:border-primary/20 transition-all">
                    <div className="flex items-start gap-3 mb-2">
                      <div className="p-1.5 bg-white rounded-lg border border-gray-100 text-primary">
                        {rule.trigger_type === 'url_shared' ? <Globe className="w-3 h-3" /> : 
                         rule.trigger_type === 'keyword_match' ? <MessageSquare className="w-3 h-3" /> : 
                         <User className="w-3 h-3" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-bold text-gray-900 leading-tight">{rule.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200/50">
                      <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">
                        {rule.trigger_type.replace('_', ' ')}
                      </span>
                      <button
                        onClick={() => deleteRule(rule.id)}
                        className="p-1 text-gray-300 hover:text-red-500 transition-all"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Tips Card */}
          <div className="bg-primary/5 border border-primary/10 rounded-[2rem] p-6">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-primary mb-3 flex items-center gap-2">
              <Zap className="w-3 h-3" /> Training Tips
            </h4>
            <ul className="space-y-3">
              <li className="flex gap-2 text-[10px] font-bold text-gray-600 leading-relaxed">
                <div className="w-1 h-1 rounded-full bg-primary mt-1.5 shrink-0" />
                "When a client shares a URL, forward it to the Audits group"
              </li>
              <li className="flex gap-2 text-[10px] font-bold text-gray-600 leading-relaxed">
                <div className="w-1 h-1 rounded-full bg-primary mt-1.5 shrink-0" />
                "If someone says 'price', reply with our price list"
              </li>
              <li className="flex gap-2 text-[10px] font-bold text-gray-600 leading-relaxed">
                <div className="w-1 h-1 rounded-full bg-primary mt-1.5 shrink-0" />
                "Forward all messages from +123456789 to the Admin group"
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
