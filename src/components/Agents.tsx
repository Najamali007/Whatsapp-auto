import React, { useState, useEffect, useRef } from 'react';
import { Users, Plus, Trash2, Edit2, Check, X, Loader2, BrainCircuit, Upload, FileText, AlertCircle, Layers, User, Zap, Sparkles, Target, RefreshCw, MessageSquare, LayoutDashboard, Settings2, ChevronDown, ChevronUp, Tag, DollarSign, HelpCircle, Globe } from 'lucide-react';
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
  const [hasApiKeys, setHasApiKeys] = useState<boolean>(true);
  const [saveSuccess, setSaveSuccess] = useState(false);
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
      const [agentsData, settingsCheck] = await Promise.all([
        apiFetch('/api/agents'),
        apiFetch('/api/settings/check')
      ]);
      setAgents(agentsData);
      setHasApiKeys(settingsCheck.hasApiKeys);
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

  useEffect(() => { fetchAgents(); }, []);

  useEffect(() => {
    if (selectedAgentId) fetchTrainingFiles(selectedAgentId);
    else setTrainingFiles([]);
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
    if (!hasApiKeys && !id) {
      loadingManager.setError('Please add an API key in Settings first.');
      return;
    }
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
    try {
      const response = await fetch(`/api/agents/${agentId}/train-file`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: fd,
      });
      if (response.ok) {
        fetchTrainingFiles(agentId);
        setUploadSuccess(true);
        setTimeout(() => setUploadSuccess(false), 3000);
      }
    } catch (e) {}
    finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteFile = async (agentId: number, fileId: number) => {
    try {
      await apiFetch(`/api/agents/${agentId}/training-files/${fileId}`, { method: 'DELETE' });
      fetchTrainingFiles(agentId);
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

  // ── Services Builder helpers ──────────────────────────────
  const addService = () => {
    const id = `svc_${Date.now()}`;
    const newSvc: Service = { id, name: '', keywords: [], ask_for: '', pricing: 'not_allowed', price_details: '', custom_reply: '' };
    setAgentConfig(prev => ({ ...prev, services: [...prev.services, newSvc] }));
    setExpandedService(id);
  };

  const updateService = (id: string, field: keyof Service, value: any) => {
    setAgentConfig(prev => ({
      ...prev,
      services: prev.services.map(s => s.id === id ? { ...s, [field]: value } : s)
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
      <div className="flex items-center px-8 border-b border-gray-100 bg-white/80 backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center gap-2 mr-6 pr-6 border-r border-gray-100">
          <button onClick={() => onNavigate?.('dashboard')} className="p-2 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-xl transition-all" title="Dashboard">
            <LayoutDashboard className="w-5 h-5" />
          </button>
        </div>
        {[
          { id: 'agents', label: 'Basic Info' },
          { id: 'services', label: 'Services & Flow' },
          { id: 'knowledge', label: 'Knowledge' },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveSubTab(tab.id as any)}
            className={`px-6 py-4 text-sm font-black uppercase tracking-widest transition-all border-b-2 ${activeSubTab === tab.id ? 'border-primary text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 flex overflow-hidden relative z-10">
        {/* Sidebar */}
        <div className={`w-full md:w-[220px] border-r border-gray-100 flex flex-col bg-white/50 backdrop-blur-sm shrink-0 ${selectedAgentId && activeSubTab === 'agents' ? 'hidden md:flex' : 'flex'}`}>
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
                <button onClick={(e) => { e.stopPropagation(); handleDelete(agent.id); }}
                  className="absolute top-2 right-2 p-1.5 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {agents.length === 0 && (
              <div className="text-center py-10 px-4">
                <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3 text-gray-400"><Users className="w-6 h-6" /></div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">No agents yet</p>
              </div>
            )}
          </div>
          {/* Create New */}
          <div className="p-3 border-t border-gray-100">
            <button onClick={() => setSelectedAgentId(null)}
              className="w-full py-3 bg-primary text-white rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-primary/20">
              <Plus className="w-4 h-4" /> New Agent
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto">

          {/* ── BASIC INFO TAB ── */}
          {activeSubTab === 'agents' && (
            <div className="w-full p-6 md:p-10 max-w-3xl mx-auto">
              <div className="mb-8">
                <h2 className="text-3xl font-black text-slate-900 tracking-tight">Agent Profile</h2>
                <p className="text-gray-400 text-sm mt-1">Define who your agent is and what business it represents.</p>
              </div>

              <div className="space-y-6">
                {/* Avatar + Name */}
                <div className="bg-white border border-gray-100 p-8 rounded-3xl shadow-sm space-y-6">
                  <div className="flex items-start gap-6">
                    {/* Avatar */}
                    <div className="shrink-0">
                      <div className="relative group/av w-24 h-24 cursor-pointer" onClick={() => avatarInputRef.current?.click()}>
                        <img src={formData.avatar || AVATARS[0]} className="w-24 h-24 rounded-2xl object-cover border-2 border-gray-100" />
                        <div className="absolute inset-0 bg-black/40 rounded-2xl opacity-0 group-hover/av:opacity-100 transition-all flex items-center justify-center">
                          <Upload className="w-6 h-6 text-white" />
                        </div>
                      </div>
                      <input type="file" ref={avatarInputRef} className="hidden" onChange={handleAvatarUpload} accept="image/*" />
                      <div className="flex gap-1.5 mt-2">
                        {AVATARS.map((url, i) => (
                          <button key={i} onClick={() => setFormData({ ...formData, avatar: url })}
                            className={`w-7 h-7 rounded-lg overflow-hidden border-2 transition-all ${formData.avatar === url ? 'border-primary' : 'border-transparent opacity-40 hover:opacity-100'}`}>
                            <img src={url} className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Name + Company */}
                    <div className="flex-1 space-y-4">
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
                          className={`px-4 py-2 rounded-xl text-xs font-black border transition-all ${formData.tone === t ? 'bg-primary text-white border-primary' : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-primary/40'}`}>
                          {t}
                        </button>
                      ))}
                      <input type="text" placeholder="Custom tone..." value={!['Professional','Friendly','Formal','Casual','Persuasive','Supportive'].includes(formData.tone || '') ? formData.tone || '' : ''}
                        className="px-4 py-2 rounded-xl text-xs font-bold bg-gray-50 border border-gray-200 outline-none focus:ring-2 focus:ring-primary/20 w-32"
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
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}
                  </div>

                  {/* Save */}
                  <div className="flex justify-end">
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
            <div className="w-full max-w-3xl mx-auto p-6 md:p-10">
              {!selectedAgentId ? (
                <div className="flex flex-col items-center justify-center h-80 bg-white border border-gray-100 rounded-3xl text-center">
                  <BrainCircuit className="w-10 h-10 text-gray-200 mb-3" />
                  <p className="text-gray-400 font-black uppercase tracking-widest text-xs">Select an agent first</p>
                </div>
              ) : activeTrainTab === null ? (
                <div className="max-w-2xl mx-auto pt-8">
                  <div className="text-center mb-10">
                    <h2 className="text-3xl font-black text-gray-900 tracking-tight mb-2">How do you want to train?</h2>
                    <p className="text-gray-400 font-medium">Both methods work together — use both for best results</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <button onClick={() => setActiveTrainTab('chat')}
                      className="group p-8 bg-white border-2 border-gray-100 rounded-3xl hover:border-primary/40 hover:shadow-xl transition-all text-left w-full max-w-md mx-auto">
                      <div className="w-14 h-14 bg-primary/5 rounded-2xl flex items-center justify-center mb-5 group-hover:bg-primary transition-all">
                        <MessageSquare className="w-7 h-7 text-primary group-hover:text-white transition-all" />
                      </div>
                      <h3 className="text-xl font-black text-gray-900 mb-2">Train with Chat</h3>
                      <p className="text-sm text-gray-500 leading-relaxed">Talk to your agent. It learns from your instructions and saves them as memory.</p>
                      <div className="mt-5 flex items-center gap-2 text-primary font-black text-xs uppercase tracking-widest">Start Training →</div>
                    </button>

                    <button onClick={() => setActiveTrainTab('document')}
                      className="group p-8 bg-white border-2 border-gray-100 rounded-3xl hover:border-purple-400/40 hover:shadow-xl transition-all text-left w-full max-w-md mx-auto">
                      <div className="w-14 h-14 bg-purple-50 rounded-2xl flex items-center justify-center mb-5 group-hover:bg-purple-500 transition-all">
                        <FileText className="w-7 h-7 text-purple-500 group-hover:text-white transition-all" />
                      </div>
                      <h3 className="text-xl font-black text-gray-900 mb-2">Train with Document</h3>
                      <p className="text-sm text-gray-500 leading-relaxed">Upload PDF, Word, or text. Agent reads and extracts all knowledge.</p>
                      <div className="mt-5 flex items-center gap-2 text-purple-500 font-black text-xs uppercase tracking-widest">Upload File →</div>
                    </button>
                  </div>
                </div>
              ) : activeTrainTab === 'chat' ? (
                <div>
                  <div className="flex items-center gap-3 mb-6">
                    <button onClick={() => setActiveTrainTab(null)} className="p-2 hover:bg-gray-100 rounded-xl text-gray-400"><X className="w-5 h-5" /></button>
                    <h2 className="text-xl font-black text-gray-900">Train with Chat</h2>
                  </div>
                  <AgentGuide agentId={selectedAgentId} token={token} />
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-3 mb-6">
                    <button onClick={() => setActiveTrainTab(null)} className="p-2 hover:bg-gray-100 rounded-xl text-gray-400"><X className="w-5 h-5" /></button>
                    <h2 className="text-xl font-black text-gray-900">Train with Document</h2>
                  </div>
                  <div className="max-w-2xl">
                    <div onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-gray-200 hover:border-primary/50 rounded-3xl p-12 flex flex-col items-center text-center cursor-pointer hover:bg-primary/5 transition-all group mb-6">
                      <div className="w-16 h-16 bg-gray-50 group-hover:bg-primary/10 rounded-2xl flex items-center justify-center mb-4 transition-all">
                        <Upload className="w-8 h-8 text-gray-300 group-hover:text-primary transition-all" />
                      </div>
                      <h3 className="text-lg font-black text-gray-700 mb-1">Drop your file here</h3>
                      <p className="text-sm text-gray-400">PDF, DOC, DOCX, TXT supported</p>
                      <input type="file" ref={fileInputRef} className="hidden"
                        onChange={e => selectedAgentId && handleFileUpload(selectedAgentId, e)}
                        accept=".txt,.pdf,.doc,.docx" />
                    </div>
                    {isUploading && (
                      <div className="flex items-center gap-3 p-5 bg-primary/5 text-primary rounded-2xl border border-primary/10 mb-6 animate-pulse">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span className="text-sm font-black uppercase tracking-widest">Reading & Storing Knowledge...</span>
                      </div>
                    )}
                    {uploadSuccess && (
                      <div className="flex items-center gap-3 p-5 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-100 mb-6">
                        <Check className="w-5 h-5" />
                        <span className="text-sm font-black uppercase tracking-widest">Document processed & stored!</span>
                      </div>
                    )}
                    {trainingFiles.length > 0 && (
                      <div>
                        <h3 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-4">Uploaded Documents</h3>
                        <div className="space-y-3">
                          {trainingFiles.map(file => (
                            <div key={file.id} className="flex items-center justify-between bg-white border border-gray-100 p-4 rounded-2xl group shadow-sm">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center text-purple-500"><FileText className="w-5 h-5" /></div>
                                <div>
                                  <p className="text-sm font-bold text-gray-900 truncate max-w-[200px]">{file.original_name}</p>
                                  <p className="text-[10px] font-bold text-gray-400 uppercase">{new Date(file.created_at).toLocaleDateString()}</p>
                                </div>
                              </div>
                              <button onClick={() => handleDeleteFile(selectedAgentId!, file.id)}
                                className="p-2 text-gray-200 hover:text-red-500 hover:bg-red-50 rounded-xl opacity-0 group-hover:opacity-100 transition-all">
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
      </div>
    </div>
  );
}