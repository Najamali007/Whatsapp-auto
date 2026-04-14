import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  Search, 
  Filter, 
  Download, 
  ExternalLink, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  MoreVertical,
  ChevronRight,
  RefreshCw,
  TrendingUp,
  UserPlus,
  Activity,
  Copy,
  MessageSquare,
  Layers,
  X
} from 'lucide-react';
import { apiFetch } from '../lib/api';

interface Label {
  name: string;
  color: string;
}

interface Lead {
  id: number;
  user_id: number;
  conversation_id: number;
  name: string | null;
  email: string | null;
  website: string | null;
  source: string;
  status: 'New' | 'Contacted' | 'Qualified' | 'Final Customer' | 'Not Interested';
  is_new: number;
  created_at: string;
  updated_at: string;
  contact_number: string;
  contact_name: string | null;
  labels?: Label[];
  audit_status?: string;
  is_ordered?: number;
  is_saved?: number;
  is_audited?: number;
  followup_count: number;
  manual_followup_count: number;
  auto_followup_count: number;
  last_followup_at: string | null;
}

interface LeadStats {
  total: number;
  new_count: number;
  recent_count: number;
}

interface LeadsProps {
  onOpenChat?: (conversationId: number) => void;
}

const Leads: React.FC<LeadsProps> = ({ onOpenChat }) => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<LeadStats>({ total: 0, new_count: 0, recent_count: 0 });
  const [channels, setChannels] = useState<any[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<{ type: 'all' | 'today' | 'yesterday' | 'last7days' | 'custom' | 'range', date?: string, range?: { start: string, end: string } }>({ type: 'all' });
  const [refreshing, setRefreshing] = useState(false);
  const [selectedLeadForChat, setSelectedLeadForChat] = useState<Lead | null>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [loadingChat, setLoadingChat] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set(['name', 'number', 'website', 'email', 'date', 'status', 'followups']));
  const [followupHistory, setFollowupHistory] = useState<any[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sendingMessage, setSendingMessage] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const toggleColumn = (column: string) => {
    const newSelected = new Set(selectedColumns);
    if (newSelected.has(column)) {
      if (newSelected.size > 1) {
        newSelected.delete(column);
      }
    } else {
      newSelected.add(column);
    }
    setSelectedColumns(newSelected);
  };

  const fetchChatMessages = async (conversationId: number, leadId: number) => {
    setLoadingChat(true);
    try {
      const [messages, followups] = await Promise.all([
        apiFetch(`/api/conversations/${conversationId}/messages`),
        apiFetch(`/api/leads/${leadId}/followups`)
      ]);
      setChatMessages(messages);
      setFollowupHistory(followups);
    } catch (error) {
      console.error('Failed to fetch chat messages:', error);
    } finally {
      setLoadingChat(false);
    }
  };

  const handleSendMessage = async () => {
    if (!selectedLeadForChat || (!messageInput.trim() && !selectedFile)) return;

    setSendingMessage(true);
    try {
      const formData = new FormData();
      formData.append('content', messageInput);
      if (selectedFile) {
        formData.append('file', selectedFile);
        formData.append('type', selectedFile.type.startsWith('image/') ? 'image' : selectedFile.type.startsWith('video/') ? 'video' : 'document');
      } else {
        formData.append('type', 'text');
      }

      const response = await fetch(`/api/conversations/${selectedLeadForChat.conversation_id}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      });

      if (!response.ok) throw new Error('Failed to send message');

      const newMessage = await response.json();
      setChatMessages([...chatMessages, newMessage]);
      setMessageInput('');
      setSelectedFile(null);
      
      // Refresh lead data to update followup counts
      fetchLeads();
      // Refresh followup history
      const followups = await apiFetch(`/api/leads/${selectedLeadForChat.id}/followups`);
      setFollowupHistory(followups);
    } catch (error) {
      console.error('Failed to send message:', error);
      alert('Failed to send message. Please try again.');
    } finally {
      setSendingMessage(false);
    }
  };

  const fetchLeads = async () => {
    try {
      const queryParams = selectedChannel !== 'all' ? `?sessionId=${selectedChannel}` : '';
      const data = await apiFetch(`/api/leads${queryParams}`);
      setLeads(data);
      const statsData = await apiFetch(`/api/leads/stats${queryParams}`);
      setStats(statsData);
    } catch (error) {
      console.error('Failed to fetch leads:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchChannels = async () => {
    try {
      const data = await apiFetch('/api/whatsapp/sessions');
      setChannels(data);
    } catch (error) {
      console.error('Failed to fetch channels:', error);
    }
  };

  useEffect(() => {
    fetchChannels();
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [selectedChannel]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchLeads();
  };

  const handleStatusUpdate = async (leadId: number, newStatus: string) => {
    try {
      await apiFetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus })
      });
      setLeads(leads.map(l => l.id === leadId ? { ...l, status: newStatus as any } : l));
    } catch (error) {
      console.error('Failed to update lead status:', error);
    }
  };

  const handleExport = async () => {
    try {
      const columns = Array.from(selectedColumns);
      const response = await fetch(`/api/leads/export?columns=${columns.join(',')}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `leads_export_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const handleCopySelected = () => {
    const columns = Array.from(selectedColumns);
    const header = columns.map(col => col.charAt(0).toUpperCase() + col.slice(1)).join('\t');
    const rows = filteredLeads.map(lead => {
      return columns.map(col => {
        switch (col) {
          case 'name': return lead.name || lead.contact_name || 'Unknown';
          case 'website': return lead.website || '';
          case 'email': return lead.email || '';
          case 'date': return new Date(lead.created_at).toLocaleDateString();
          case 'status': return lead.status;
          case 'number': return lead.contact_number;
          case 'followups': return `Auto Follow-ups: ${lead.auto_followup_count}`;
          default: return '';
        }
      }).join('\t');
    }).join('\n');

    const textToCopy = `${header}\n${rows}`;
    navigator.clipboard.writeText(textToCopy).then(() => {
      alert('Selected columns copied to clipboard!');
    }).catch(err => {
      console.error('Failed to copy:', err);
    });
  };

  const filteredLeads = leads.filter(lead => {
    const matchesSearch = (lead.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          lead.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          lead.contact_number.includes(searchTerm));
    const matchesStatus = statusFilter === 'all' || lead.status === statusFilter;
    
    // Date Filtering
    let matchesDate = true;
    const leadDate = new Date(lead.created_at);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (dateFilter.type === 'today') {
      matchesDate = leadDate >= today;
    } else if (dateFilter.type === 'yesterday') {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      matchesDate = leadDate >= yesterday && leadDate < today;
    } else if (dateFilter.type === 'last7days') {
      const last7 = new Date(today);
      last7.setDate(last7.getDate() - 7);
      matchesDate = leadDate >= last7;
    } else if (dateFilter.type === 'custom' && dateFilter.date) {
      const targetDate = new Date(dateFilter.date);
      targetDate.setHours(0, 0, 0, 0);
      const nextDay = new Date(targetDate);
      nextDay.setDate(nextDay.getDate() + 1);
      matchesDate = leadDate >= targetDate && leadDate < nextDay;
    } else if (dateFilter.type === 'range' && dateFilter.range?.start && dateFilter.range?.end) {
      const startDate = new Date(dateFilter.range.start);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(dateFilter.range.end);
      endDate.setHours(23, 59, 59, 999);
      matchesDate = leadDate >= startDate && leadDate <= endDate;
    }
    
    return matchesSearch && matchesStatus && matchesDate;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'New': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'Contacted': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'Qualified': return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'Final Customer': return 'bg-green-100 text-green-700 border-green-200';
      case 'Not Interested': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getAutoLabels = (lead: Lead) => {
    const labels: { text: string, color: string }[] = [];
    
    // Website Submitted (Free Audit) - Purple
    if (lead.audit_status === 'added') {
      labels.push({ text: 'Website Submitted', color: 'bg-purple-100 text-purple-700 border-purple-200' });
    }
    
    // URL Received (Pending Audit) - Orange
    if (lead.is_audited === 0 && lead.audit_status === 'added') {
      labels.push({ text: 'URL Received', color: 'bg-orange-100 text-orange-700 border-orange-200' });
    }
    
    // Customer - Green
    if (lead.is_saved === 1 || lead.is_ordered === 1) {
      labels.push({ text: 'Customer', color: 'bg-green-100 text-green-700 border-green-200' });
    }

    // Add manual labels if any
    if (lead.labels && Array.isArray(lead.labels)) {
      lead.labels.forEach(label => {
        if (!labels.find(l => l.text === label.name)) {
          labels.push({ text: label.name, color: label.color });
        }
      });
    }

    return labels;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-7 h-7 text-indigo-600" />
            Leads Management
          </h1>
          <p className="text-gray-500 mt-1">Track and manage your potential customers captured from AI chats.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button 
            onClick={handleCopySelected}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
          >
            <Copy className="w-4 h-4" />
            Copy Selected
          </button>
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4"
        >
          <div className="p-3 bg-indigo-50 rounded-xl">
            <Users className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Total Leads</p>
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4"
        >
          <div className="p-3 bg-blue-50 rounded-xl">
            <UserPlus className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">New Leads</p>
            <div className="flex items-center gap-2">
              <p className="text-2xl font-bold text-gray-900">{stats.new_count}</p>
              {stats.new_count > 0 && (
                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-bold rounded-full animate-pulse">
                  NEW
                </span>
              )}
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4"
        >
          <div className="p-3 bg-green-50 rounded-xl">
            <Activity className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Recent Activity (24h)</p>
            <div className="flex items-center gap-2">
              <p className="text-2xl font-bold text-gray-900">{stats.recent_count}</p>
              <TrendingUp className="w-4 h-4 text-green-500" />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input 
              type="text"
              placeholder="Search by name, email or number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all"
            />
          </div>
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-gray-400" />
            <select 
              value={selectedChannel}
              onChange={(e) => setSelectedChannel(e.target.value)}
              className="bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 py-2 pl-3 pr-8 text-sm font-medium text-gray-700"
            >
              <option value="all">All Channels</option>
              {channels.map(channel => (
                <option key={channel.id} value={channel.id}>
                  {channel.name || channel.number || `Channel ${channel.id}`}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-400" />
            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 py-2 pl-3 pr-8 text-sm font-medium text-gray-700"
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

        {/* Date Filters */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-50">
          <Clock className="w-4 h-4 text-gray-400 mr-1" />
          <div className="flex gap-1">
            {[
              { id: 'all', label: 'All Time' },
              { id: 'today', label: 'Today' },
              { id: 'yesterday', label: 'Yesterday' },
              { id: 'last7days', label: 'Last 7 Days' },
              { id: 'custom', label: 'Custom Date' },
              { id: 'range', label: 'Date Range' }
            ].map((filter) => (
              <button
                key={filter.id}
                onClick={() => setDateFilter({ type: filter.id as any })}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  dateFilter.type === filter.id
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                    : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
          
          {dateFilter.type === 'custom' && (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2 ml-2"
            >
              <input 
                type="date"
                value={dateFilter.date || ''}
                onChange={(e) => setDateFilter({ type: 'custom', date: e.target.value })}
                className="bg-gray-50 border-none rounded-lg py-1.5 px-3 text-xs font-bold text-indigo-600 focus:ring-2 focus:ring-indigo-500"
              />
            </motion.div>
          )}

          {dateFilter.type === 'range' && (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2 ml-2"
            >
              <input 
                type="date"
                value={dateFilter.range?.start || ''}
                onChange={(e) => setDateFilter({ ...dateFilter, range: { ...dateFilter.range!, start: e.target.value } })}
                className="bg-gray-50 border-none rounded-lg py-1.5 px-3 text-xs font-bold text-indigo-600 focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-gray-400 text-xs">to</span>
              <input 
                type="date"
                value={dateFilter.range?.end || ''}
                onChange={(e) => setDateFilter({ ...dateFilter, range: { ...dateFilter.range!, end: e.target.value } })}
                className="bg-gray-50 border-none rounded-lg py-1.5 px-3 text-xs font-bold text-indigo-600 focus:ring-2 focus:ring-indigo-500"
              />
            </motion.div>
          )}
        </div>
      </div>

      {/* Leads Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse table-fixed min-w-[1000px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider w-[200px]">
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      checked={selectedColumns.has('name')} 
                      onChange={() => toggleColumn('name')}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    Name
                  </div>
                </th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider w-[150px]">
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      checked={selectedColumns.has('number')} 
                      onChange={() => toggleColumn('number')}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    Number
                  </div>
                </th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider w-[180px]">
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      checked={selectedColumns.has('website')} 
                      onChange={() => toggleColumn('website')}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    Website
                  </div>
                </th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider w-[180px]">
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      checked={selectedColumns.has('email')} 
                      onChange={() => toggleColumn('email')}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    Email
                  </div>
                </th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider w-[120px]">
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      checked={selectedColumns.has('date')} 
                      onChange={() => toggleColumn('date')}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    Date
                  </div>
                </th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider w-[140px]">
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      checked={selectedColumns.has('status')} 
                      onChange={() => toggleColumn('status')}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    Status
                  </div>
                </th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider w-[120px]">
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      checked={selectedColumns.has('followups')} 
                      onChange={() => toggleColumn('followups')}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    Follow-ups
                  </div>
                </th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right w-[100px]">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              <AnimatePresence mode="popLayout">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={`skeleton-${i}`} className="animate-pulse">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-gray-200 rounded-full" />
                          <div className="h-3 w-24 bg-gray-200 rounded" />
                        </div>
                      </td>
                      <td className="px-4 py-3"><div className="h-3 w-20 bg-gray-100 rounded" /></td>
                      <td className="px-4 py-3"><div className="h-3 w-24 bg-gray-100 rounded" /></td>
                      <td className="px-4 py-3"><div className="h-3 w-20 bg-gray-100 rounded" /></td>
                      <td className="px-4 py-3"><div className="h-3 w-16 bg-gray-100 rounded" /></td>
                      <td className="px-4 py-3"><div className="h-5 w-16 bg-gray-100 rounded-full" /></td>
                      <td className="px-4 py-3"><div className="h-3 w-12 bg-gray-100 rounded" /></td>
                      <td className="px-4 py-3 text-right"><div className="h-7 w-7 bg-gray-100 rounded ml-auto" /></td>
                    </tr>
                  ))
                ) : filteredLeads.length > 0 ? (
                  filteredLeads.map((lead) => (
                    <motion.tr 
                      key={lead.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="hover:bg-gray-50/50 transition-colors group"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 flex-shrink-0 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs shadow-sm">
                            {(lead.name || lead.contact_name || 'U').charAt(0).toUpperCase()}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-1 truncate">
                              <span className="font-semibold text-gray-900 text-sm truncate">{lead.name || lead.contact_name || 'Unknown'}</span>
                              {lead.is_new === 1 && (
                                <span className="flex-shrink-0 px-1 py-0.5 bg-blue-100 text-blue-700 text-[8px] font-bold rounded uppercase">New</span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {getAutoLabels(lead).slice(0, 2).map((label, idx) => (
                                <span 
                                  key={`lead-label-${lead.id}-${idx}`}
                                  className={`px-1 py-0.5 rounded text-[8px] font-bold border ${label.color} whitespace-nowrap`}
                                >
                                  {label.text}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs text-gray-600 font-mono truncate">
                          {lead.contact_number}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {lead.website ? (
                          <a 
                            href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-indigo-600 hover:text-indigo-800 text-xs font-medium flex items-center gap-1 truncate"
                          >
                            <ExternalLink className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{lead.website}</span>
                          </a>
                        ) : (
                          <span className="text-gray-400 text-[10px] italic">Not provided</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-600 truncate block">{lead.email || 'No email'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="text-xs text-gray-700 font-medium">{new Date(lead.created_at).toLocaleDateString()}</span>
                          <span className="text-[10px] text-gray-400 flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            {new Date(lead.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <select 
                          value={lead.status}
                          onChange={(e) => handleStatusUpdate(lead.id, e.target.value)}
                          className={`text-[10px] font-bold px-2 py-1 rounded-full border transition-all cursor-pointer focus:ring-2 focus:ring-indigo-500 w-full ${getStatusColor(lead.status)}`}
                        >
                          <option value="New">New</option>
                          <option value="Contacted">Contacted</option>
                          <option value="Qualified">Qualified</option>
                          <option value="Final Customer">Final Customer</option>
                          <option value="Not Interested">Not Interested</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-gray-900">{lead.auto_followup_count} Sent</span>
                          {lead.last_followup_at && (
                            <span className="text-[9px] text-gray-400 mt-0.5">Last: {new Date(lead.last_followup_at).toLocaleDateString()}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end">
                          <button 
                            onClick={() => {
                              setSelectedLeadForChat(lead);
                              fetchChatMessages(lead.conversation_id, lead.id);
                            }}
                            className="flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-all text-[10px] font-bold whitespace-nowrap"
                          >
                            <Activity className="w-3 h-3" />
                            View Chat
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center">
                      <div className="flex flex-col items-center justify-center text-gray-400">
                        <Users className="w-12 h-12 mb-4 opacity-20" />
                        <p className="text-lg font-medium">No leads found</p>
                        <p className="text-sm">Try adjusting your search or filters.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>

      {/* Chat Pop-up Modal */}
      <AnimatePresence>
        {selectedLeadForChat && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-2xl h-[80vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-white">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-lg">
                    {(selectedLeadForChat.name || selectedLeadForChat.contact_name || 'U').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{selectedLeadForChat.name || selectedLeadForChat.contact_name || 'Unknown'}</h3>
                    <p className="text-sm text-gray-500">{selectedLeadForChat.contact_number}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedLeadForChat(null)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <RefreshCw className="w-6 h-6 text-gray-400 rotate-45" />
                </button>
              </div>

              {/* Chat Messages Area */}
              <div className="flex-1 overflow-hidden flex flex-col bg-gray-50/50">
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {loadingChat ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3">
                      <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
                      <p className="text-sm text-gray-500">Loading conversation...</p>
                    </div>
                  ) : chatMessages.length > 0 ? (
                    chatMessages.map((msg, idx) => (
                      <div 
                        key={msg.id || `chat-msg-${idx}`}
                        className={`flex ${msg.sender === 'contact' ? 'justify-start' : 'justify-end'}`}
                      >
                        <div className={`max-w-[80%] p-4 rounded-2xl shadow-sm ${
                          msg.sender === 'contact' 
                            ? 'bg-white text-gray-800 rounded-tl-none' 
                            : 'bg-indigo-600 text-white rounded-tr-none'
                        }`}>
                          <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                          {msg.type !== 'text' && (
                            <div className="mt-2 p-2 bg-black/10 rounded-lg flex items-center gap-2 text-xs">
                              <Download className="w-3 h-3" />
                              Attachment: {msg.type}
                            </div>
                          )}
                          <p className={`text-[10px] mt-1 opacity-60 ${msg.sender === 'contact' ? 'text-gray-500' : 'text-indigo-100'}`}>
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-gray-400">
                      <AlertCircle className="w-12 h-12 mb-2 opacity-20" />
                      <p>No messages found in this conversation.</p>
                    </div>
                  )}
                </div>

                {/* Last 3 Follow-ups Section */}
                {followupHistory.length > 0 && (
                  <div className="px-6 py-3 bg-white border-t border-gray-100">
                    <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Last 3 Automated Follow-ups
                    </p>
                    <div className="space-y-2">
                      {followupHistory.map((msg, idx) => (
                        <div key={msg.id || `followup-${idx}`} className="p-2 bg-indigo-50/50 rounded-lg border border-indigo-100">
                          <p className="text-[11px] text-gray-700 line-clamp-2">{msg.content}</p>
                          <p className="text-[9px] text-indigo-400 mt-1 font-medium">{new Date(msg.created_at).toLocaleDateString()} {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Manual Message Input */}
                <div className="p-4 bg-white border-t border-gray-100">
                  <div className="flex flex-col gap-2">
                    {selectedFile && (
                      <div className="flex items-center justify-between bg-indigo-50 px-3 py-2 rounded-lg">
                        <div className="flex items-center gap-2 text-xs text-indigo-600 font-medium">
                          <Download className="w-4 h-4" />
                          {selectedFile.name}
                        </div>
                        <button onClick={() => setSelectedFile(null)} className="text-indigo-400 hover:text-indigo-600">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <input 
                        type="file"
                        ref={fileInputRef}
                        onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                        className="hidden"
                      />
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                      >
                        <RefreshCw className="w-5 h-5 rotate-45" />
                      </button>
                      <input 
                        type="text"
                        placeholder="Type a follow-up message..."
                        value={messageInput}
                        onChange={(e) => setMessageInput(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                        className="flex-1 bg-gray-50 border-none rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                      />
                      <button 
                        onClick={handleSendMessage}
                        disabled={sendingMessage || (!messageInput.trim() && !selectedFile)}
                        className="p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {sendingMessage ? <RefreshCw className="w-5 h-5 animate-spin" /> : <MessageSquare className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-gray-100 bg-white flex justify-end">
                <button 
                  onClick={() => {
                    if (onOpenChat) {
                      onOpenChat(selectedLeadForChat.conversation_id);
                    }
                  }}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all flex items-center gap-2"
                >
                  Open in Inbox
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Leads;
