import React, { useState, useEffect } from 'react';
import { QrCode, Plus, Trash2, RefreshCw, Loader2, Smartphone, CheckCircle2, XCircle, AlertCircle, Facebook, Instagram, MessageSquare, ExternalLink, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { io, Socket } from 'socket.io-client';
import QRCode from 'qrcode';
import { apiFetch } from '../lib/api';
import { loadingManager } from '../lib/loading';

interface Session {
  id: number;
  agent_id: number;
  number: string;
  name?: string;
  status: 'connected' | 'disconnected';
  agent_name?: string;
}

interface WhatsAppProps {
  token: string;
}

export default function WhatsApp({ token }: WhatsAppProps) {
  const [activePlatform, setActivePlatform] = useState<'whatsapp' | 'facebook' | 'instagram'>('whatsapp');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [socialAccounts, setSocialAccounts] = useState<any[]>([]);
  const [isConnectingSocial, setIsConnectingSocial] = useState(false);
  const [agents, setAgents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [selectedAgent, setSelectedAgent] = useState('');
  const [selectedSessions, setSelectedSessions] = useState<number[]>([]);
  const [qrCodes, setQrCodes] = useState<{ [key: string]: string }>({});
  const [socket, setSocket] = useState<Socket | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number | 'bulk', count?: number } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const fetchData = async () => {
    try {
      const [sessionsData, agentsData, socialData] = await Promise.all([
        apiFetch('/api/whatsapp/sessions'),
        apiFetch('/api/agents'),
        apiFetch('/api/social/accounts'),
      ]);
      
      setSessions(sessionsData.map((s: any) => ({
        ...s,
        agent_name: agentsData.find((a: any) => a.id === s.agent_id)?.name || 'Unknown Agent'
      })));
      setAgents(agentsData);
      setSocialAccounts(socialData);
      setError(null);
    } catch (error: any) {
      console.error('Failed to fetch data:', error);
      setError(`Failed to load WhatsApp sessions: ${error.message || 'Please check your connection.'}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    const newSocket = io();
    setSocket(newSocket);

    newSocket.on('qr', async ({ sessionId, qr }) => {
      const qrDataUrl = await QRCode.toDataURL(qr);
      setQrCodes(prev => ({ ...prev, [sessionId]: qrDataUrl }));
    });

    newSocket.on('sync_status', ({ sessionId, status, progress, message }) => {
      if (status === 'syncing') {
        loadingManager.setLoading(true, message || 'Syncing contacts. Please wait...');
        loadingManager.setProgress(progress || 0);
      } else if (status === 'completed' || status === 'error') {
        loadingManager.setProgress(100);
        setTimeout(() => loadingManager.setLoading(false), 1000);
        if (status === 'error') {
          setError(message || 'Sync failed. Please check your connection.');
        }
      }
    });

    newSocket.on('connection_status', ({ sessionId, status, number }) => {
      setSessions(prev => prev.map(s => 
        s.id === parseInt(sessionId) ? { ...s, status, number } : s
      ));
      if (status === 'connected') {
        setQrCodes(prev => {
          const newCodes = { ...prev };
          delete newCodes[sessionId];
          return newCodes;
        });
      }
    });

    newSocket.on('session_disconnected', ({ sessionId }) => {
      setSessions(prev => prev.filter(s => s.id !== parseInt(sessionId)));
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!sessionName.trim()) errors.sessionName = 'WhatsApp name is required';
    if (!selectedAgent) errors.selectedAgent = 'Please assign an agent';
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAddSession = async () => {
    if (!validateForm()) return;
    try {
      const result = await apiFetch('/api/whatsapp/sessions', {
        method: 'POST',
        body: JSON.stringify({ 
          agent_id: parseInt(selectedAgent),
          name: sessionName
        }),
        headers: { 'Content-Type': 'application/json' }
      });
      fetchData();
      setIsAdding(false);
      setSelectedAgent('');
      setSessionName('');
      setValidationErrors({});
      
      // Automatically trigger connection
      handleConnect(result.id);
    } catch (error) {
      console.error('Failed to add session');
    }
  };

  const handleConnect = async (id: number) => {
    try {
      await apiFetch(`/api/whatsapp/sessions/${id}/connect`, {
        method: 'POST',
        heavy: true,
      });
    } catch (error) {
      console.error('Failed to connect');
    }
  };

  const handleDisconnect = async (id: number) => {
    try {
      await apiFetch(`/api/whatsapp/sessions/${id}/disconnect`, {
        method: 'POST',
        heavy: true,
      });
      fetchData();
    } catch (error) {
      console.error('Failed to disconnect');
    }
  };

  const handleDeleteSession = async (id: number) => {
    setDeleteConfirm({ id });
  };

  const handleBulkDelete = async () => {
    if (selectedSessions.length === 0) return;
    setDeleteConfirm({ id: 'bulk', count: selectedSessions.length });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    setIsDeleting(true);
    try {
      if (deleteConfirm.id === 'bulk') {
        await apiFetch('/api/whatsapp/sessions/bulk-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: selectedSessions }),
        });
        setSelectedSessions([]);
      } else {
        await apiFetch(`/api/whatsapp/sessions/${deleteConfirm.id}`, {
          method: 'DELETE',
        });
        setSelectedSessions(prev => prev.filter(sid => sid !== deleteConfirm.id));
      }
      setDeleteConfirm(null);
      fetchData();
    } catch (error) {
      console.error('Failed to delete session(s)');
      setError('Failed to delete session(s). Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleSessionSelection = (id: number) => {
    setSelectedSessions(prev => 
      prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedSessions.length === sessions.length) {
      setSelectedSessions([]);
    } else {
      setSelectedSessions(sessions.map(s => s.id));
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
          onClick={fetchData}
          className="bg-primary text-white px-6 py-2 rounded-xl text-sm font-bold"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Channels</h2>
          <p className="text-gray-500 text-sm">Manage your communication channels and bot integrations</p>
        </div>
        
        <div className="flex bg-white p-1 rounded-2xl border border-gray-100 shadow-sm">
          <button
            onClick={() => setActivePlatform('whatsapp')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
              activePlatform === 'whatsapp' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <Smartphone className="w-4 h-4" /> WhatsApp
          </button>
          <button
            onClick={() => setActivePlatform('facebook')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
              activePlatform === 'facebook' ? 'bg-[#1877F2] text-white shadow-lg shadow-blue-500/20' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <Facebook className="w-4 h-4" /> Facebook
          </button>
          <button
            onClick={() => setActivePlatform('instagram')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
              activePlatform === 'instagram' ? 'bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white shadow-lg shadow-pink-500/20' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <Instagram className="w-4 h-4" /> Instagram
          </button>
        </div>
      </div>

      {activePlatform === 'whatsapp' ? (
        <>
          <div className="flex justify-end items-center gap-3">
            <AnimatePresence>
              {isSelectionMode && selectedSessions.length > 1 && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  onClick={handleBulkDelete}
                  className="bg-red-500 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg shadow-red-500/20 hover:bg-red-600 transition-all"
                >
                  <Trash2 className="w-4 h-4" /> Delete ({selectedSessions.length})
                </motion.button>
              )}
            </AnimatePresence>
            
            <button
              onClick={() => {
                setIsSelectionMode(!isSelectionMode);
                if (isSelectionMode) setSelectedSessions([]);
              }}
              disabled={sessions.length <= 1}
              className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${
                sessions.length <= 1
                  ? 'bg-gray-50 text-gray-300 cursor-not-allowed border-gray-100'
                  : isSelectionMode 
                    ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' 
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {isSelectionMode ? 'Cancel Selection' : 'Bulk Delete'}
            </button>

            <button
              onClick={() => setIsAdding(true)}
              className="bg-primary text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg shadow-primary/20"
            >
              <Plus className="w-4 h-4" /> Add Number
            </button>
          </div>

      {isSelectionMode && sessions.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 mb-2"
        >
          <label className="flex items-center gap-2 cursor-pointer group bg-white border border-gray-100 px-4 py-2 rounded-xl shadow-sm">
            <input 
              type="checkbox" 
              checked={sessions.length > 0 && selectedSessions.length === sessions.length}
              onChange={toggleSelectAll}
              className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary/20"
            />
            <span className="text-xs font-bold text-gray-500 group-hover:text-primary transition-colors">Select All Sessions</span>
          </label>
        </motion.div>
      )}

      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-white border border-primary/20 p-6 rounded-3xl shadow-xl shadow-primary/5"
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-primary" />
                Add WhatsApp Number
              </h3>
              <button onClick={() => setIsAdding(false)}>
                <XCircle className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="flex items-end gap-4">
              <div className="flex-1 space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">WhatsApp Name <span className="text-red-500 ml-1">*Required</span></label>
                <input
                  type="text"
                  placeholder="e.g. Sales Support"
                  className={`w-full bg-gray-50 border ${validationErrors.sessionName ? 'border-red-500' : 'border-gray-200'} rounded-xl p-3 text-sm`}
                  value={sessionName}
                  onChange={(e) => {
                    setSessionName(e.target.value);
                    if (validationErrors.sessionName) setValidationErrors(prev => {
                      const next = { ...prev };
                      delete next.sessionName;
                      return next;
                    });
                  }}
                />
                {validationErrors.sessionName && <p className="text-[10px] text-red-500 font-bold">{validationErrors.sessionName}</p>}
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Assign Agent <span className="text-red-500 ml-1">*Required</span></label>
                <select
                  className={`w-full bg-gray-50 border ${validationErrors.selectedAgent ? 'border-red-500' : 'border-gray-200'} rounded-xl p-3 text-sm`}
                  value={selectedAgent}
                  onChange={(e) => {
                    setSelectedAgent(e.target.value);
                    if (validationErrors.selectedAgent) setValidationErrors(prev => {
                      const next = { ...prev };
                      delete next.selectedAgent;
                      return next;
                    });
                  }}
                >
                  <option value="">Select an Agent</option>
                  {agents.map(agent => (
                    <option key={agent.id} value={agent.id}>{agent.name}</option>
                  ))}
                </select>
                {validationErrors.selectedAgent && <p className="text-[10px] text-red-500 font-bold">{validationErrors.selectedAgent}</p>}
              </div>
              <button
                onClick={handleAddSession}
                className="bg-primary text-white px-6 py-3 rounded-xl text-sm font-bold shadow-lg shadow-primary/20 h-[46px]"
              >
                Create Session
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteConfirm && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl"
            >
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-center text-gray-900 mb-2">Confirm Deletion</h3>
              <p className="text-gray-500 text-center mb-8">
                Are you sure you want to delete {deleteConfirm.id === 'bulk' ? `${deleteConfirm.count} sessions` : 'this session'}? 
                This action cannot be undone and all associated data will be permanently removed.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  disabled={isDeleting}
                  className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={isDeleting}
                  className="flex-1 py-3 bg-red-500 text-white rounded-xl font-bold shadow-lg shadow-red-500/20 hover:bg-red-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete Permanently'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sessions.map((session) => (
          <motion.div
            key={session.id}
            layout
            className={`bg-white border p-6 rounded-3xl shadow-sm hover:shadow-md transition-all relative group ${
              selectedSessions.includes(session.id) ? 'border-primary ring-1 ring-primary/20' : 'border-gray-100'
            }`}
          >
            <AnimatePresence>
              {isSelectionMode && (
                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="absolute top-4 left-4 z-10"
                >
                  <input 
                    type="checkbox" 
                    checked={selectedSessions.includes(session.id)}
                    onChange={() => toggleSessionSelection(session.id)}
                    className="w-5 h-5 rounded-lg border-gray-300 text-primary focus:ring-primary/20 cursor-pointer"
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <div className={`flex justify-between items-start mb-6 transition-all ${isSelectionMode ? 'pl-8' : ''}`}>
              <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                session.status === 'connected' ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-400'
              }`}>
                <Smartphone className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">{session.name || session.number || 'New Session'}</h3>
                <p className="text-xs text-gray-500">Agent: {session.agent_name}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {session.status === 'connected' ? (
                <div className="px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500 text-white shadow-lg shadow-emerald-500/20">
                  CONNECTED
                </div>
              ) : (
                <div className="px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-gray-100 text-gray-400">
                  DISCONNECTED
                </div>
              )}
              <button 
                onClick={() => handleDeleteSession(session.id)}
                className="p-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {qrCodes[session.id] ? (
            <div className="space-y-4">
              <div className="bg-white p-4 rounded-2xl flex justify-center border-2 border-dashed border-gray-100 relative group/qr">
                <img src={qrCodes[session.id]} alt="QR Code" className="w-48 h-48 transition-all group-hover/qr:scale-105" />
                <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex items-center justify-center opacity-0 group-hover/qr:opacity-100 transition-all rounded-2xl">
                  <p className="text-[10px] font-black text-gray-900 uppercase tracking-widest bg-white px-3 py-1.5 rounded-full shadow-xl border border-gray-100">Scan to Connect</p>
                </div>
              </div>
              <div className="flex items-center justify-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                Waiting for scan...
              </div>
            </div>
          ) : session.status === 'disconnected' ? (
            <button
              onClick={() => handleConnect(session.id)}
              className="w-full py-4 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-xl shadow-slate-900/20 hover:bg-primary transition-all active:scale-[0.98]"
            >
              <RefreshCw className="w-4 h-4" /> Initialize Connection
            </button>
          ) : (
            <div className="space-y-4">
              <div className="bg-emerald-50 p-8 rounded-2xl flex flex-col items-center justify-center border border-emerald-100 text-emerald-600 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full -mr-12 -mt-12 blur-2xl" />
                <CheckCircle2 className="w-12 h-12 mb-3 animate-bounce" />
                <p className="text-xs font-black uppercase tracking-widest">System Online</p>
              </div>
              <button
                onClick={() => handleDisconnect(session.id)}
                className="w-full py-3 bg-red-50 text-red-500 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-red-100 transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Terminate Session
              </button>
            </div>
          )}
          </motion.div>
        ))}
      </div>
    </>
  ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Connect Button Card */}
          <motion.button
            whileHover={{ y: -4 }}
            onClick={() => setIsConnectingSocial(true)}
            className="bg-white border-2 border-dashed border-gray-200 p-8 rounded-3xl flex flex-col items-center justify-center gap-4 hover:border-primary/50 hover:bg-primary/5 transition-all group"
          >
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all ${
              activePlatform === 'facebook' ? 'bg-[#1877F2]/10 text-[#1877F2] group-hover:bg-[#1877F2] group-hover:text-white' : 'bg-pink-50 text-pink-500 group-hover:bg-pink-500 group-hover:text-white'
            }`}>
              {activePlatform === 'facebook' ? <Facebook className="w-8 h-8" /> : <Instagram className="w-8 h-8" />}
            </div>
            <div className="text-center">
              <h3 className="font-bold text-gray-900">Connect {activePlatform === 'facebook' ? 'Facebook' : 'Instagram'}</h3>
              <p className="text-xs text-gray-500 mt-1">Link your business account to start messaging</p>
            </div>
            <div className="mt-2 p-2 bg-gray-50 rounded-xl group-hover:bg-white transition-all">
              <Plus className="w-5 h-5 text-gray-400" />
            </div>
          </motion.button>

          {/* Connected Accounts */}
          {socialAccounts.filter(acc => acc.platform === activePlatform).map((account) => (
            <motion.div
              key={account.id}
              layout
              className="bg-white border border-gray-100 p-6 rounded-3xl shadow-sm hover:shadow-md transition-all relative group"
            >
              <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <img 
                      src={account.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(account.name)}&background=random`} 
                      alt={account.name}
                      className="w-12 h-12 rounded-2xl object-cover border-2 border-white shadow-sm"
                    />
                    <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-lg flex items-center justify-center text-white shadow-sm ${
                      activePlatform === 'facebook' ? 'bg-[#1877F2]' : 'bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF]'
                    }`}>
                      {activePlatform === 'facebook' ? <Facebook className="w-3 h-3" /> : <Instagram className="w-3 h-3" />}
                    </div>
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">{account.name}</h3>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Connected</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500 text-white shadow-lg shadow-emerald-500/20">
                    ACTIVE
                  </div>
                  <button 
                    onClick={async () => {
                      if (confirm('Are you sure you want to disconnect this account?')) {
                        await apiFetch(`/api/social/accounts/${account.id}`, { method: 'DELETE' });
                        fetchData();
                      }
                    }}
                    className="p-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-white rounded-xl flex items-center justify-center text-gray-400 shadow-sm">
                      <MessageSquare className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-bold text-gray-600">Auto-Reply Status</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Enabled</span>
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  </div>
                </div>

                <div className="flex gap-2">
                  <button className="flex-1 py-3 bg-gray-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-primary transition-all">
                    <ExternalLink className="w-3.5 h-3.5" /> View Page
                  </button>
                  <button className="flex-1 py-3 bg-white border border-gray-200 text-gray-600 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-gray-50 transition-all">
                    <Settings className="w-3.5 h-3.5" /> Config
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Social Connection Modal */}
      <AnimatePresence>
        {isConnectingSocial && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[32px] p-8 max-w-md w-full shadow-2xl border border-white/20"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Connect Account</h2>
                <button 
                  onClick={() => setIsConnectingSocial(false)}
                  className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
                >
                  <XCircle className="w-6 h-6 text-gray-400" />
                </button>
              </div>

              <div className="space-y-4">
                <button
                  onClick={async () => {
                    const mockAccount = {
                      platform: 'facebook',
                      account_id: 'fb_' + Date.now(),
                      name: 'Facebook Business Page',
                      access_token: 'mock_token',
                      avatar: 'https://ui-avatars.com/api/?name=FB&background=1877F2&color=fff'
                    };
                    await apiFetch('/api/social/login', {
                      method: 'POST',
                      body: JSON.stringify(mockAccount),
                      headers: { 'Content-Type': 'application/json' }
                    });
                    fetchData();
                    setIsConnectingSocial(false);
                  }}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl bg-[#1877F2] text-white hover:bg-[#1877F2]/90 transition-all shadow-lg shadow-blue-500/20"
                >
                  <div className="p-2 bg-white/20 rounded-xl">
                    <Facebook className="w-6 h-6" />
                  </div>
                  <div className="text-left">
                    <p className="font-bold">Login with Facebook</p>
                    <p className="text-xs opacity-80">Connect your Facebook pages</p>
                  </div>
                </button>

                <button
                  onClick={async () => {
                    const mockAccount = {
                      platform: 'instagram',
                      account_id: 'ig_' + Date.now(),
                      name: 'Instagram Business',
                      access_token: 'mock_token',
                      avatar: 'https://ui-avatars.com/api/?name=IG&background=E4405F&color=fff'
                    };
                    await apiFetch('/api/social/login', {
                      method: 'POST',
                      body: JSON.stringify(mockAccount),
                      headers: { 'Content-Type': 'application/json' }
                    });
                    fetchData();
                    setIsConnectingSocial(false);
                  }}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white hover:opacity-90 transition-all shadow-lg shadow-pink-500/20"
                >
                  <div className="p-2 bg-white/20 rounded-xl">
                    <Instagram className="w-6 h-6" />
                  </div>
                  <div className="text-left">
                    <p className="font-bold">Login with Instagram</p>
                    <p className="text-xs opacity-80">Connect your Instagram business account</p>
                  </div>
                </button>
              </div>

              <p className="mt-6 text-center text-xs text-gray-400">
                By connecting, you agree to our terms of service and allow the bot to access your messages.
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
