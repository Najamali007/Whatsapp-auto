import React, { useState, useEffect, useRef } from 'react';
import { Users, Plus, Trash2, Edit2, Check, X, Loader2, BrainCircuit, Upload, FileText, AlertCircle, Layers, User, Zap, Sparkles, Target, RefreshCw, MessageSquare, LayoutDashboard, Settings2, ChevronDown, ChevronUp, ChevronLeft, Tag, DollarSign, HelpCircle, Globe, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { apiFetch } from '../lib/api';
import { loadingManager } from '../lib/loading';
import AgentGuide from './AgentGuide';

interface Service {
  id: string;
  name: string;
  keywords: string[];
  ask_for: string;
  pricing: 'allowed' | 'not_allowed';
  price_details?: string;
  custom_reply?: string;
  portfolio_file?: string; // Legacy
  portfolios?: { file?: string; link?: string }[];
}

interface AgentConfig {
  greeting_message: string;
  fallback_message: string;
  no_pricing_message: string;
  services: Service[];
}

interface Agent {
  id: number;
  name: string;
  personality: string;
  role: string;
  knowledge_base: string;
  brand_company: string;
  product_service: string;
  objective: string;
  tone: string;
  playbook: string;
  others: string;
  avatar: string;
  strategy: string;
  agent_config?: string;
  is_active: number;
}

interface TrainingFile {
  id: number;
  original_name: string;
  category: string;
  created_at: string;
}

interface AgentsProps {
  token: string;
  initialAgentId?: number | null;
  onNavigate?: (tab: string) => void;
}

const defaultConfig: AgentConfig = {
  greeting_message: '',
  fallback_message: "I'm sorry, I didn't quite understand. Could you please clarify?",
  no_pricing_message: "Pricing depends on your requirements. We'll share a custom quote after analysis.",
  services: [],
};

export default function Agents({ token, initialAgentId, onNavigate }: AgentsProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(initialAgentId || null);
  const [activeSubTab, setActiveSubTab] = useState<'agents' | 'services' | 'knowledge'>('agents');
  const [isTraining, setIsTraining] = useState<number | null>(null);
  const [trainingFiles, setTrainingFiles] = useState<TrainingFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [activeTrainTab, setActiveTrainTab] = useState<'chat' | 'document' | null>(null);
  const [uploadCategory, setUploadCategory] = useState<'training' | 'portfolio' | 'rules'>('training');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [agentMemory, setAgentMemory] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Agent Config (Services Builder)
  const [agentConfig, setAgentConfig] = useState<AgentConfig>(defaultConfig);
  const [expandedService, setExpandedService] = useState<string | null>(null);

  const [formData, setFormData] = useState<Partial<Agent>>({
    name: '',
    personality: '',
    role: '',
    knowledge_base: '',
    brand_company: '',
    product_service: '',
    objective: '',
    tone: '',
    playbook: '',
    others: '',
    avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=1',
    strategy: '',
    is_active: 1,
  });

  const AVATARS = [
    'https://api.dicebear.com/7.x/bottts/svg?seed=1',
    'https://api.dicebear.com/7.x/bottts/svg?seed=2',
    'https://api.dicebear.com/7.x/bottts/svg?seed=3',
    'https://api.dicebear.com/7.x/bottts/svg?seed=4',
  ];

  useEffect(() => {
    if (initialAgentId !== undefined) setSelectedAgentId(initialAgentId);
  }, [initialAgentId]);

  const fetchAgents = async () => {
    try {
      const agentsData = await apiFetch('/api/agents');
      setAgents(agentsData);
      setError(null);
    } catch (error: any) {
      setError(`Failed to load agents: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTrainingFiles = async (agentId: number) => {
    try {
      const data = await apiFetch(`/api/agents/${agentId}/training-files`);
      setTrainingFiles(data);
    } catch (e) {}
  };

  const fetchAgentMemory = async (agentId: number) => {
    try {
      const data = await apiFetch(`/api/agents/${agentId}/memory`);
      setAgentMemory(data);
    } catch (e) {}
  };

  useEffect(() => { fetchAgents(); }, []);

  useEffect(() => {
    if (selectedAgentId) {
      fetchTrainingFiles(selectedAgentId);
      fetchAgentMemory(selectedAgentId);
    }
    else {
      setTrainingFiles([]);
      setAgentMemory([]);
    }
  }, [selectedAgentId]);

  const selectedAgent = agents.find(a => a.id === selectedAgentId);

  useEffect(() => {
    if (selectedAgent) {
      setFormData(selectedAgent);
      // Load config
      try {
        const cfg = selectedAgent.agent_config ? JSON.parse(selectedAgent.agent_config) : defaultConfig;
        setAgentConfig({ ...defaultConfig, ...cfg });
      } catch {
        setAgentConfig(defaultConfig);
      }
    } else {
      setFormData({
        name: '',
        personality: '',
        role: '',
        knowledge_base: '',
        brand_company: '',
        product_service: '',
        objective: '',
        tone: '',
        playbook: '',
        others: '',
        avatar: AVATARS[0],
        strategy: '',
        is_active: 1,
      });
      setAgentConfig(defaultConfig);
    }
  }, [selectedAgentId, agents]);

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!formData.name?.trim()) errors.name = 'Agent name is required';
    if (!formData.brand_company?.trim()) errors.brand_company = 'Brand/Company is required';
    if (!formData.objective?.trim()) errors.objective = 'Objective is required';
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async (id?: number) => {
    if (!validateForm()) return;
    const endpoint = id ? `/api/agents/${id}` : '/api/agents';
    const method = id ? 'PUT' : 'POST';
    try {
      const payload = { ...formData, agent_config: JSON.stringify(agentConfig) };
      const response = await apiFetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!id && response.id) setSelectedAgentId(response.id);
      fetchAgents();
      setValidationErrors({});
      setSaveSuccess(true);
      setExpandedService(null);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error: any) {
      setError(error.message || 'Failed to save agent');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this agent?')) return;
    setDeletingId(id);
    try {
      await apiFetch(`/api/agents/${id}`, { method: 'DELETE' });
      if (selectedAgentId === id) setSelectedAgentId(null);
      fetchAgents();
    } catch (e: any) { alert(e.message); }
    finally { setDeletingId(null); }
  };

  const handleFileUpload = async (agentId: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('category', uploadCategory);
    try {
      const response = await fetch(`/api/agents/${agentId}/train-file`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: fd,
      });
      if (response.ok) {
        fetchTrainingFiles(agentId);
        fetchAgentMemory(agentId);
        setUploadSuccess(true);
        setTimeout(() => setUploadSuccess(false), 3000);
      } else {
        const errData = await response.json();
        alert(`Upload failed: ${errData.error || 'Unknown error'}`);
      }
    } catch (e: any) {
      alert(`Upload error: ${e.message}`);
    }
    finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteFile = async (agentId: number, fileId: number) => {
    try {
      await apiFetch(`/api/agents/${agentId}/training-files/${fileId}`, { method: 'DELETE' });
      fetchTrainingFiles(agentId);
      fetchAgentMemory(agentId);
    } catch (e) {}
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedAgentId) return;
    const fd = new FormData();
    fd.append('avatar', file);
    try {
      const response = await fetch(`/api/agents/${selectedAgentId}/avatar`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: fd,
      });
      if (response.ok) {
        const data = await response.json();
        setFormData(prev => ({ ...prev, avatar: data.avatarUrl }));
        fetchAgents();
      }
    } catch (e) {}
  };

  const handleExport = async (id?: number) => {
    const targetId = id || selectedAgentId;
    if (!targetId) return;
    try {
      const data = await apiFetch(`/api/agents/${targetId}/export`);
      
      // Download as file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `agent_${data.agent?.name || targetId}_export.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Also copy to clipboard for convenience
      navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 3000);
    } catch (error: any) {
      setError('Failed to export agent data');
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        setImportJson(content);
      } catch (err) {
        alert('Failed to read file');
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!importJson.trim()) return;
    setIsImporting(true);
    try {
      const data = JSON.parse(importJson);
      const response = await apiFetch('/api/agents/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      if (response.id) {
        setSelectedAgentId(response.id);
        fetchAgents();
        setShowImportModal(false);
        setImportJson('');
      }
    } catch (error: any) {
      alert('Invalid JSON format or import failed: ' + error.message);
    } finally {
      setIsImporting(false);
    }
  };

  // ── Services Builder helpers ──────────────────────────────
  const addService = () => {
    const id = `svc_${Date.now()}`;
    const newSvc: Service = { id, name: '', keywords: [], ask_for: '', pricing: 'not_allowed', price_details: '', custom_reply: '', portfolio_file: '', portfolios: [] };
    setAgentConfig(prev => ({ ...prev, services: [...prev.services, newSvc] }));
    setExpandedService(id);
  };

  const updateService = (id: string, field: keyof Service, value: any) => {
    setAgentConfig(prev => ({
      ...prev,
      services: prev.services.map(s => s.id === id ? { ...s, [field]: value } : s)
    }));
  };

  const addPortfolio = (serviceId: string) => {
    setAgentConfig(prev => ({
      ...prev,
      services: prev.services.map(s => s.id === serviceId
        ? { ...s, portfolios: [...(s.portfolios || []), { file: '', link: '' }] }
        : s
      )
    }));
  };

  const updatePortfolio = (serviceId: string, index: number, field: 'file' | 'link', value: string) => {
    setAgentConfig(prev => ({
      ...prev,
      services: prev.services.map(s => s.id === serviceId
        ? {
            ...s,
            portfolios: (s.portfolios || []).map((p, i) => i === index ? { ...p, [field]: value } : p)
          }
        : s
      )
    }));
  };

  const removePortfolio = (serviceId: string, index: number) => {
    setAgentConfig(prev => ({
      ...prev,
      services: prev.services.map(s => s.id === serviceId
        ? { ...s, portfolios: (s.portfolios || []).filter((_, i) => i !== index) }
        : s
      )
    }));
  };

  const removeService = (id: string) => {
    setAgentConfig(prev => ({ ...prev, services: prev.services.filter(s => s.id !== id) }));
  };

  const addKeyword = (serviceId: string, keyword: string) => {
    if (!keyword.trim()) return;
    setAgentConfig(prev => ({
      ...prev,
      services: prev.services.map(s => s.id === serviceId
        ? { ...s, keywords: [...s.keywords.filter(k => k !== keyword.trim()), keyword.trim()] }
        : s
      )
    }));
  };

  const removeKeyword = (serviceId: string, keyword: string) => {
    setAgentConfig(prev => ({
      ...prev,
      services: prev.services.map(s => s.id === serviceId
        ? { ...s, keywords: s.keywords.filter(k => k !== keyword) }
        : s
      )
    }));
  };

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="min-h-[600px] flex flex-col relative">
      {/* Top Navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between px-4 md:px-8 border-b border-gray-100 bg-white/80 backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-2 mr-4 md:mr-6 pr-4 md:pr-6 border-r border-gray-100 py-4">
            <button onClick={() => onNavigate?.('dashboard')} className="p-2 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-xl transition-all" title="Dashboard">
              <LayoutDashboard className="w-5 h-5" />
            </button>
          </div>
          <div className="flex items-center">
            {[
              { id: 'agents', label: 'Profile' },
              { id: 'services', label: 'Services' },
              { id: 'knowledge', label: 'Knowledge' },
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveSubTab(tab.id as any)}
                className={`px-4 md:px-6 py-4 text-[10px] md:text-sm font-black uppercase tracking-widest transition-all border-b-2 whitespace-nowrap ${activeSubTab === tab.id ? 'border-primary text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        {selectedAgentId && (
          <div className="md:hidden px-4 py-2 border-t border-gray-50 flex justify-between items-center bg-gray-50/50">
            <button onClick={() => setSelectedAgentId(null)} className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-1">
              <ChevronLeft className="w-3 h-3" /> Back to Agents
            </button>
            <span className="text-[10px] font-bold text-gray-400 truncate max-w-[150px]">
              Editing: {agents.find(a => a.id === selectedAgentId)?.name}
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden relative z-10">
        {/* Sidebar */}
        <div className={`w-full md:w-[240px] border-r border-gray-100 flex flex-col bg-white/50 backdrop-blur-sm shrink-0 ${selectedAgentId ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-3 border-b border-gray-100 flex gap-2">
            <button onClick={() => setShowImportModal(true)}
              className="flex-1 py-2.5 bg-white border border-gray-200 text-gray-600 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-gray-50 transition-all">
              <Upload className="w-3 h-3" /> Import
            </button>
            <button onClick={() => setSelectedAgentId(null)}
              className="flex-1 py-2.5 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-primary/20">
              <Plus className="w-3 h-3" /> New
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-6 space-y-3">
            {agents.map(agent => (
              <div key={agent.id} onClick={() => setSelectedAgentId(agent.id)}
                className={`w-full p-3 rounded-2xl text-left transition-all group relative cursor-pointer border ${selectedAgentId === agent.id ? 'bg-white border-primary/20 shadow-lg ring-1 ring-primary/5' : 'bg-transparent border-transparent hover:bg-white/80 hover:border-gray-100'}`}>
                <div className="flex items-center gap-3">
                  <div className="relative shrink-0">
                    <img src={agent.avatar || AVATARS[0]} alt={agent.name} className="w-10 h-10 rounded-xl bg-gray-100 shadow-sm object-cover" />
                    {agent.is_active === 1 && <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-primary border-2 border-white rounded-full" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-gray-900 text-sm truncate">{agent.name}</h4>
                    <p className="text-[10px] text-gray-400 truncate font-medium">{agent.brand_company || 'AI Assistant'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-all">
                  <button onClick={(e) => { e.stopPropagation(); handleExport(agent.id); }}
                    className="p-1.5 text-gray-300 hover:text-primary transition-colors" title="Download Agent Data">
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(agent.id); }}
                    className="p-1.5 text-gray-300 hover:text-red-500 transition-colors" title="Delete Agent">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
            {agents.length === 0 && (
              <div className="text-center py-10 px-4">
                <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3 text-gray-400"><Users className="w-6 h-6" /></div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">No agents yet</p>
              </div>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto">

          {/* ── BASIC INFO TAB ── */}
          {activeSubTab === 'agents' && (
            <div className="w-full p-6 md:p-10 max-w-3xl mx-auto">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-3xl font-black text-slate-900 tracking-tight">Agent Profile</h2>
                  <p className="text-gray-400 text-sm mt-1">Define who your agent is and what business it represents.</p>
                </div>
              </div>

              <div className="space-y-6">
                {/* Avatar + Name */}
                <div className="bg-white border border-gray-100 p-8 rounded-3xl shadow-sm space-y-6">
                  <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
                    {/* Avatar */}
                    <div className="shrink-0 flex flex-col items-center">
                      <div className="relative group/av w-24 h-24 cursor-pointer" onClick={() => avatarInputRef.current?.click()}>
                        <img src={formData.avatar || AVATARS[0]} className="w-24 h-24 rounded-2xl object-cover border-2 border-gray-100" />
                        <div className="absolute inset-0 bg-black/40 rounded-2xl opacity-0 group-hover/av:opacity-100 transition-all flex items-center justify-center">
                          <Upload className="w-6 h-6 text-white" />
                        </div>
                      </div>
                      <input type="file" ref={avatarInputRef} className="hidden" onChange={handleAvatarUpload} accept="image/*" />
                      <div className="flex gap-1.5 mt-3">
                        {AVATARS.map((url, i) => (
                          <button key={i} onClick={() => setFormData({ ...formData, avatar: url })}
                            className={`w-7 h-7 rounded-lg overflow-hidden border-2 transition-all ${formData.avatar === url ? 'border-primary' : 'border-transparent opacity-40 hover:opacity-100'}`}>
                            <img src={url} className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Name + Company */}
                    <div className="flex-1 w-full space-y-4">
                      <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Agent Name *</label>
                        <input type="text" placeholder="e.g. Sara" value={formData.name || ''}
                          className={`w-full bg-gray-50 border ${validationErrors.name ? 'border-red-400' : 'border-gray-200'} rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20`}
                          onChange={e => setFormData({ ...formData, name: e.target.value })} />
                        {validationErrors.name && <p className="text-[10px] text-red-500 font-bold mt-1">{validationErrors.name}</p>}
                      </div>
                      <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Business / Brand Name *</label>
                        <input type="text" placeholder="e.g. Ondigix Digital" value={formData.brand_company || ''}
                          className={`w-full bg-gray-50 border ${validationErrors.brand_company ? 'border-red-400' : 'border-gray-200'} rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20`}
                          onChange={e => setFormData({ ...formData, brand_company: e.target.value })} />
                      </div>
                    </div>
                  </div>

                  {/* Objective */}
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">What does this agent do? *</label>
                    <textarea placeholder="e.g. Help clients with Digital Marketing, answer queries, share pricing and portfolios on request"
                      value={formData.objective || ''} rows={3}
                      className={`w-full bg-gray-50 border ${validationErrors.objective ? 'border-red-400' : 'border-gray-200'} rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20 resize-none`}
                      onChange={e => setFormData({ ...formData, objective: e.target.value })} />
                  </div>

                  {/* Tone */}
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Tone / Personality</label>
                    <div className="flex flex-wrap gap-2">
                      {['Professional', 'Friendly', 'Formal', 'Casual', 'Persuasive', 'Supportive'].map(t => (
                        <button key={t} onClick={() => setFormData({ ...formData, tone: t })}
                          className={`px-4 py-2 rounded-xl text-[10px] md:text-xs font-black border transition-all ${formData.tone === t ? 'bg-primary text-white border-primary' : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-primary/40'}`}>
                          {t}
                        </button>
                      ))}
                      <input type="text" placeholder="Custom..." value={!['Professional','Friendly','Formal','Casual','Persuasive','Supportive'].includes(formData.tone || '') ? formData.tone || '' : ''}
                        className="px-4 py-2 rounded-xl text-[10px] md:text-xs font-bold bg-gray-50 border border-gray-200 outline-none focus:ring-2 focus:ring-primary/20 w-24 md:w-32"
                        onChange={e => setFormData({ ...formData, tone: e.target.value })} />
                    </div>
                  </div>

                  {/* Language */}
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Primary Language</label>
                    <div className="flex gap-2">
                      {['English', 'Urdu', 'Both'].map(l => (
                        <button key={l} onClick={() => setFormData({ ...formData, others: l })}
                          className={`px-4 py-2 rounded-xl text-xs font-black border transition-all ${formData.others === l ? 'bg-primary text-white border-primary' : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-primary/40'}`}>
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Save Button */}
                <div className="flex justify-end">
                  <button onClick={() => handleSave(selectedAgentId || undefined)}
                    className={`px-10 py-4 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl transition-all flex items-center gap-2 ${saveSuccess ? 'bg-emerald-500 text-white' : 'bg-slate-900 text-white hover:bg-primary'}`}>
                    {saveSuccess ? <><Check className="w-4 h-4" /> Saved!</> : <>{selectedAgentId ? <RefreshCw className="w-4 h-4" /> : <Plus className="w-4 h-4" />}{selectedAgentId ? 'Update Agent' : 'Create Agent'}</>}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── SERVICES & FLOW TAB ── */}
          {activeSubTab === 'services' && (
            <div className="w-full p-6 md:p-10 max-w-3xl mx-auto">
              <div className="mb-8">
                <h2 className="text-3xl font-black text-slate-900 tracking-tight">Services & Flow</h2>
                <p className="text-gray-400 text-sm mt-1">Define your services, keywords, pricing rules — no coding needed.</p>
              </div>

              {!selectedAgentId ? (
                <div className="flex flex-col items-center justify-center h-60 bg-white border border-dashed border-gray-200 rounded-3xl text-center">
                  <Settings2 className="w-10 h-10 text-gray-200 mb-3" />
                  <p className="text-gray-400 font-black text-xs uppercase tracking-widest">Select an agent first</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Messages */}
                  <div className="bg-white border border-gray-100 p-6 rounded-3xl shadow-sm space-y-5">
                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Auto Messages</h3>
                    <div>
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2">Greeting Message (First Message)</label>
                      <input type="text"
                        placeholder={`e.g. Assalam o Alaikum! I'm ${formData.name || 'Sara'} from ${formData.brand_company || 'your company'}. How can I assist you today?`}
                        value={agentConfig.greeting_message}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20"
                        onChange={e => setAgentConfig(prev => ({ ...prev, greeting_message: e.target.value }))} />
                      <p className="text-[10px] text-gray-400 mt-1">Leave empty to let AI generate naturally.</p>
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2">Fallback Message (When confused)</label>
                      <input type="text"
                        value={agentConfig.fallback_message}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20"
                        onChange={e => setAgentConfig(prev => ({ ...prev, fallback_message: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2">No Pricing Message</label>
                      <input type="text"
                        value={agentConfig.no_pricing_message}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20"
                        onChange={e => setAgentConfig(prev => ({ ...prev, no_pricing_message: e.target.value }))} />
                    </div>
                  </div>

                  {/* Services */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Services ({agentConfig.services.length})</h3>
                      <button onClick={addService}
                        className="bg-primary text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-primary/20">
                        <Plus className="w-3.5 h-3.5" /> Add Service
                      </button>
                    </div>

                    {agentConfig.services.length === 0 && (
                      <div className="flex flex-col items-center justify-center h-40 bg-gray-50 border border-dashed border-gray-200 rounded-3xl text-center">
                        <Zap className="w-8 h-8 text-gray-200 mb-2" />
                        <p className="text-gray-400 font-bold text-xs">No services yet — click "Add Service"</p>
                      </div>
                    )}

                    {agentConfig.services.map((svc, idx) => (
                      <div key={svc.id} className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                        {/* Service Header */}
                        <div className="flex items-center gap-3 p-4 cursor-pointer" onClick={() => setExpandedService(expandedService === svc.id ? null : svc.id)}>
                          <div className="w-8 h-8 bg-primary/10 rounded-xl flex items-center justify-center text-primary font-black text-sm">{idx + 1}</div>
                          <div className="flex-1">
                            <p className="font-black text-gray-900 text-sm">{svc.name || 'Untitled Service'}</p>
                            <p className="text-[10px] text-gray-400">
                              {svc.keywords.length > 0 ? svc.keywords.slice(0, 3).join(', ') + (svc.keywords.length > 3 ? '...' : '') : 'No keywords yet'}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase ${svc.pricing === 'allowed' ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>
                              {svc.pricing === 'allowed' ? '$ Pricing On' : 'No Pricing'}
                            </span>
                            <button onClick={e => { e.stopPropagation(); removeService(svc.id); }} className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            {expandedService === svc.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                          </div>
                        </div>

                        {/* Service Body */}
                        <AnimatePresence>
                          {expandedService === svc.id && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                              className="border-t border-gray-100 p-4 space-y-4 bg-gray-50/50">
                              
                              {/* Service Name */}
                              <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">Service Name</label>
                                <input type="text" placeholder="e.g. SEO, Web Design, Backlinks"
                                  value={svc.name}
                                  className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20"
                                  onChange={e => updateService(svc.id, 'name', e.target.value)} />
                              </div>

                              {/* Keywords */}
                              <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">
                                  <Tag className="w-3 h-3 inline mr-1" />Trigger Keywords
                                </label>
                                <div className="flex flex-wrap gap-2 mb-2">
                                  {svc.keywords.map(kw => (
                                    <span key={kw} className="flex items-center gap-1 bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-black">
                                      {kw}
                                      <button onClick={() => removeKeyword(svc.id, kw)} className="hover:text-red-500 ml-0.5"><X className="w-3 h-3" /></button>
                                    </span>
                                  ))}
                                </div>
                                <div className="flex gap-2">
                                  <input type="text" placeholder="Type keyword + Enter" id={`kw_${svc.id}`}
                                    className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-primary/20"
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') {
                                        addKeyword(svc.id, (e.target as HTMLInputElement).value);
                                        (e.target as HTMLInputElement).value = '';
                                      }
                                    }} />
                                  <button onClick={() => {
                                    const inp = document.getElementById(`kw_${svc.id}`) as HTMLInputElement;
                                    if (inp) { addKeyword(svc.id, inp.value); inp.value = ''; }
                                  }} className="px-3 py-2 bg-primary text-white rounded-xl text-xs font-black">Add</button>
                                </div>
                                <p className="text-[10px] text-gray-400 mt-1">If client message contains any of these words → this service is detected.</p>
                              </div>

                              {/* Ask For */}
                              <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">
                                  <HelpCircle className="w-3 h-3 inline mr-1" />Ask Client For (optional)
                                </label>
                                <select value={svc.ask_for}
                                  className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20"
                                  onChange={e => updateService(svc.id, 'ask_for', e.target.value)}>
                                  <option value="">— Nothing (just reply) —</option>
                                  <option value="website_url">Website URL</option>
                                  <option value="phone_number">Phone Number</option>
                                  <option value="email">Email Address</option>
                                  <option value="budget">Budget</option>
                                  <option value="requirement_details">Requirement Details</option>
                                  <option value="business_name">Business Name</option>
                                </select>
                              </div>

                              {/* Pricing Toggle */}
                              <div className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-xl">
                                <div className="flex items-center gap-2">
                                  <DollarSign className="w-4 h-4 text-gray-400" />
                                  <div>
                                    <p className="text-sm font-black text-gray-800">Pricing Allowed?</p>
                                    <p className="text-[10px] text-gray-400">Can agent share price for this service?</p>
                                  </div>
                                </div>
                                <button onClick={() => updateService(svc.id, 'pricing', svc.pricing === 'allowed' ? 'not_allowed' : 'allowed')}
                                  className={`w-12 h-6 rounded-full transition-all relative ${svc.pricing === 'allowed' ? 'bg-emerald-500' : 'bg-gray-200'}`}>
                                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${svc.pricing === 'allowed' ? 'left-7' : 'left-1'}`} />
                                </button>
                              </div>

                              {/* Price Details (if allowed) */}
                              {svc.pricing === 'allowed' && (
                                <div>
                                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">Price Details</label>
                                  <textarea placeholder="e.g. Basic: $150/mo, Standard: $300/mo, Premium: $500/mo"
                                    value={svc.price_details || ''} rows={2}
                                    className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                                    onChange={e => updateService(svc.id, 'price_details', e.target.value)} />
                                </div>
                              )}

                              {/* Custom Reply */}
                              <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">Custom Reply for this Service (optional)</label>
                                <textarea placeholder="Leave empty to let AI reply naturally. Or write a fixed reply here."
                                  value={svc.custom_reply || ''} rows={2}
                                  className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                                  onChange={e => updateService(svc.id, 'custom_reply', e.target.value)} />
                              </div>

                              {/* Portfolio Selection */}
                              <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                    <FileText className="w-3 h-3" /> Portfolio(s) to Send (optional)
                                  </label>
                                  <button 
                                    onClick={() => addPortfolio(svc.id)}
                                    className="flex items-center gap-1 text-[10px] font-black text-primary uppercase hover:bg-primary/5 px-2 py-1 rounded-lg transition-all"
                                  >
                                    <Plus className="w-3 h-3" /> Add Portfolio
                                  </button>
                                </div>

                                <div className="space-y-3">
                                  {(svc.portfolios || []).map((p, pIdx) => (
                                    <div key={`${svc.id}_p_${pIdx}`} className="bg-white border border-gray-200 rounded-xl p-3 space-y-3 relative group/p">
                                      <button 
                                        onClick={() => removePortfolio(svc.id, pIdx)}
                                        className="absolute -top-2 -right-2 w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:border-red-200 shadow-sm transition-all"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                      
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div>
                                          <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Select File</label>
                                          <select 
                                            value={p.file || ''}
                                            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-bold outline-none focus:ring-2 focus:ring-primary/20"
                                            onChange={e => updatePortfolio(svc.id, pIdx, 'file', e.target.value)}
                                          >
                                            <option value="">— No File —</option>
                                            {trainingFiles.filter(f => f.category === 'portfolio').map(file => (
                                              <option key={file.id} value={file.original_name}>
                                                {file.original_name}
                                              </option>
                                            ))}
                                          </select>
                                        </div>
                                        <div>
                                          <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Or Video/Web Link</label>
                                          <div className="relative">
                                            <Globe className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                                            <input 
                                              type="text" 
                                              placeholder="https://youtube.com/..."
                                              value={p.link || ''}
                                              className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-7 pr-2 py-1.5 text-xs font-bold outline-none focus:ring-2 focus:ring-primary/20"
                                              onChange={e => updatePortfolio(svc.id, pIdx, 'link', e.target.value)}
                                            />
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  ))}

                                  {/* Legacy single file support (migration) */}
                                  {svc.portfolio_file && (!svc.portfolios || svc.portfolios.length === 0) && (
                                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-amber-500" />
                                        <span className="text-xs font-bold text-amber-700">{svc.portfolio_file}</span>
                                      </div>
                                      <button 
                                        onClick={() => {
                                          const currentPortfolios = svc.portfolios || [];
                                          updateService(svc.id, 'portfolios', [...currentPortfolios, { file: svc.portfolio_file, link: '' }]);
                                          updateService(svc.id, 'portfolio_file', '');
                                        }}
                                        className="text-[10px] font-black text-amber-600 uppercase hover:underline"
                                      >
                                        Migrate to Multi
                                      </button>
                                    </div>
                                  )}

                                  {(svc.portfolios || []).length === 0 && !svc.portfolio_file && (
                                    <div className="text-center py-4 bg-gray-50/50 border border-dashed border-gray-200 rounded-xl">
                                      <p className="text-[10px] font-bold text-gray-400 uppercase">No portfolios added</p>
                                    </div>
                                  )}
                                </div>
                                <p className="text-[10px] text-gray-400 mt-1">If this service is triggered, these portfolios will be sent automatically.</p>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}
                  </div>

                  {/* Save */}
                  <div className="flex justify-end items-center gap-4">
                    <button onClick={() => handleSave(selectedAgentId)}
                      className={`px-10 py-4 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl transition-all flex items-center gap-2 ${saveSuccess ? 'bg-emerald-500 text-white' : 'bg-slate-900 text-white hover:bg-primary'}`}>
                      {saveSuccess ? <><Check className="w-4 h-4" /> Saved!</> : <><RefreshCw className="w-4 h-4" /> Save Config</>}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── KNOWLEDGE TAB ── */}
          {activeSubTab === 'knowledge' && (
            <div className="w-full max-w-4xl mx-auto p-4 md:p-10">
              {!selectedAgentId ? (
                <div className="flex flex-col items-center justify-center h-80 bg-white border border-gray-100 rounded-3xl text-center">
                  <BrainCircuit className="w-10 h-10 text-gray-200 mb-3" />
                  <p className="text-gray-400 font-black uppercase tracking-widest text-xs">Select an agent first</p>
                </div>
              ) : (
                <div className="space-y-8">
                  {/* Knowledge Sub-Tabs */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Agent Knowledge</h2>
                      <p className="text-gray-400 text-sm mt-1">Train your agent with specific data categories.</p>
                    </div>
                    <div className="flex bg-gray-100 p-1 rounded-2xl self-start">
                      {(['training', 'portfolio', 'rules'] as const).map(cat => (
                        <button
                          key={cat}
                          onClick={() => {
                            setUploadCategory(cat);
                            setActiveTrainTab(null);
                          }}
                          className={`px-4 md:px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                            uploadCategory === cat 
                              ? 'bg-white text-primary shadow-sm' 
                              : 'text-gray-400 hover:text-gray-600'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  {activeTrainTab === null ? (
                    <div className="pt-4">
                      <div className={`grid grid-cols-1 ${uploadCategory === 'training' ? 'md:grid-cols-2' : ''} gap-6`}>
                        {uploadCategory === 'training' && (
                          <button onClick={() => setActiveTrainTab('chat')}
                            className="group p-6 md:p-8 bg-white border-2 border-gray-100 rounded-3xl hover:border-primary/40 hover:shadow-xl transition-all text-left">
                            <div className="w-12 h-12 md:w-14 md:h-14 bg-primary/5 rounded-2xl flex items-center justify-center mb-5 group-hover:bg-primary transition-all">
                              <MessageSquare className="w-6 h-6 md:w-7 md:h-7 text-primary group-hover:text-white transition-all" />
                            </div>
                            <h3 className="text-lg md:text-xl font-black text-gray-900 mb-2">Train {uploadCategory} with Chat</h3>
                            <p className="text-xs md:text-sm text-gray-500 leading-relaxed">Talk to your agent about {uploadCategory}. It learns from your instructions and saves them as memory.</p>
                            <div className="mt-5 flex items-center gap-2 text-primary font-black text-[10px] md:text-xs uppercase tracking-widest">Start Training →</div>
                          </button>
                        )}

                        <button onClick={() => setActiveTrainTab('document')}
                          className={`group p-6 md:p-8 bg-white border-2 border-gray-100 rounded-3xl hover:border-purple-400/40 hover:shadow-xl transition-all text-left ${uploadCategory !== 'training' ? 'max-w-xl mx-auto w-full' : ''}`}>
                          <div className="w-12 h-12 md:w-14 md:h-14 bg-purple-50 rounded-2xl flex items-center justify-center mb-5 group-hover:bg-purple-500 transition-all">
                            <FileText className="w-6 h-6 md:w-7 md:h-7 text-purple-500 group-hover:text-white transition-all" />
                          </div>
                          <h3 className="text-lg md:text-xl font-black text-gray-900 mb-2">Upload {uploadCategory} Document</h3>
                          <p className="text-xs md:text-sm text-gray-500 leading-relaxed">Upload PDF, Word, or text related to {uploadCategory}. Agent reads and extracts all knowledge.</p>
                          <div className="mt-5 flex items-center gap-2 text-purple-500 font-black text-[10px] md:text-xs uppercase tracking-widest">Upload File →</div>
                        </button>
                      </div>

                      {/* Files for this category */}
                      <div className="mt-12">
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-4">Existing {uploadCategory} Documents</h3>
                        {trainingFiles.filter(f => f.category === uploadCategory).length > 0 ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {trainingFiles.filter(f => f.category === uploadCategory).map(file => (
                              <div key={file.id} className="flex items-center justify-between bg-white border border-gray-100 p-4 rounded-2xl group shadow-sm">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center text-purple-500 shrink-0"><FileText className="w-5 h-5" /></div>
                                  <div className="min-w-0">
                                    <p className="text-sm font-bold text-gray-900 truncate">{file.original_name}</p>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase">{new Date(file.created_at).toLocaleDateString()}</p>
                                  </div>
                                </div>
                                <button onClick={() => handleDeleteFile(selectedAgentId!, file.id)}
                                  className="p-2 text-gray-200 hover:text-red-500 hover:bg-red-50 rounded-xl md:opacity-0 group-hover:opacity-100 transition-all">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="bg-gray-50/50 border border-dashed border-gray-200 rounded-3xl p-8 text-center">
                            <FileText className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">No {uploadCategory} files added yet</p>
                          </div>
                        )}
                      </div>

                      {/* MEMORY PREVIEW (Rules/Knowledge) */}
                      {uploadCategory !== 'portfolio' && (
                        <div className="mt-12 bg-gray-50/30 rounded-[2.5rem] p-6 md:p-8 border border-gray-100">
                          <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-900 leading-none">Extracted {uploadCategory} Knowledge</h3>
                                <p className="text-[10px] font-bold text-gray-400 uppercase mt-1">Rules & Info saved in agent's mind</p>
                            </div>
                            <button onClick={() => fetchAgentMemory(selectedAgentId!)} className="p-2 hover:bg-white rounded-xl text-primary transition-all shadow-sm border border-gray-100"><RefreshCw className="w-4 h-4" /></button>
                        </div>

                        {agentMemory.filter(m => {
                            if (uploadCategory === 'rules') return m.topic.startsWith('rule_');
                            return !m.topic.startsWith('rule_') && !m.topic.startsWith('portfolio_');
                        }).length > 0 ? (
                            <div className="space-y-3">
                                {agentMemory.filter(m => {
                                    if (uploadCategory === 'rules') return m.topic.startsWith('rule_');
                                    return !m.topic.startsWith('rule_') && !m.topic.startsWith('portfolio_');
                                }).map(m => (
                                    <div key={m.id} className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm flex items-start justify-between gap-4 group">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <div className={`w-2 h-2 rounded-full ${m.topic.startsWith('rule_') ? 'bg-red-400' : 'bg-green-400'}`} />
                                                <span className="text-[10px] font-black uppercase text-gray-400 truncate">{m.topic.replace('rule_', '').replace('portfolio_', '').replace(/_/g, ' ')}</span>
                                            </div>
                                            <p className="text-xs font-medium text-slate-700 leading-relaxed">{m.content}</p>
                                        </div>
                                        <button 
                                            onClick={async () => {
                                                if (confirm('Forget this memory?')) {
                                                    await apiFetch(`/api/agents/${selectedAgentId}/memory/${m.id}`, { method: 'DELETE' });
                                                    fetchAgentMemory(selectedAgentId!);
                                                }
                                            }}
                                            className="p-2 text-gray-200 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-8">
                                <p className="text-[10px] font-bold text-gray-300 uppercase italic">Agent hasn't learned any specific {uploadCategory} details yet.</p>
                            </div>
                        )}
                      </div>
                      )}
                    </div>
                  ) : activeTrainTab === 'chat' ? (
                    <div className="bg-white border border-gray-100 rounded-[2.5rem] shadow-xl overflow-hidden">
                      <div className="flex items-center justify-between p-4 md:p-6 border-b border-gray-50">
                        <div className="flex items-center gap-3">
                          <button onClick={() => setActiveTrainTab(null)} className="p-2 hover:bg-gray-100 rounded-xl text-gray-400"><ChevronLeft className="w-5 h-5" /></button>
                          <div>
                            <h2 className="text-lg md:text-xl font-black text-gray-900 uppercase tracking-tight">Training: {uploadCategory}</h2>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Chat with agent to teach it {uploadCategory}</p>
                          </div>
                        </div>
                      </div>
                      <div className="h-[600px]">
                        <AgentGuide agentId={selectedAgentId} token={token} category={uploadCategory} />
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white border border-gray-100 p-6 md:p-10 rounded-[2.5rem] shadow-xl">
                      <div className="flex items-center gap-3 mb-8">
                        <button onClick={() => setActiveTrainTab(null)} className="p-2 hover:bg-gray-100 rounded-xl text-gray-400"><ChevronLeft className="w-5 h-5" /></button>
                        <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight">Upload {uploadCategory}</h2>
                      </div>
                      
                      <div className="max-w-2xl mx-auto">
                        <div onClick={() => fileInputRef.current?.click()}
                          className="border-2 border-dashed border-gray-200 hover:border-primary/50 rounded-3xl p-8 md:p-16 flex flex-col items-center text-center cursor-pointer hover:bg-primary/5 transition-all group mb-6">
                          <div className="w-16 h-16 bg-gray-50 group-hover:bg-primary/10 rounded-2xl flex items-center justify-center mb-4 transition-all">
                            <Upload className="w-8 h-8 text-gray-300 group-hover:text-primary transition-all" />
                          </div>
                          <h3 className="text-lg font-black text-gray-700 mb-1">Drop your {uploadCategory} file here</h3>
                          <p className="text-sm text-gray-400">PDF, DOC, DOCX, TXT supported</p>
                          <input type="file" ref={fileInputRef} className="hidden"
                            onChange={e => selectedAgentId && handleFileUpload(selectedAgentId, e)}
                            accept=".txt,.pdf,.doc,.docx" />
                        </div>
                        
                        {isUploading && (
                          <div className="flex items-center gap-3 p-5 bg-primary/5 text-primary rounded-2xl border border-primary/10 mb-6 animate-pulse">
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span className="text-sm font-black uppercase tracking-widest">Processing {uploadCategory} Knowledge...</span>
                          </div>
                        )}
                        
                        {uploadSuccess && (
                          <div className="flex items-center gap-3 p-5 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-100 mb-6">
                            <Check className="w-5 h-5" />
                            <span className="text-sm font-black uppercase tracking-widest">{uploadCategory} stored successfully!</span>
                          </div>
                        )}

                        {trainingFiles.filter(f => f.category === uploadCategory).length > 0 && (
                          <div className="mt-8">
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-4">Uploaded {uploadCategory} Documents</h3>
                            <div className="space-y-3">
                              {trainingFiles.filter(f => f.category === uploadCategory).map(file => (
                                <div key={file.id} className="flex items-center justify-between bg-gray-50 border border-gray-100 p-4 rounded-2xl group">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-purple-500 shrink-0 shadow-sm"><FileText className="w-5 h-5" /></div>
                                    <div className="min-w-0">
                                      <p className="text-sm font-bold text-gray-900 truncate">{file.original_name}</p>
                                      <p className="text-[10px] font-bold text-gray-400 uppercase">{new Date(file.created_at).toLocaleDateString()}</p>
                                    </div>
                                  </div>
                                  <button onClick={() => handleDeleteFile(selectedAgentId!, file.id)}
                                    className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Import Modal */}
      <AnimatePresence>
        {showImportModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowImportModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl overflow-hidden">
              <div className="p-8">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-2xl font-black text-gray-900">Import Agent</h3>
                  <button onClick={() => setShowImportModal(false)} className="p-2 hover:bg-gray-100 rounded-xl transition-all">
                    <X className="w-6 h-6 text-gray-400" />
                  </button>
                </div>
                <p className="text-gray-500 text-sm mb-6 font-medium">Upload the agent JSON file to recreate it exactly.</p>
                
                <div className="mb-6">
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-200 rounded-3xl cursor-pointer hover:bg-gray-50 hover:border-primary/50 transition-all group">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <Upload className="w-8 h-8 text-gray-400 group-hover:text-primary mb-2 transition-all" />
                      <p className="text-xs font-black uppercase tracking-widest text-gray-500 group-hover:text-primary">
                        {importJson ? 'File Selected ✓' : 'Click to upload JSON'}
                      </p>
                    </div>
                    <input type="file" className="hidden" accept=".json" onChange={handleImportFile} />
                  </label>
                </div>

                {importJson && (
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-2">
                       <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Preview Data</span>
                       <button onClick={() => setImportJson('')} className="text-[10px] font-black uppercase text-red-500 hover:underline">Clear</button>
                    </div>
                    <textarea
                      value={importJson}
                      readOnly
                      className="w-full h-32 bg-gray-50 border border-gray-200 rounded-2xl p-4 text-[10px] font-mono outline-none resize-none overflow-y-auto"
                    />
                  </div>
                )}

                <div className="mt-8 flex gap-4">
                  <button onClick={() => { setShowImportModal(false); setImportJson(''); }}
                    className="flex-1 py-4 rounded-2xl font-black uppercase tracking-widest text-xs border border-gray-200 text-gray-600 hover:bg-gray-50 transition-all">
                    Cancel
                  </button>
                  <button onClick={handleImport} disabled={isImporting || !importJson.trim()}
                    className="flex-1 py-4 bg-primary text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-primary/20 hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                    {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Confirm Import
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}