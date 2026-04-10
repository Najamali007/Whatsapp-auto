import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  Users, 
  MessageSquare, 
  Send, 
  FileText, 
  Image as ImageIcon, 
  Paperclip, 
  X, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  ChevronRight,
  Sparkles,
  History,
  ExternalLink,
  Search,
  Filter,
  Settings,
  Shield,
  Zap,
  UserX,
  Plus,
  Trash2,
  Clock,
  Save,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { apiFetch } from '../lib/api';

interface Lead {
  id: number | string;
  name: string | null;
  email: string | null;
  contact_number: string;
  contact_name: string | null;
  status: string;
  created_at: string;
  conversation_id: number;
}

interface CampaignHistory {
  id: number;
  message: string;
  file_url: string | null;
  created_at: string;
  status: string;
}

interface CampaignConfig {
  business_name: string;
  service_type: string;
  primary_offer: string;
  daily_message_limit: number;
  min_delay: number;
  max_delay: number;
  max_followups: number;
  stop_if_no_reply: boolean;
  enable_ai_rewriting: boolean;
  ai_tone: string;
  user_consent_required: boolean;
  automation_rules: any;
}

interface BlacklistItem {
  id: number;
  number: string;
  reason: string;
  created_at: string;
}

export default function Campaigns() {
  const [activeTab, setActiveTab] = useState<'leads' | 'campaigns' | 'automation' | 'settings' | 'blacklist'>('leads');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [bulkCampaigns, setBulkCampaigns] = useState<any[]>([]);
  const [selectedLeads, setSelectedLeads] = useState<(number | string)[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Config
  const [config, setConfig] = useState<CampaignConfig>({
    business_name: '',
    service_type: 'SEO Services',
    primary_offer: '',
    daily_message_limit: 50,
    min_delay: 10,
    max_delay: 60,
    max_followups: 3,
    stop_if_no_reply: true,
    enable_ai_rewriting: true,
    ai_tone: 'Professional',
    user_consent_required: true,
    automation_rules: {
      new: { enabled: true, template: 'Hi {Name}, thanks for reaching out!' },
      contacted: { trigger: ['User Replied'], template: 'Hi {Name}, I saw you replied. How can I help?' },
      qualified: { template: 'Here is your audit, {Name}!' },
      final: { template: 'Welcome aboard, {Name}!', access: ['Hosting Access'] },
      not_interested: { blacklist: true, stop: true }
    }
  });

  // Blacklist
  const [blacklist, setBlacklist] = useState<BlacklistItem[]>([]);
  const [newBlacklistNumber, setNewBlacklistNumber] = useState('');
  const [newBlacklistReason, setNewBlacklistReason] = useState('');

  // Composer
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [currentLead, setCurrentLead] = useState<Lead | null>(null);
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  
  // History
  const [history, setHistory] = useState<CampaignHistory[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  useEffect(() => {
    fetchAllLeads();
    fetchConfig();
    fetchBlacklist();
    fetchBulkCampaigns();
  }, []);

  const fetchAllLeads = async () => {
    setIsLoading(true);
    try {
      const data = await apiFetch('/api/campaigns/all-leads');
      setLeads(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch leads');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchBulkCampaigns = async () => {
    try {
      const data = await apiFetch('/api/bulk/campaigns');
      setBulkCampaigns(data);
    } catch (err) {
      console.error('Failed to fetch bulk campaigns:', err);
    }
  };

  const fetchConfig = async () => {
    try {
      const data = await apiFetch('/api/campaign/config');
      setConfig(data);
    } catch (err) {
      console.error('Failed to fetch config:', err);
    }
  };

  const saveConfig = async () => {
    setIsLoading(true);
    try {
      await apiFetch('/api/campaign/config', {
        method: 'POST',
        body: JSON.stringify(config)
      });
      setSuccess('Campaign settings saved successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchBlacklist = async () => {
    try {
      const data = await apiFetch('/api/blacklist');
      setBlacklist(data);
    } catch (err) {
      console.error('Failed to fetch blacklist:', err);
    }
  };

  const addToBlacklist = async () => {
    if (!newBlacklistNumber) return;
    try {
      await apiFetch('/api/blacklist', {
        method: 'POST',
        body: JSON.stringify({ number: newBlacklistNumber, reason: newBlacklistReason })
      });
      setNewBlacklistNumber('');
      setNewBlacklistReason('');
      fetchBlacklist();
    } catch (err) {
      console.error('Failed to add to blacklist:', err);
    }
  };

  const removeFromBlacklist = async (number: string) => {
    try {
      await apiFetch(`/api/blacklist/${number}`, { method: 'DELETE' });
      fetchBlacklist();
    } catch (err) {
      console.error('Failed to remove from blacklist:', err);
    }
  };

  const handleGenerateAI = async (leadId: number | string) => {
    setIsGenerating(true);
    try {
      const data = await apiFetch('/api/campaigns/generate-followup', {
        method: 'POST',
        body: JSON.stringify({ leadId })
      });
      setMessage(data.message);
    } catch (err) {
      console.error('Failed to generate AI message:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendFollowup = async () => {
    if (!message.trim()) {
      setError('Message cannot be empty.');
      return;
    }

    if (selectedLeads.length === 0 && !currentLead) {
      setError('Please select at least one lead.');
      return;
    }

    setIsSending(true);
    setError(null);
    
    try {
      if (currentLead) {
        // Single lead follow-up
        const formData = new FormData();
        formData.append('leadId', currentLead.id.toString());
        formData.append('message', message);
        if (file) formData.append('file', file);

        const response = await fetch('/api/campaigns/send-followup', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
          body: formData
        });
        
        if (!response.ok) throw new Error('Failed to send message');
        setSuccess('Follow-up message sent successfully.');
      } else {
        // Bulk campaign
        const selectedNumbers = leads.filter(l => selectedLeads.includes(l.id)).map(l => l.contact_number);
        await apiFetch('/api/bulk/campaigns', {
          method: 'POST',
          body: JSON.stringify({
            name: `Campaign ${new Date().toLocaleString()}`,
            message,
            recipients: selectedNumbers,
            scheduled_at: scheduledAt || null
          })
        });
        setSuccess(scheduledAt ? 'Campaign scheduled successfully.' : 'Bulk campaign started successfully.');
      }

      setIsComposerOpen(false);
      setMessage('');
      setFile(null);
      setScheduledAt('');
      setSelectedLeads([]);
      fetchAllLeads();
      fetchBulkCampaigns();
    } catch (err: any) {
      setError(err.message || 'An error occurred while sending follow-ups.');
    } finally {
      setIsSending(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.size > 5 * 1024 * 1024) {
        setError('File size exceeded (Max 5MB).');
        return;
      }
      setFile(selectedFile);
      setError(null);
    }
  };

  const fetchHistory = async (leadId: number | string) => {
    try {
      const data = await apiFetch(`/api/campaigns/history/${leadId}`);
      setHistory(data);
      setIsHistoryOpen(true);
    } catch (err) {
      console.error('Failed to fetch history:', err);
    }
  };

  const filteredLeads = leads.filter(lead => {
    const matchesSearch = (lead.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          lead.contact_number.includes(searchTerm));
    const matchesStatus = statusFilter === 'all' || lead.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const toggleLeadSelection = (id: number | string) => {
    setSelectedLeads(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const selectAllLeads = () => {
    if (selectedLeads.length === filteredLeads.length) {
      setSelectedLeads([]);
    } else {
      setSelectedLeads(filteredLeads.map(l => l.id));
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-20">
      {/* Header */}
      <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="p-4 bg-primary/10 rounded-3xl">
            <Zap className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h2 className="text-3xl font-black text-gray-900 tracking-tight">Campaign Center</h2>
            <p className="text-gray-500 font-bold text-sm">Manage automation, settings, and bulk outreach.</p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-[1.5rem] border border-gray-100">
          {[
            { id: 'leads', icon: Users, label: 'Leads' },
            { id: 'campaigns', icon: Calendar, label: 'Campaigns' },
            { id: 'automation', icon: Zap, label: 'Automation' },
            { id: 'settings', icon: Settings, label: 'Settings' },
            { id: 'blacklist', icon: UserX, label: 'Blacklist' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${
                activeTab === tab.id 
                  ? 'bg-white text-primary shadow-sm' 
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 text-sm font-bold">
          <AlertCircle className="w-5 h-5" />
          {error}
        </motion.div>
      )}

      {success && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center gap-3 text-emerald-600 text-sm font-bold">
          <CheckCircle2 className="w-5 h-5" />
          {success}
        </motion.div>
      )}

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {activeTab === 'leads' && (
          <motion.div 
            key="leads"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            {/* Filters */}
            <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input 
                  type="text"
                  placeholder="Search leads..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-6 py-4 bg-gray-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="flex items-center gap-3">
                <Filter className="w-5 h-5 text-gray-400" />
                <select 
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-gray-50 border-none rounded-2xl py-4 pl-4 pr-10 text-sm font-black uppercase tracking-widest text-gray-700 focus:ring-2 focus:ring-primary/20"
                >
                  <option value="all">All Statuses</option>
                  <option value="New">New</option>
                  <option value="Contacted">Contacted</option>
                  <option value="Qualified">Qualified</option>
                  <option value="Final Customer">Final Customer</option>
                  <option value="Not Interested">Not Interested</option>
                </select>
              </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-50 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <h3 className="font-black text-gray-900 uppercase tracking-widest text-xs">Target Leads ({filteredLeads.length})</h3>
                  {selectedLeads.length > 0 && (
                    <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
                      {selectedLeads.length} Selected
                    </span>
                  )}
                </div>
                
                {selectedLeads.length > 0 && (
                  <button 
                    onClick={() => {
                      setCurrentLead(null);
                      setIsComposerOpen(true);
                    }}
                    className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-105 transition-all"
                  >
                    <Send className="w-4 h-4" />
                    Bulk Outreach
                  </button>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50/50">
                      <th className="px-8 py-5">
                        <input 
                          type="checkbox" 
                          checked={filteredLeads.length > 0 && selectedLeads.length === filteredLeads.length}
                          onChange={selectAllLeads}
                          className="w-5 h-5 rounded-lg border-gray-200 text-primary focus:ring-primary/20"
                        />
                      </th>
                      <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Lead Info</th>
                      <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">WhatsApp</th>
                      <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                      <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredLeads.map((lead) => (
                      <tr key={lead.id} className="hover:bg-gray-50/30 transition-colors group">
                        <td className="px-8 py-5">
                          <input 
                            type="checkbox" 
                            checked={selectedLeads.includes(lead.id)}
                            onChange={() => toggleLeadSelection(lead.id)}
                            className="w-5 h-5 rounded-lg border-gray-200 text-primary focus:ring-primary/20"
                          />
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center text-gray-500 font-black text-lg border border-white shadow-sm">
                              {(lead.name || lead.contact_name || 'U').charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-black text-gray-900">{lead.name || lead.contact_name || 'Unknown'}</p>
                              <p className="text-xs font-bold text-gray-400">{lead.email || 'No email provided'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <p className="text-sm font-bold text-gray-700 font-mono">{lead.contact_number}</p>
                        </td>
                        <td className="px-6 py-5">
                          <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                            lead.status === 'Contacted' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                            lead.status === 'Qualified' ? 'bg-purple-50 text-purple-600 border-purple-100' :
                            lead.status === 'Final Customer' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                            lead.status === 'Not Interested' ? 'bg-red-50 text-red-600 border-red-100' :
                            'bg-gray-50 text-gray-600 border-gray-100'
                          }`}>
                            {lead.status}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={() => fetchHistory(lead.id)}
                              className="p-2.5 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-xl transition-all"
                              title="View History"
                            >
                              <History className="w-5 h-5" />
                            </button>
                            <button 
                              onClick={() => {
                                setCurrentLead(lead);
                                setIsComposerOpen(true);
                                handleGenerateAI(lead.id);
                              }}
                              className="p-2.5 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-xl transition-all"
                              title="Send Follow-up"
                            >
                              <Send className="w-5 h-5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'campaigns' && (
          <motion.div 
            key="campaigns"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-50">
                <h3 className="font-black text-gray-900 uppercase tracking-widest text-xs">Campaign History & Analytics</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50/50">
                      <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Campaign Name</th>
                      <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                      <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Analytics</th>
                      <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Scheduled</th>
                      <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {bulkCampaigns.map((campaign) => (
                      <tr key={campaign.id} className="hover:bg-gray-50/30 transition-colors">
                        <td className="px-8 py-5">
                          <p className="font-black text-gray-900">{campaign.name}</p>
                          <p className="text-[10px] text-gray-400 font-bold truncate max-w-[200px]">{campaign.message}</p>
                        </td>
                        <td className="px-6 py-5">
                          <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                            campaign.status === 'completed' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                            campaign.status === 'processing' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                            campaign.status === 'failed' ? 'bg-red-50 text-red-600 border-red-100' :
                            'bg-gray-50 text-gray-600 border-gray-100'
                          }`}>
                            {campaign.status}
                          </span>
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-4">
                            <div className="text-center">
                              <p className="text-[10px] font-black text-gray-400 uppercase">Sent</p>
                              <p className="text-sm font-black text-gray-900">{campaign.sent_count}/{campaign.total_recipients}</p>
                            </div>
                            <div className="text-center">
                              <p className="text-[10px] font-black text-gray-400 uppercase">Failed</p>
                              <p className="text-sm font-black text-red-500">{campaign.failed_count}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <p className="text-xs font-bold text-gray-600">
                            {campaign.scheduled_at ? new Date(campaign.scheduled_at).toLocaleString() : 'Immediate'}
                          </p>
                        </td>
                        <td className="px-6 py-5 text-right text-xs font-bold text-gray-400">
                          {new Date(campaign.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                    {bulkCampaigns.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-8 py-20 text-center text-gray-400 font-bold">No bulk campaigns found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'automation' && (
          <motion.div 
            key="automation"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-6"
          >
            {/* New Lead Automation */}
            <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-blue-50 rounded-2xl">
                    <X className="w-5 h-5 text-blue-600" />
                  </div>
                  <h4 className="font-black text-gray-900 uppercase tracking-widest text-sm">New Lead Automation</h4>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={config.automation_rules?.new?.enabled || false}
                    onChange={(e) => setConfig({...config, automation_rules: {...config.automation_rules, new: {...config.automation_rules?.new, enabled: e.target.checked}}})}
                    className="sr-only peer" 
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>
              <div className="space-y-2">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Welcome Message Template</p>
                <textarea 
                  value={config.automation_rules?.new?.template || ''}
                  onChange={(e) => setConfig({...config, automation_rules: {...config.automation_rules, new: {...config.automation_rules?.new, template: e.target.value}}})}
                  className="w-full h-32 p-4 bg-gray-50 border-none rounded-2xl text-sm font-medium focus:ring-2 focus:ring-primary/20 resize-none"
                  placeholder="Variables: {Name}"
                />
                <p className="text-[10px] text-gray-400 font-bold italic">* Max 300 characters. No spam keywords.</p>
              </div>
            </div>

            {/* Contacted Stage Automation */}
            <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-orange-50 rounded-2xl">
                  <MessageSquare className="w-5 h-5 text-orange-600" />
                </div>
                <h4 className="font-black text-gray-900 uppercase tracking-widest text-sm">Contacted Stage</h4>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Trigger Conditions</p>
                  <div className="flex flex-wrap gap-2">
                    {['User Replied', 'Website URL Received'].map(trigger => (
                      <button
                        key={trigger}
                        onClick={() => {
                          const current = config.automation_rules?.contacted?.trigger || [];
                          const next = current.includes(trigger) ? current.filter((t: string) => t !== trigger) : [...current, trigger];
                          setConfig({...config, automation_rules: {...config.automation_rules, contacted: {...config.automation_rules?.contacted, trigger: next}}});
                        }}
                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                          config.automation_rules?.contacted?.trigger?.includes(trigger)
                            ? 'bg-primary text-white border-primary'
                            : 'bg-white text-gray-400 border-gray-100 hover:border-primary/20'
                        }`}
                      >
                        {trigger}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Auto Reply Message</p>
                  <textarea 
                    value={config.automation_rules?.contacted?.template || ''}
                    onChange={(e) => setConfig({...config, automation_rules: {...config.automation_rules, contacted: {...config.automation_rules?.contacted, template: e.target.value}}})}
                    className="w-full h-24 p-4 bg-gray-50 border-none rounded-2xl text-sm font-medium focus:ring-2 focus:ring-primary/20 resize-none"
                    placeholder="Variables: {Name}, {Website}"
                  />
                </div>
              </div>
            </div>

            {/* Qualified Stage (Audit Sent) */}
            <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-50 rounded-2xl">
                  <FileText className="w-5 h-5 text-purple-600" />
                </div>
                <h4 className="font-black text-gray-900 uppercase tracking-widest text-sm">Qualified Stage (Audit)</h4>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Audit Message Template</p>
                  <textarea 
                    value={config.automation_rules?.qualified?.template || ''}
                    onChange={(e) => setConfig({...config, automation_rules: {...config.automation_rules, qualified: {...config.automation_rules?.qualified, template: e.target.value}}})}
                    className="w-full h-32 p-4 bg-gray-50 border-none rounded-2xl text-sm font-medium focus:ring-2 focus:ring-primary/20 resize-none"
                    placeholder="Variables: {Name}"
                  />
                </div>
                <div className="p-4 bg-purple-50/50 border border-purple-100 rounded-2xl flex items-center gap-3">
                  <Shield className="w-5 h-5 text-purple-400" />
                  <p className="text-[10px] font-bold text-purple-600 uppercase tracking-widest">Max 5MB • PDF, DOCX only</p>
                </div>
              </div>
            </div>

            {/* Final Customer Automation */}
            <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-50 rounded-2xl">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                </div>
                <h4 className="font-black text-gray-900 uppercase tracking-widest text-sm">Final Customer Onboarding</h4>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Onboarding Message</p>
                  <textarea 
                    value={config.automation_rules?.final?.template || ''}
                    onChange={(e) => setConfig({...config, automation_rules: {...config.automation_rules, final: {...config.automation_rules?.final, template: e.target.value}}})}
                    className="w-full h-24 p-4 bg-gray-50 border-none rounded-2xl text-sm font-medium focus:ring-2 focus:ring-primary/20 resize-none"
                    placeholder="Welcome message..."
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Access Request Fields</p>
                  <div className="flex flex-wrap gap-2">
                    {['Hosting Access', 'Google Search Console', 'Website Admin Login'].map(field => (
                      <button
                        key={field}
                        onClick={() => {
                          const current = config.automation_rules?.final?.access || [];
                          const next = current.includes(field) ? current.filter((f: string) => f !== field) : [...current, field];
                          setConfig({...config, automation_rules: {...config.automation_rules, final: {...config.automation_rules?.final, access: next}}});
                        }}
                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                          config.automation_rules?.final?.access?.includes(field)
                            ? 'bg-primary text-white border-primary'
                            : 'bg-white text-gray-400 border-gray-100 hover:border-primary/20'
                        }`}
                      >
                        {field}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="md:col-span-2 flex justify-end">
              <button 
                onClick={saveConfig}
                disabled={isLoading}
                className="flex items-center gap-3 bg-gray-900 text-white px-10 py-5 rounded-3xl font-black text-sm uppercase tracking-widest shadow-xl shadow-gray-900/20 hover:bg-primary transition-all disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                Save Automation Rules
              </button>
            </div>
          </motion.div>
        )}

        {activeTab === 'settings' && (
          <motion.div 
            key="settings"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-8"
          >
            {/* Business Info */}
            <div className="bg-white p-10 rounded-[3rem] border border-gray-100 shadow-sm space-y-8">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-gray-50 rounded-2xl">
                  <FileText className="w-6 h-6 text-gray-400" />
                </div>
                <h4 className="font-black text-gray-900 uppercase tracking-widest text-sm">Basic Business Information</h4>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Business Name *</p>
                  <input 
                    type="text"
                    value={config.business_name}
                    onChange={(e) => setConfig({...config, business_name: e.target.value})}
                    className="w-full p-4 bg-gray-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary/20"
                    placeholder="Min 3 characters"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Service Type *</p>
                  <select 
                    value={config.service_type}
                    onChange={(e) => setConfig({...config, service_type: e.target.value})}
                    className="w-full p-4 bg-gray-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary/20"
                  >
                    <option>SEO Services</option>
                    <option>Website Development</option>
                    <option>Digital Marketing</option>
                    <option>Other</option>
                  </select>
                </div>
                <div className="md:col-span-2 space-y-2">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Primary Offer *</p>
                  <textarea 
                    value={config.primary_offer}
                    onChange={(e) => setConfig({...config, primary_offer: e.target.value})}
                    className="w-full h-32 p-4 bg-gray-50 border-none rounded-2xl text-sm font-medium focus:ring-2 focus:ring-primary/20 resize-none"
                    placeholder="e.g. Free SEO Audit for websites (Min 10 characters)"
                  />
                </div>
              </div>
            </div>

            {/* Anti-Ban System */}
            <div className="bg-white p-10 rounded-[3rem] border border-gray-100 shadow-sm space-y-8">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-red-50 rounded-2xl">
                  <Shield className="w-6 h-6 text-red-500" />
                </div>
                <h4 className="font-black text-gray-900 uppercase tracking-widest text-sm">Messaging Controls (Anti-Ban System)</h4>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Daily Message Limit</p>
                    <span className="text-xs font-black text-primary">{config.daily_message_limit}</span>
                  </div>
                  <input 
                    type="range"
                    min="10"
                    max="200"
                    value={config.daily_message_limit}
                    onChange={(e) => setConfig({...config, daily_message_limit: parseInt(e.target.value)})}
                    className="w-full h-2 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                  <div className="flex justify-between text-[8px] font-black text-gray-300 uppercase tracking-widest">
                    <span>10</span>
                    <span>200</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Message Delay Range (Seconds)</p>
                  <div className="flex items-center gap-4">
                    <input 
                      type="number"
                      value={config.min_delay}
                      onChange={(e) => setConfig({...config, min_delay: parseInt(e.target.value)})}
                      className="w-full p-4 bg-gray-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary/20"
                      placeholder="Min"
                    />
                    <span className="text-gray-300 font-black">—</span>
                    <input 
                      type="number"
                      value={config.max_delay}
                      onChange={(e) => setConfig({...config, max_delay: parseInt(e.target.value)})}
                      className="w-full p-4 bg-gray-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary/20"
                      placeholder="Max"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Max Follow-ups per Lead</p>
                  <input 
                    type="number"
                    max="3"
                    value={config.max_followups}
                    onChange={(e) => setConfig({...config, max_followups: parseInt(e.target.value)})}
                    className="w-full p-4 bg-gray-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div className="flex items-center justify-between p-6 bg-gray-50 rounded-3xl border border-gray-100">
                  <div>
                    <p className="text-xs font-black text-gray-900 uppercase tracking-widest">Stop if no reply?</p>
                    <p className="text-[10px] font-bold text-gray-400">Cease follow-ups after max attempts</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={config.stop_if_no_reply}
                      onChange={(e) => setConfig({...config, stop_if_no_reply: e.target.checked})}
                      className="sr-only peer" 
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>
              </div>
            </div>

            {/* AI Settings */}
            <div className="bg-white p-10 rounded-[3rem] border border-gray-100 shadow-sm space-y-8">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-indigo-50 rounded-2xl">
                  <Sparkles className="w-6 h-6 text-indigo-500" />
                </div>
                <h4 className="font-black text-gray-900 uppercase tracking-widest text-sm">AI Personalization Settings</h4>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="flex items-center justify-between p-6 bg-indigo-50/30 rounded-3xl border border-indigo-100">
                  <div>
                    <p className="text-xs font-black text-indigo-900 uppercase tracking-widest">Enable AI Rewriting?</p>
                    <p className="text-[10px] font-bold text-indigo-400">Unique variations for bulk messages</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={config.enable_ai_rewriting}
                      onChange={(e) => setConfig({...config, enable_ai_rewriting: e.target.checked})}
                      className="sr-only peer" 
                    />
                    <div className="w-11 h-6 bg-indigo-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-indigo-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Tone Selection</p>
                  <select 
                    value={config.ai_tone}
                    onChange={(e) => setConfig({...config, ai_tone: e.target.value})}
                    className="w-full p-4 bg-gray-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary/20"
                  >
                    <option>Professional</option>
                    <option>Friendly</option>
                    <option>Sales</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button 
                onClick={saveConfig}
                disabled={isLoading}
                className="flex items-center gap-3 bg-gray-900 text-white px-10 py-5 rounded-3xl font-black text-sm uppercase tracking-widest shadow-xl shadow-gray-900/20 hover:bg-primary transition-all disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                Save All Settings
              </button>
            </div>
          </motion.div>
        )}

        {activeTab === 'blacklist' && (
          <motion.div 
            key="blacklist"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            <div className="bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm space-y-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-red-50 rounded-2xl">
                  <UserX className="w-5 h-5 text-red-600" />
                </div>
                <h4 className="font-black text-gray-900 uppercase tracking-widest text-sm">Blacklist Management</h4>
              </div>

              <div className="flex flex-col md:flex-row gap-4">
                <input 
                  type="text"
                  placeholder="Phone Number (e.g. +923...)"
                  value={newBlacklistNumber}
                  onChange={(e) => setNewBlacklistNumber(e.target.value)}
                  className="flex-1 p-4 bg-gray-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary/20"
                />
                <input 
                  type="text"
                  placeholder="Reason (optional)"
                  value={newBlacklistReason}
                  onChange={(e) => setNewBlacklistReason(e.target.value)}
                  className="flex-1 p-4 bg-gray-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary/20"
                />
                <button 
                  onClick={addToBlacklist}
                  className="bg-gray-900 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-red-600 transition-all"
                >
                  Add to Blacklist
                </button>
              </div>
            </div>

            <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/50">
                    <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Number</th>
                    <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Reason</th>
                    <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Added Date</th>
                    <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {blacklist.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50/30 transition-colors">
                      <td className="px-8 py-5 font-black text-gray-900">{item.number}</td>
                      <td className="px-8 py-5 text-sm font-bold text-gray-500">{item.reason || 'No reason provided'}</td>
                      <td className="px-8 py-5 text-xs font-bold text-gray-400">{new Date(item.created_at).toLocaleDateString()}</td>
                      <td className="px-8 py-5 text-right">
                        <button 
                          onClick={() => removeFromBlacklist(item.number)}
                          className="p-2 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {blacklist.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-8 py-20 text-center text-gray-400 font-bold">No blacklisted numbers found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Composer Modal */}
      <AnimatePresence>
        {isComposerOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsComposerOpen(false)}
              className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-8 border-b border-gray-50 flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-black text-gray-900 tracking-tight">
                    {currentLead ? `Follow-up with ${currentLead.name || 'Lead'}` : `Bulk Outreach (${selectedLeads.length} leads)`}
                  </h3>
                  <p className="text-gray-500 font-bold text-xs uppercase tracking-widest mt-1">Compose your message</p>
                </div>
                <button 
                  onClick={() => setIsComposerOpen(false)}
                  className="p-3 text-gray-400 hover:text-gray-900 hover:bg-gray-50 rounded-2xl transition-all"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div className="relative">
                  <textarea 
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Type your follow-up message here..."
                    className="w-full h-48 p-6 bg-gray-50 border-none rounded-[2rem] text-gray-900 font-medium placeholder:text-gray-400 focus:ring-2 focus:ring-primary/20 transition-all resize-none"
                  />
                  {currentLead && (
                    <button 
                      onClick={() => handleGenerateAI(currentLead.id)}
                      disabled={isGenerating}
                      className="absolute bottom-4 right-4 flex items-center gap-2 bg-white text-primary px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-sm border border-primary/10 hover:bg-primary hover:text-white transition-all disabled:opacity-50"
                    >
                      {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      AI Suggestion
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Schedule Outreach (Optional)</p>
                    {scheduledAt && (
                      <button onClick={() => setScheduledAt('')} className="text-[10px] font-black text-red-500 uppercase tracking-widest">Clear</button>
                    )}
                  </div>
                  <div className="relative">
                    <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input 
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      className="w-full pl-12 pr-6 py-4 bg-gray-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Attachments (Max 5MB)</p>
                  <div className="flex flex-wrap gap-3">
                    <label className="flex items-center gap-2 px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl cursor-pointer hover:bg-gray-100 transition-all group">
                      <Paperclip className="w-4 h-4 text-gray-400 group-hover:text-primary" />
                      <span className="text-xs font-bold text-gray-600">Attach File</span>
                      <input type="file" className="hidden" onChange={handleFileChange} />
                    </label>
                    {file && (
                      <div className="flex items-center gap-3 px-4 py-3 bg-primary/5 border border-primary/10 rounded-2xl">
                        <FileText className="w-4 h-4 text-primary" />
                        <span className="text-xs font-bold text-primary truncate max-w-[150px]">{file.name}</span>
                        <button onClick={() => setFile(null)} className="text-primary/40 hover:text-primary">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-8 bg-gray-50/50 border-t border-gray-50 flex items-center justify-between">
                <div className="flex items-center gap-2 text-gray-400">
                  <Shield className="w-4 h-4" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Anti-ban active</span>
                </div>
                <button 
                  onClick={handleSendFollowup}
                  disabled={isSending || !message.trim()}
                  className="flex items-center gap-3 bg-gray-900 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-gray-900/20 hover:bg-primary transition-all disabled:opacity-50"
                >
                  {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Send Outreach
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* History Modal */}
      <AnimatePresence>
        {isHistoryOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsHistoryOpen(false)}
              className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-xl rounded-[3rem] shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-8 border-b border-gray-50 flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-black text-gray-900 tracking-tight">Campaign History</h3>
                  <p className="text-gray-500 font-bold text-xs uppercase tracking-widest mt-1">Previous follow-ups sent</p>
                </div>
                <button 
                  onClick={() => setIsHistoryOpen(false)}
                  className="p-3 text-gray-400 hover:text-gray-900 hover:bg-gray-50 rounded-2xl transition-all"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-8 overflow-y-auto max-h-[60vh] space-y-6">
                {history.map((item) => (
                  <div key={item.id} className="p-6 bg-gray-50 rounded-[2rem] border border-gray-100 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                        {new Date(item.created_at).toLocaleString()}
                      </span>
                      <span className="bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest border border-emerald-100">
                        {item.status}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-gray-700 leading-relaxed whitespace-pre-wrap">{item.message}</p>
                    {item.file_url && (
                      <a 
                        href={item.file_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-primary text-xs font-bold hover:underline"
                      >
                        <Paperclip className="w-3 h-3" />
                        View Attachment
                      </a>
                    )}
                  </div>
                ))}
                {history.length === 0 && (
                  <div className="text-center py-12 text-gray-400">
                    <History className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p className="text-sm font-bold">No follow-up history found for this lead.</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
