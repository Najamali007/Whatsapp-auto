import React, { useState, useEffect, useRef } from 'react';
import { Users, Plus, Trash2, Edit2, Check, X, Loader2, BrainCircuit, Upload, History, FileText, AlertCircle, Layers, User, Zap, Sparkles, Target, RefreshCw, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { apiFetch } from '../lib/api';
import { loadingManager } from '../lib/loading';
import AgentGuide from './AgentGuide';

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
}

export default function Agents({ token, initialAgentId }: AgentsProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(initialAgentId || null);

  useEffect(() => {
    if (initialAgentId !== undefined) {
      setSelectedAgentId(initialAgentId);
    }
  }, [initialAgentId]);
  const [activeSubTab, setActiveSubTab] = useState<'agents' | 'knowledge' | 'strategies' | 'guide'>('agents');
  const [isTraining, setIsTraining] = useState<number | null>(null);
  const [trainingFiles, setTrainingFiles] = useState<TrainingFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedAgents, setSelectedAgents] = useState<number[]>([]);
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [hasApiKeys, setHasApiKeys] = useState<boolean>(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<Partial<Agent>>({
    name: '',
    personality: '',
    role: '',
    knowledge_base: '',
    brand_company: 'Own Digix',
    product_service: '',
    objective: '',
    tone: '',
    playbook: '',
    others: '',
    avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=1',
    strategy: '',
    is_active: 1,
  });

  const fetchAgents = async () => {
    try {
      const [agentsData, settingsData] = await Promise.all([
        apiFetch('/api/agents'),
        apiFetch('/api/settings')
      ]);
      setAgents(agentsData);
      setHasApiKeys(settingsData.length > 0);
      setError(null);
    } catch (error: any) {
      console.error('Failed to fetch agents:', error);
      setError(`Failed to load agents: ${error.message || 'Please check your connection.'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTrainingFiles = async (agentId: number) => {
    try {
      const data = await apiFetch(`/api/agents/${agentId}/training-files`);
      setTrainingFiles(data);
    } catch (error) {
      console.error('Failed to fetch training files');
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  useEffect(() => {
    if (selectedAgentId) {
      fetchTrainingFiles(selectedAgentId);
    } else {
      setTrainingFiles([]);
    }
  }, [selectedAgentId]);

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!formData.name?.trim()) errors.name = 'Agent name is required';
    if (!formData.brand_company?.trim()) errors.brand_company = 'Brand/Company is required';
    if (!formData.product_service?.trim()) errors.product_service = 'Product/Service is required';
    if (!formData.objective?.trim()) errors.objective = 'Objective is required';
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async (id?: number) => {
    if (!validateForm()) return;

    if (!hasApiKeys && !id) {
      loadingManager.setError('Please add an API in settings before creating an agent.');
      return;
    }

    const endpoint = id ? `/api/agents/${id}` : '/api/agents';
    const method = id ? 'PUT' : 'POST';

    try {
      const response = await apiFetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!id && response.id) {
        setSelectedAgentId(response.id);
      }

      fetchAgents();
      setValidationErrors({});
      alert('Changes saved successfully!');
    } catch (error: any) {
      console.error('Failed to save agent:', error);
      setError(error.message || 'Failed to save agent');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this agent?')) return;

    setDeletingId(id);
    try {
      await apiFetch(`/api/agents/${id}`, {
        method: 'DELETE',
      });
      setSelectedAgents(prev => prev.filter(aid => aid !== id));
      if (selectedAgentId === id) setSelectedAgentId(null);
      fetchAgents();
    } catch (error: any) {
      console.error('Failed to delete agent:', error);
      alert(`Failed to delete agent: ${error.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedAgents.length === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedAgents.length} agents?`)) return;

    setIsDeletingBulk(true);
    try {
      await apiFetch('/api/agents/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedAgents }),
      });
      setSelectedAgents([]);
      fetchAgents();
    } catch (error: any) {
      console.error('Failed to delete agents:', error);
      alert(`Failed to delete agents: ${error.message}`);
    } finally {
      setIsDeletingBulk(false);
    }
  };

  const toggleAgentSelection = (id: number) => {
    setSelectedAgents(prev => 
      prev.includes(id) ? prev.filter(aid => aid !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedAgents.length === agents.length) {
      setSelectedAgents([]);
    } else {
      setSelectedAgents(agents.map(a => a.id));
    }
  };

  const handleFileUpload = async (agentId: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      // Use standard fetch for FormData since apiFetch expects JSON by default
      const response = await fetch(`/api/agents/${agentId}/train-file`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: formData,
      });

      if (response.ok) {
        fetchTrainingFiles(agentId);
      } else if (response.status === 401 || response.status === 403) {
        localStorage.removeItem('token');
        window.location.reload();
      }
    } catch (error) {
      console.error('Upload failed');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleTrainHistory = async (agentId: number) => {
    setIsUploading(true);
    try {
      await apiFetch(`/api/agents/${agentId}/train-history`, {
        method: 'POST',
      });
      fetchTrainingFiles(agentId);
    } catch (error) {
      console.error('History training failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteFile = async (agentId: number, fileId: number) => {
    try {
      await apiFetch(`/api/agents/${agentId}/training-files/${fileId}`, {
        method: 'DELETE',
      });
      fetchTrainingFiles(agentId);
    } catch (error) {
      console.error('Delete file failed');
    }
  };

  const AVATARS = [
    'https://api.dicebear.com/7.x/bottts/svg?seed=1',
    'https://api.dicebear.com/7.x/bottts/svg?seed=2',
    'https://api.dicebear.com/7.x/bottts/svg?seed=3',
    'https://api.dicebear.com/7.x/bottts/svg?seed=4',
  ];

  const selectedAgent = agents.find(a => a.id === selectedAgentId);

  useEffect(() => {
    if (selectedAgent) {
      setFormData(selectedAgent);
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
    }
  }, [selectedAgentId, agents]);

  const avatarInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedAgentId) return;

    const formData = new FormData();
    formData.append('avatar', file);

    try {
      const response = await fetch(`/api/agents/${selectedAgentId}/avatar`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        setFormData(prev => ({ ...prev, avatar: data.avatarUrl }));
        fetchAgents();
      }
    } catch (error) {
      console.error('Avatar upload failed');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center space-y-4">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <p className="text-gray-900 font-bold">{error}</p>
        <button 
          onClick={fetchAgents}
          className="bg-primary text-white px-6 py-2 rounded-xl text-sm font-bold"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col relative overflow-hidden">
      {/* Top Navigation */}
      <div className="flex items-center px-8 border-b border-gray-100 bg-white/80 backdrop-blur-md sticky top-0 z-20">
        <button
          onClick={() => setActiveSubTab('agents')}
          className={`px-6 py-4 text-sm font-black uppercase tracking-widest transition-all border-b-2 ${
            activeSubTab === 'agents' ? 'border-primary text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          Basic Info
        </button>
        <button
          onClick={() => setActiveSubTab('knowledge')}
          className={`px-6 py-4 text-sm font-black uppercase tracking-widest transition-all border-b-2 ${
            activeSubTab === 'knowledge' ? 'border-primary text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          Knowledge
        </button>
        <button
          onClick={() => setActiveSubTab('strategies')}
          className={`px-6 py-4 text-sm font-black uppercase tracking-widest transition-all border-b-2 ${
            activeSubTab === 'strategies' ? 'border-primary text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          Strategies
        </button>
        <button
          onClick={() => setActiveSubTab('guide')}
          className={`px-6 py-4 text-sm font-black uppercase tracking-widest transition-all border-b-2 ${
            activeSubTab === 'guide' ? 'border-primary text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          Guide
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden relative z-10">
        {/* Left Sidebar - Agent List */}
        <div className={`w-full md:w-[220px] border-r border-gray-100 flex flex-col bg-white/50 backdrop-blur-sm shrink-0 ${selectedAgentId && activeSubTab === 'agents' ? 'hidden md:flex' : 'flex'}`}>
          <div className="flex-1 overflow-y-auto px-3 py-6 space-y-3">
            {agents.map((agent) => (
              <div
                key={agent.id}
                onClick={() => setSelectedAgentId(agent.id)}
                className={`w-full p-3 rounded-2xl text-left transition-all group relative cursor-pointer border ${
                  selectedAgentId === agent.id 
                    ? 'bg-white border-primary/20 shadow-lg shadow-primary/5 ring-1 ring-primary/5' 
                    : 'bg-transparent border-transparent hover:bg-white/80 hover:border-gray-100'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="relative shrink-0">
                    <img
                      src={agent.avatar || AVATARS[0]}
                      alt={agent.name}
                      className="w-10 h-10 rounded-xl bg-gray-100 shadow-sm object-cover"
                    />
                    {agent.is_active === 1 && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-primary border-2 border-white rounded-full" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-gray-900 text-sm truncate">{agent.name}</h4>
                    <p className="text-[10px] text-gray-400 truncate font-medium">
                      {agent.role || 'AI Assistant'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(agent.id);
                  }}
                  className="absolute top-2 right-2 p-1.5 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            
            {agents.length === 0 && (
              <div className="text-center py-10 px-4">
                <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3 text-gray-400">
                  <Users className="w-6 h-6" />
                </div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">No agents yet</p>
              </div>
            )}
          </div>
        </div>

        {/* Main Area */}
        <div className={`flex-1 overflow-y-auto ${!selectedAgentId && activeSubTab === 'agents' ? 'hidden md:block' : 'block'}`}>
          {activeSubTab === 'agents' ? (
            <div className="max-w-6xl mx-auto p-6 md:p-12">
              <div className="mb-12 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="px-3 py-1 bg-primary/10 rounded-full border border-primary/20">
                      <span className="text-[10px] font-black text-primary uppercase tracking-widest">Intelligence Architect</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active System</span>
                    </div>
                  </div>
                  <h2 className="text-6xl font-black text-slate-900 mb-3 tracking-tighter leading-none">
                    Agent Profile
                  </h2>
                  <p className="text-lg font-medium text-slate-400 max-w-2xl">
                    Configure the core identity, cognitive capabilities, and behavioral patterns of your AI agent.
                  </p>
                </div>
                <button 
                  onClick={() => setSelectedAgentId(null)}
                  className="md:hidden p-2 text-gray-400 hover:bg-gray-50 rounded-lg"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex flex-col gap-10">
                {/* Basic Info Card */}
                <div className="glass-card p-12 rounded-[3.5rem] relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full -mr-64 -mt-64 blur-[100px] pointer-events-none group-hover:bg-primary/10 transition-all duration-1000" />
                  <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-purple-500/5 rounded-full -ml-32 -mb-32 blur-[80px] pointer-events-none" />
                  
                  {/* Name & Avatar */}
                  <div className="flex flex-col gap-12">
                    <div className="flex flex-col md:flex-row gap-12 items-start">
                      <div className="w-full md:w-64 space-y-6">
                        <label className="section-label">
                          <User className="w-4 h-4" /> Agent Identity
                        </label>
                        <div className="relative group/avatar">
                          <div className="w-full aspect-square rounded-[3rem] overflow-hidden bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center transition-all group-hover/avatar:border-primary/50 shadow-inner">
                            <img 
                              src={formData.avatar || AVATARS[0]} 
                              alt="Preview" 
                              className="w-full h-full object-cover transition-transform duration-700 group-hover/avatar:scale-110"
                            />
                            <div 
                              onClick={() => avatarInputRef.current?.click()}
                              className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover/avatar:opacity-100 transition-all flex flex-col items-center justify-center text-white cursor-pointer backdrop-blur-sm"
                            >
                              <Upload className="w-10 h-10 mb-2 animate-bounce" />
                              <span className="text-[11px] font-black uppercase tracking-widest">Update Visuals</span>
                            </div>
                          </div>
                          <input
                            type="file"
                            ref={avatarInputRef}
                            className="hidden"
                            onChange={handleAvatarUpload}
                            accept="image/*"
                          />
                        </div>
                        <div className="flex justify-center gap-2.5">
                          {AVATARS.map((url, i) => (
                            <button
                              key={i}
                              onClick={() => setFormData({ ...formData, avatar: url })}
                              className={`w-9 h-9 rounded-xl overflow-hidden border-2 transition-all hover:scale-110 ${
                                formData.avatar === url ? 'border-primary shadow-lg shadow-primary/20' : 'border-transparent opacity-40 hover:opacity-100'
                              }`}
                            >
                              <img src={url} alt="" className="w-full h-full object-cover" />
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex-1 w-full space-y-10">
                        <div className="space-y-4">
                          <label className="section-label">
                            <Edit2 className="w-4 h-4" /> Intelligence Name <span className="text-red-500 ml-1">*Required</span>
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Sarah - Sales Expert"
                            className={`advanced-input text-2xl ${validationErrors.name ? 'border-red-500 ring-4 ring-red-500/5' : ''}`}
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          />
                          {validationErrors.name && (
                            <div className="flex items-center gap-2 text-red-500 px-2">
                              <AlertCircle className="w-3.5 h-3.5" />
                              <p className="text-[11px] font-bold uppercase tracking-wider">{validationErrors.name}</p>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col gap-10">
                          <div className="space-y-4">
                            <label className="section-label">
                              <Users className="w-4 h-4" /> Brand / Organization <span className="text-red-500 ml-1">*Required</span>
                            </label>
                            <input
                              type="text"
                              placeholder="e.g. Geeksgenics Intelligence"
                              className={`advanced-input ${validationErrors.brand_company ? 'border-red-500' : ''}`}
                              value={formData.brand_company}
                              onChange={(e) => setFormData({ ...formData, brand_company: e.target.value })}
                            />
                          </div>
                          <div className="space-y-4">
                            <label className="section-label">
                              <Zap className="w-4 h-4" /> Core Product / Service <span className="text-red-500 ml-1">*Required</span>
                            </label>
                            <input
                              type="text"
                              placeholder="e.g. Premium SEO & Content Strategy"
                              className={`advanced-input ${validationErrors.product_service ? 'border-red-500' : ''}`}
                              value={formData.product_service}
                              onChange={(e) => setFormData({ ...formData, product_service: e.target.value })}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="h-px bg-slate-100/80" />

                    {/* Role & Personality */}
                    <div className="flex flex-col gap-12">
                      <div className="space-y-4">
                        <label className="section-label">
                          <BrainCircuit className="w-4 h-4" /> Agent Role & Cognitive Expertise
                        </label>
                        <textarea
                          placeholder="Define the specific role, expertise, and domain knowledge of this agent..."
                          className="advanced-input h-56 resize-none leading-relaxed py-7"
                          value={formData.role}
                          onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                        />
                      </div>
                      <div className="space-y-4">
                        <label className="section-label">
                          <Sparkles className="w-4 h-4" /> Personality Matrix & Tone
                        </label>
                        <textarea
                          placeholder="Describe the agent's personality traits, communication style, and emotional intelligence..."
                          className="advanced-input h-56 resize-none leading-relaxed py-7"
                          value={formData.personality}
                          onChange={(e) => setFormData({ ...formData, personality: e.target.value })}
                        />
                      </div>
                    </div>

                    {/* Objective */}
                    <div className="flex flex-col gap-12">
                      <div className="space-y-4">
                        <label className="section-label">
                          <Target className="w-4 h-4" /> Primary Mission Objective <span className="text-red-500 ml-1">*Required</span>
                        </label>
                        <textarea
                          placeholder="What is the ultimate goal this agent must achieve in every interaction?"
                          className={`advanced-input h-56 resize-none leading-relaxed py-7 ${validationErrors.objective ? 'border-red-500' : ''}`}
                          value={formData.objective}
                          onChange={(e) => setFormData({ ...formData, objective: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="pt-12 flex justify-end">
                      <button
                        onClick={() => handleSave(selectedAgentId || undefined)}
                        className="group relative bg-slate-900 text-white px-16 py-6 rounded-[2rem] font-black uppercase tracking-[0.2em] text-xs shadow-2xl shadow-slate-900/20 hover:bg-primary active:scale-[0.98] transition-all duration-500 overflow-hidden"
                      >
                        <div className="absolute inset-0 bg-white/20 translate-y-[100%] group-hover:translate-y-0 transition-transform duration-500" />
                        <span className="relative flex items-center gap-3">
                          {selectedAgentId ? <RefreshCw className="w-5 h-5 animate-spin-slow" /> : <Plus className="w-5 h-5" />}
                          {selectedAgentId ? 'Update Intelligence' : 'Deploy Agent'}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : activeSubTab === 'knowledge' ? (
            <div className="max-w-6xl mx-auto p-6 md:p-12">
              <div className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center justify-between w-full md:w-auto">
                  <div>
                    <h2 className="text-3xl font-black text-gray-900 mb-1 tracking-tight">Knowledge Base</h2>
                    <p className="text-sm font-medium text-gray-400">Train your agent with custom documents and history</p>
                  </div>
                  <button 
                    onClick={() => setSelectedAgentId(null)}
                    className="md:hidden p-2 text-gray-400 hover:bg-gray-50 rounded-lg"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
                {selectedAgentId && (
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={() => handleTrainHistory(selectedAgentId)}
                      disabled={isUploading}
                      className="px-5 py-3 bg-white border border-gray-100 text-gray-600 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-gray-50 transition-all flex items-center gap-2 shadow-sm"
                    >
                      <History className="w-4 h-4" /> History
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="px-5 py-3 bg-primary text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:bg-primary-hover transition-all flex items-center gap-2"
                    >
                      <Upload className="w-4 h-4" /> Upload
                    </button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      onChange={(e) => selectedAgentId && handleFileUpload(selectedAgentId, e)}
                      accept=".txt,.pdf,.doc,.docx"
                    />
                  </div>
                )}
              </div>

              {!selectedAgentId ? (
                <div className="flex flex-col items-center justify-center h-80 text-center space-y-4 bg-white border border-gray-100 rounded-[2.5rem] shadow-sm">
                  <div className="w-20 h-20 bg-gray-50 rounded-[2rem] flex items-center justify-center text-gray-300">
                    <BrainCircuit className="w-10 h-10" />
                  </div>
                  <p className="text-gray-400 font-black uppercase tracking-widest text-xs">Select an agent to manage knowledge</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {trainingFiles.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-80 text-center space-y-4 bg-white border border-gray-100 rounded-[2.5rem] shadow-sm">
                      <div className="w-20 h-20 bg-gray-50 rounded-[2rem] flex items-center justify-center text-gray-300">
                        <FileText className="w-10 h-10" />
                      </div>
                      <p className="text-gray-400 font-black uppercase tracking-widest text-xs">No training files found</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {trainingFiles.map(file => (
                        <div key={file.id} className="flex items-center justify-between bg-white border border-gray-100 p-5 rounded-2xl group shadow-sm hover:shadow-md transition-all">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center text-primary">
                              <FileText className="w-6 h-6" />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-gray-900 truncate max-w-[180px]">{file.original_name}</p>
                              <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">{new Date(file.created_at).toLocaleDateString()}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeleteFile(selectedAgentId, file.id)}
                            className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {isUploading && (
                    <div className="flex items-center justify-center gap-3 p-6 bg-primary/5 text-primary rounded-[2rem] animate-pulse border border-primary/10">
                      <Loader2 className="w-6 h-6 animate-spin" />
                      <span className="text-sm font-black uppercase tracking-widest">Processing Knowledge...</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : activeSubTab === 'strategies' ? (
            <div className="max-w-4xl mx-auto p-6 md:p-12">
              <div className="mb-10 flex items-center justify-between">
                <div>
                  <h2 className="text-3xl font-black text-gray-900 mb-1 tracking-tight">Strategies</h2>
                  <p className="text-sm font-medium text-gray-400">Configure advanced response strategies and workflows</p>
                </div>
                <button 
                  onClick={() => setSelectedAgentId(null)}
                  className="md:hidden p-2 text-gray-400 hover:bg-gray-50 rounded-lg"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              {!selectedAgentId ? (
                <div className="flex flex-col items-center justify-center h-80 text-center space-y-4 bg-white border border-gray-100 rounded-[2.5rem] shadow-sm">
                  <div className="w-20 h-20 bg-gray-50 rounded-[2rem] flex items-center justify-center text-gray-300">
                    <Layers className="w-10 h-10" />
                  </div>
                  <p className="text-gray-400 font-black uppercase tracking-widest text-xs">Select an agent to manage strategies</p>
                </div>
              ) : (
                <div className="space-y-8">
                  <div className="bg-white border border-gray-100 p-8 rounded-[2.5rem] shadow-xl shadow-gray-200/50 space-y-6">
                    <div className="space-y-3">
                      <label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Response Strategy</label>
                      <textarea
                        placeholder="Define how your agent should handle different customer scenarios..."
                        className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 text-sm font-bold h-64 focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all resize-none"
                        value={formData.strategy || ''}
                        onChange={(e) => setFormData({ ...formData, strategy: e.target.value })}
                      />
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        This strategy will guide the agent's decision-making process during conversations.
                      </p>
                    </div>

                    <div className="pt-6 flex justify-end">
                      <button
                        onClick={() => handleSave(selectedAgentId)}
                        className="bg-primary text-white px-10 py-4 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-primary/20 hover:bg-primary-hover transition-all"
                      >
                        Save Strategy
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : activeSubTab === 'guide' ? (
            <div className="h-full overflow-hidden">
              {!selectedAgentId ? (
                <div className="flex flex-col items-center justify-center h-80 text-center space-y-4 bg-white border border-gray-100 rounded-[2.5rem] shadow-sm m-12">
                  <div className="w-20 h-20 bg-gray-50 rounded-[2rem] flex items-center justify-center text-gray-300">
                    <MessageSquare className="w-10 h-10" />
                  </div>
                  <p className="text-gray-400 font-black uppercase tracking-widest text-xs">Select an agent to guide</p>
                </div>
              ) : (
                <AgentGuide agentId={selectedAgentId} token={token} />
              )}
            </div>
          ) : null}
        </div>

        {/* Right Area - Mobile Preview */}
        <div className="hidden xl:flex w-[360px] border-l border-gray-100 bg-white/30 backdrop-blur-sm flex-col items-center justify-start p-6 relative shrink-0 overflow-y-auto scrollbar-hide">
          <div className="absolute top-6 right-6 text-right">
            <p className="text-primary font-handwriting text-lg rotate-[-5deg] leading-tight">
              Live Preview ⤵
            </p>
          </div>
          
          {/* Phone Frame */}
          <div className="w-[240px] h-[500px] bg-gray-900 rounded-[2.8rem] p-3 shadow-2xl relative overflow-hidden ring-8 ring-gray-900/5 mt-10 shrink-0">
            <div className="w-full h-full bg-white rounded-[2.2rem] overflow-hidden flex flex-col">
              {/* Status Bar */}
              <div className="h-6 bg-white flex justify-between items-center px-6 pt-1">
                <span className="text-[9px] font-black">9:41</span>
                <div className="flex gap-1">
                  <div className="w-1 h-1 rounded-full bg-black/20" />
                  <div className="w-1 h-1 rounded-full bg-black/20" />
                  <div className="w-2 h-1 rounded-full bg-black/20" />
                </div>
              </div>

              {/* Chat Header */}
              <div className="p-3 border-b border-gray-50 flex items-center gap-3 bg-gray-50/50">
                <div className="w-9 h-9 rounded-xl overflow-hidden bg-white shadow-sm border border-gray-100">
                  <img src={formData.avatar || AVATARS[0]} className="w-full h-full object-cover" />
                </div>
                <div className="min-w-0">
                  <h5 className="text-[13px] font-black text-gray-900 truncate">{formData.name || 'Agent'}</h5>
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    <span className="text-[8px] text-primary font-black uppercase tracking-widest">Online</span>
                  </div>
                </div>
              </div>

              {/* Chat Messages */}
              <div className="flex-1 p-4 space-y-4 overflow-y-auto bg-whatsapp-pattern">
                <div className="bg-white p-4 rounded-[1.2rem] rounded-tl-none shadow-sm max-w-[92%] relative z-10 border border-gray-50">
                  <p className="text-[14px] text-gray-800 leading-snug font-bold">
                    Hello! I'm {formData.name || 'your AI assistant'}. How can I help you today?
                  </p>
                </div>
                <div className="bg-primary/10 p-4 rounded-[1.2rem] rounded-tr-none shadow-sm max-w-[92%] ml-auto relative z-10 border border-primary/5">
                  <p className="text-[14px] text-primary font-black leading-snug">
                    I'm interested in your {formData.product_service || 'services'}.
                  </p>
                </div>
                <div className="bg-white p-4 rounded-[1.2rem] rounded-tl-none shadow-sm max-w-[92%] relative z-10 border border-gray-50">
                  <p className="text-[14px] text-gray-800 leading-snug font-bold">
                    That's great! As a representative of {formData.brand_company || 'our company'}, my objective is {formData.objective || 'to assist you'}.
                  </p>
                </div>
              </div>

              {/* Chat Input */}
              <div className="p-3 bg-white border-t border-gray-50">
                <div className="flex items-center gap-3 bg-gray-100 rounded-full px-4 py-2">
                  <div className="flex-1 text-[10px] text-gray-400 font-bold">Type a message...</div>
                  <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center text-white shadow-lg shadow-primary/20">
                    <Plus className="w-3 h-3" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Advanced Data Feed */}
          <div className="mt-8 w-full space-y-4">
            <div className="flex items-center justify-between px-2">
              <h6 className="text-[9px] font-black text-gray-900 uppercase tracking-[0.2em]">Live Intelligence</h6>
              <div className="flex gap-1">
                <div className="w-1 h-1 rounded-full bg-primary animate-bounce" />
                <div className="w-1 h-1 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0.2s' }} />
                <div className="w-1 h-1 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0.4s' }} />
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="p-3.5 bg-white border border-gray-100 rounded-[1.2rem] shadow-sm space-y-1">
                <div className="flex items-center gap-2 text-primary">
                  <BrainCircuit className="w-3 h-3" />
                  <span className="text-[8px] font-black uppercase tracking-widest">Active Role</span>
                </div>
                <p className="text-[11px] font-black text-gray-900 leading-tight truncate">
                  {formData.role || 'Defining role...'}
                </p>
              </div>

              <div className="p-3.5 bg-white border border-gray-100 rounded-[1.2rem] shadow-sm space-y-1">
                <div className="flex items-center gap-2 text-purple-500">
                  <Layers className="w-3 h-3" />
                  <span className="text-[8px] font-black uppercase tracking-widest">Knowledge Context</span>
                </div>
                <p className="text-[10px] font-bold text-gray-500 line-clamp-1 leading-relaxed">
                  {formData.knowledge_base || 'No knowledge base provided yet.'}
                </p>
              </div>

              <div className="p-3.5 bg-white border border-gray-100 rounded-[1.2rem] shadow-sm space-y-1">
                <div className="flex items-center gap-2 text-orange-500">
                  <AlertCircle className="w-3 h-3" />
                  <span className="text-[8px] font-black uppercase tracking-widest">Tone & Personality</span>
                </div>
                <p className="text-[10px] font-bold text-gray-900 leading-relaxed truncate">
                  {formData.personality || 'Standard AI Personality'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

}
