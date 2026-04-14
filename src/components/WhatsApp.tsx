import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, RefreshCw, Loader2, Smartphone, CheckCircle2, XCircle, AlertCircle, Facebook, Instagram, MessageSquare, ExternalLink, Settings, X, Wifi, WifiOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import socket from '../lib/socket';
import QRCode from 'qrcode';
import { apiFetch } from '../lib/api';

interface Session {
  id: number;
  agent_id: number;
  number: string;
  name?: string;
  profile_name?: string;
  status: 'connected' | 'disconnected' | 'connecting';
  agent_name?: string;
  platform?: string;
}

interface SyncState {
  status: string;
  progress: number;
  message?: string;
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
  const [isCreating, setIsCreating] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [selectedAgent, setSelectedAgent] = useState('');
  const [selectedSessions, setSelectedSessions] = useState<number[]>([]);
  const [qrCodes, setQrCodes] = useState<{ [key: string]: string }>({});
  const [syncStates, setSyncStates] = useState<{ [key: string]: SyncState }>({});
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number | 'bulk'; count?: number } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const isModalOpen = !!deleteConfirm || isConnectingSocial;
    window.dispatchEvent(new CustomEvent('toggle-modal-blur', { detail: { isOpen: isModalOpen } }));
  }, [deleteConfirm, isConnectingSocial]);

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
    } catch (err: any) {
      setError(`Failed to load: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Poll for QR aggressively
  const pollQR = async (sessionId: number) => {
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 1000));
      // Already got QR via socket
      if (qrCodes[sessionId]) break;
      try {
        const data = await apiFetch(`/api/whatsapp/sessions/${sessionId}/qr`);
        if (data.qr) {
          const url = await QRCode.toDataURL(data.qr);
          setQrCodes(prev => ({ ...prev, [sessionId]: url }));
          break;
        }
      } catch (e) {}
    }
  };

  useEffect(() => {
    fetchData();
    
    socket.on('qr', async ({ sessionId, qr }) => {
      try {
        const url = await QRCode.toDataURL(qr);
        setQrCodes(prev => ({ ...prev, [sessionId]: url }));
        // Status connecting dikha
        setSessions(prev => prev.map(s =>
          s.id === parseInt(sessionId) ? { ...s, status: 'connecting' } : s
        ));
      } catch (e) {
        console.error('QR conversion failed:', e);
      }
    });

    socket.on('connection_status', ({ sessionId, status, number, profileName }) => {
      const sid = parseInt(sessionId);
      
      // Update status for all states
      setSessions(prev => prev.map(s =>
        s.id === sid ? { ...s, status, number: number || s.number, profile_name: profileName || s.profile_name } : s
      ));

      if (status === 'connected') {
        setQrCodes(prev => { const n = { ...prev }; delete n[sessionId]; return n; });
        fetchData();
      } else if (status === 'disconnected') {
        setQrCodes(prev => { const n = { ...prev }; delete n[sessionId]; return n; });
      }
    });

    socket.on('sync_status', ({ sessionId, status, progress, message }) => {
      setSyncStates(prev => ({ ...prev, [sessionId]: { status, progress: progress || 0, message } }));
      if (status === 'completed') {
        fetchData();
      }
    });

    socket.on('session_disconnected', ({ sessionId }) => {
      const sid = parseInt(sessionId);
      // Har jagah se disconnect — status update + QR clear
      setSessions(prev => prev.map(s => s.id === sid ? { ...s, status: 'disconnected', number: '' } : s));
      setQrCodes(prev => { const n = { ...prev }; delete n[sessionId]; return n; });
      // Conversations tab ko bhi notify karo
      window.dispatchEvent(new CustomEvent('whatsapp_disconnected', { detail: { sessionId: sid } }));
    });

    return () => {
      socket.off('qr');
      socket.off('connection_status');
      socket.off('sync_status');
      socket.off('session_disconnected');
    };
  }, []);

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!sessionName.trim()) errors.sessionName = 'WhatsApp name is required';
    if (!selectedAgent) errors.selectedAgent = 'Please select an agent';
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAddSession = async () => {
    if (!validateForm()) return;
    setIsCreating(true);
    try {
      const result = await apiFetch('/api/whatsapp/sessions', {
        method: 'POST',
        body: JSON.stringify({ agent_id: parseInt(selectedAgent), name: sessionName }),
        headers: { 'Content-Type': 'application/json' }
      });

      // Form reset + modal band
      setIsAdding(false);
      setSessionName('');
      setSelectedAgent('');
      setValidationErrors({});

      // Card turant show karo QR ke saath — connect call karo
      const newSession: Session = {
        id: result.id,
        agent_id: parseInt(selectedAgent),
        name: result.name || sessionName,
        number: '',
        status: 'connecting',
        platform: 'whatsapp',
        agent_name: agents.find(a => a.id === parseInt(selectedAgent))?.name || 'Agent'
      };
      setSessions(prev => [newSession, ...prev]);

      // Connect karo — QR aayega socket/poll se
      handleConnect(result.id);
    } catch (err: any) {
      setError(err.message || 'Failed to create session');
    } finally {
      setIsCreating(false);
    }
  };

  // Poll for status aggressively
  const pollStatus = async (sessionId: number) => {
    // Poll for 2 minutes
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const data = await apiFetch('/api/whatsapp/sessions');
        const session = data.find((s: any) => s.id === sessionId);
        if (session) {
          if (session.status === 'connected') {
            setSessions(data);
            setQrCodes(prev => { const n = { ...prev }; delete n[sessionId]; return n; });
            break;
          } else if (session.status === 'disconnected') {
            setSessions(data);
            break;
          }
        }
      } catch (e) {}
    }
  };

  const handleConnect = async (id: number, force: boolean = false) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, status: 'connecting' } : s));
    try {
      await apiFetch(`/api/whatsapp/sessions/${id}/connect`, { 
        method: 'POST',
        body: JSON.stringify({ force }),
        headers: { 'Content-Type': 'application/json' }
      });
      pollQR(id);
      pollStatus(id);
    } catch (err) {
      console.error('Failed to connect');
      setSessions(prev => prev.map(s => s.id === id ? { ...s, status: 'disconnected' } : s));
    }
  };

  const handleDisconnect = async (id: number) => {
    try {
      await apiFetch(`/api/whatsapp/sessions/${id}/disconnect`, { method: 'POST' });
      setSessions(prev => prev.map(s => s.id === id ? { ...s, status: 'disconnected', number: '' } : s));
      setQrCodes(prev => { const n = { ...prev }; delete n[id]; return n; });
    } catch (err) {
      console.error('Failed to disconnect');
    }
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    setIsDeleting(true);
    try {
      if (deleteConfirm.id === 'bulk') {
        // Pehle sab disconnect karo
        for (const sid of selectedSessions) {
          const s = sessions.find(x => x.id === sid);
          if (s && s.status === 'connected') {
            await apiFetch(`/api/whatsapp/sessions/${sid}/disconnect`, { method: 'POST' }).catch(() => {});
          }
        }
        await apiFetch('/api/whatsapp/sessions/bulk-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: selectedSessions }),
        });
        setSessions(prev => prev.filter(s => !selectedSessions.includes(s.id)));
        selectedSessions.forEach(sid => {
          setQrCodes(prev => { const n = { ...prev }; delete n[sid]; return n; });
          window.dispatchEvent(new CustomEvent('whatsapp_disconnected', { detail: { sessionId: sid } }));
        });
        setSelectedSessions([]);
        setIsSelectionMode(false);
      } else {
        const sid = deleteConfirm.id as number;
        const s = sessions.find(x => x.id === sid);
        // Pehle disconnect karo
        if (s && s.status === 'connected') {
          await apiFetch(`/api/whatsapp/sessions/${sid}/disconnect`, { method: 'POST' }).catch(() => {});
        }
        await apiFetch(`/api/whatsapp/sessions/${sid}`, { method: 'DELETE' });
        setSessions(prev => prev.filter(s => s.id !== sid));
        setQrCodes(prev => { const n = { ...prev }; delete n[sid]; return n; });
        window.dispatchEvent(new CustomEvent('whatsapp_disconnected', { detail: { sessionId: sid } }));
      }
      setDeleteConfirm(null);
    } catch (err) {
      setError('Failed to delete. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleSessionSelection = (id: number) => {
    setSelectedSessions(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  };

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  const whatsappSessions = sessions.filter(s => !s.platform || s.platform === 'whatsapp');

  const getStatusColor = (status: string) => {
    if (status === 'connected') return 'bg-emerald-500 text-white';
    if (status === 'connecting') return 'bg-orange-400 text-white';
    return 'bg-gray-100 text-gray-400';
  };

  const getStatusLabel = (status: string) => {
    if (status === 'connected') return 'Online';
    if (status === 'connecting') return 'Connecting...';
    return 'Offline';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Channels</h2>
          <p className="text-gray-500 text-sm">Manage your communication channels</p>
        </div>
        <div className="flex bg-white p-1 rounded-2xl border border-gray-100 shadow-sm">
          {[
            { id: 'whatsapp', label: 'WhatsApp', icon: Smartphone, activeClass: 'bg-primary text-white shadow-lg shadow-primary/20' },
            { id: 'facebook', label: 'Facebook', icon: Facebook, activeClass: 'bg-[#1877F2] text-white shadow-lg shadow-blue-500/20' },
            { id: 'instagram', label: 'Instagram', icon: Instagram, activeClass: 'bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white' },
          ].map(p => (
            <button key={p.id} onClick={() => setActivePlatform(p.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activePlatform === p.id ? p.activeClass : 'text-gray-400 hover:text-gray-600'}`}>
              <p.icon className="w-4 h-4" /> {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 text-sm font-bold">
          <AlertCircle className="w-5 h-5" /> {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {activePlatform === 'whatsapp' ? (
        <>
          {/* Action Bar */}
          <div className="flex justify-end items-center gap-3">
            <AnimatePresence>
              {isSelectionMode && selectedSessions.length > 0 && (
                <motion.button initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                  onClick={() => setDeleteConfirm({ id: 'bulk', count: selectedSessions.length })}
                  className="bg-red-500 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg shadow-red-500/20">
                  <Trash2 className="w-4 h-4" /> Delete ({selectedSessions.length})
                </motion.button>
              )}
            </AnimatePresence>
            <button
              onClick={() => { setIsSelectionMode(!isSelectionMode); if (isSelectionMode) setSelectedSessions([]); }}
              disabled={whatsappSessions.length < 2}
              className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${
                whatsappSessions.length < 2
                  ? 'bg-gray-50 text-gray-300 cursor-not-allowed border border-gray-100'
                  : isSelectionMode
                    ? 'bg-gray-100 text-gray-600'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}>
              {isSelectionMode ? 'Cancel' : 'Bulk Delete'}
            </button>
            <button onClick={() => setIsAdding(true)}
              className="bg-primary text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg shadow-primary/20">
              <Plus className="w-4 h-4" /> Add Number
            </button>
          </div>

          {/* Inline Add Form */}
          <AnimatePresence>
            {isAdding && (
              <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                className="bg-white border border-primary/20 p-6 rounded-3xl shadow-xl shadow-primary/5">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="font-bold text-lg flex items-center gap-2">
                    <Smartphone className="w-5 h-5 text-primary" /> Add WhatsApp Number
                  </h3>
                  <button onClick={() => { setIsAdding(false); setSessionName(''); setSelectedAgent(''); setValidationErrors({}); }}>
                    <XCircle className="w-5 h-5 text-gray-400 hover:text-gray-600" />
                  </button>
                </div>
                <div className="flex items-end gap-4">
                  <div className="flex-1 space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                      WhatsApp Name <span className="text-red-500">*Required</span>
                    </label>
                    <input type="text" placeholder="e.g. Sales Support"
                      className={`w-full bg-gray-50 border ${validationErrors.sessionName ? 'border-red-500' : 'border-gray-200'} rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-primary/20`}
                      value={sessionName}
                      onChange={(e) => { setSessionName(e.target.value); setValidationErrors(p => { const n = { ...p }; delete n.sessionName; return n; }); }}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddSession()}
                    />
                    {validationErrors.sessionName && <p className="text-[10px] text-red-500 font-bold">{validationErrors.sessionName}</p>}
                  </div>
                  <div className="flex-1 space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                      Assign Agent <span className="text-red-500">*Required</span>
                    </label>
                    <select className={`w-full bg-gray-50 border ${validationErrors.selectedAgent ? 'border-red-500' : 'border-gray-200'} rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-primary/20`}
                      value={selectedAgent}
                      onChange={(e) => { setSelectedAgent(e.target.value); setValidationErrors(p => { const n = { ...p }; delete n.selectedAgent; return n; }); }}>
                      <option value="">Select an Agent</option>
                      {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                    {validationErrors.selectedAgent && <p className="text-[10px] text-red-500 font-bold">{validationErrors.selectedAgent}</p>}
                  </div>
                  <button onClick={handleAddSession} disabled={isCreating}
                    className="bg-primary text-white px-6 py-3 rounded-xl text-sm font-bold shadow-lg shadow-primary/20 h-[46px] flex items-center gap-2 disabled:opacity-50">
                    {isCreating ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</> : 'Create Session'}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Select All Bar */}
          <AnimatePresence>
            {isSelectionMode && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="flex items-center gap-2">
                <label className="flex items-center gap-2 cursor-pointer bg-white border border-gray-100 px-4 py-2 rounded-xl shadow-sm">
                  <input type="checkbox"
                    checked={selectedSessions.length === whatsappSessions.length && whatsappSessions.length > 0}
                    onChange={() => setSelectedSessions(selectedSessions.length === whatsappSessions.length ? [] : whatsappSessions.map(s => s.id))}
                    className="w-4 h-4 rounded border-gray-300 text-primary"
                  />
                  <span className="text-xs font-bold text-gray-500">Select All</span>
                </label>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Session Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {whatsappSessions.map((session) => {
              const sync = syncStates[session.id];
              const qr = qrCodes[session.id];
              return (
                <motion.div key={session.id} layout
                  className={`bg-white border p-6 rounded-3xl shadow-sm hover:shadow-md transition-all relative ${selectedSessions.includes(session.id) ? 'border-primary ring-1 ring-primary/20' : 'border-gray-100'}`}>

                  <AnimatePresence>
                    {isSelectionMode && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="absolute top-4 left-4 z-10">
                        <input type="checkbox" checked={selectedSessions.includes(session.id)}
                          onChange={() => toggleSessionSelection(session.id)}
                          className="w-5 h-5 rounded-lg border-gray-300 text-primary cursor-pointer" />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Card Header */}
                  <div className={`flex justify-between items-start mb-4 ${isSelectionMode ? 'pl-8' : ''}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
                        session.status === 'connected' ? 'bg-emerald-100 text-emerald-600' :
                        session.status === 'connecting' ? 'bg-orange-100 text-orange-500' :
                        'bg-slate-100 text-slate-400'
                      }`}>
                        {session.status === 'connecting'
                          ? <Loader2 className="w-6 h-6 animate-spin" />
                          : <Smartphone className={`w-6 h-6 ${session.status === 'connected' ? 'animate-pulse' : ''}`} />
                        }
                      </div>
                      <div>
                        <h3 className="font-black text-slate-900 tracking-tight text-sm">{session.name || 'WhatsApp'}</h3>
                        <p className="text-xs font-bold text-slate-500 mt-0.5">
                          {session.profile_name || (session.number ? `+${session.number}` : (session.status === 'connecting' ? 'Connecting...' : 'Not connected'))}
                        </p>
                        {session.profile_name && session.number && (
                          <p className="text-[10px] text-slate-400 font-bold">+{session.number}</p>
                        )}
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
                          Agent: {session.agent_name}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${getStatusColor(session.status)}`}>
                        {getStatusLabel(session.status)}
                      </span>
                      <button onClick={() => setDeleteConfirm({ id: session.id })}
                        className="p-1.5 bg-red-50 text-red-400 rounded-lg hover:bg-red-100 hover:text-red-600 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Sync Progress on card */}
                  <AnimatePresence>
                    {sync && sync.status === 'syncing' && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                        className="mb-4 p-3 bg-primary/5 rounded-2xl border border-primary/10 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Loader2 className="w-3 h-3 animate-spin text-primary" />
                            <span className="text-[10px] font-black text-primary uppercase tracking-widest truncate max-w-[160px]">
                              {sync.message || 'Syncing...'}
                            </span>
                          </div>
                          <span className="text-[10px] font-black text-primary">{sync.progress}%</span>
                        </div>
                        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <motion.div className="h-full bg-primary rounded-full"
                            initial={{ width: 0 }} animate={{ width: `${sync.progress}%` }}
                            transition={{ duration: 0.5 }} />
                        </div>
                      </motion.div>
                    )}
                    {sync && sync.status === 'completed' && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="mb-4 p-3 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Inbox Ready!</span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* QR or Status */}
                  {qr ? (
                    <div className="space-y-3">
                      <div className="bg-primary/5 p-4 rounded-2xl flex flex-col items-center border-2 border-dashed border-primary/20">
                        <img src={qr} alt="QR Code" className="w-44 h-44" />
                        <p className="text-[10px] font-black text-primary uppercase tracking-widest mt-3">Scan with WhatsApp</p>
                        <p className="text-[9px] text-gray-400 mt-1">WhatsApp → Settings → Linked Devices</p>
                      </div>
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                        <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest">Waiting for scan...</span>
                      </div>
                    </div>
                  ) : session.status === 'connecting' ? (
                    <div className="flex flex-col items-center justify-center py-8 space-y-3">
                      <Loader2 className="w-10 h-10 animate-spin text-primary" />
                      <p className="text-xs font-black text-gray-400 uppercase tracking-widest animate-pulse">Generating QR Code...</p>
                      <div className="flex flex-col gap-2 w-full px-4">
                        <button 
                          onClick={() => handleConnect(session.id, true)}
                          className="w-full py-2 bg-primary/10 text-primary rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary/20 transition-all"
                        >
                          Reset & Reconnect
                        </button>
                        <button 
                          onClick={() => handleDisconnect(session.id)}
                          className="w-full py-2 bg-red-50 text-red-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-100 transition-all"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : session.status === 'disconnected' ? (
                    <button onClick={() => handleConnect(session.id)}
                      className="w-full py-3 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-primary transition-all">
                      <Wifi className="w-4 h-4" /> Connect WhatsApp
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <div className="bg-emerald-50 p-6 rounded-2xl flex flex-col items-center border border-emerald-100 text-emerald-600">
                        <CheckCircle2 className="w-10 h-10 mb-2" />
                        <p className="text-xs font-black uppercase tracking-widest">System Online</p>
                      </div>
                      <button onClick={() => handleDisconnect(session.id)}
                        className="w-full py-2.5 bg-red-50 text-red-500 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-red-100 transition-all">
                        <WifiOff className="w-3.5 h-3.5" /> Disconnect
                      </button>
                    </div>
                  )}
                </motion.div>
              );
            })}

            {whatsappSessions.length === 0 && !isAdding && (
              <div className="col-span-3 py-16 text-center">
                <Smartphone className="w-14 h-14 text-gray-100 mx-auto mb-4" />
                <p className="text-gray-400 text-sm font-bold uppercase tracking-widest">No Channels Active</p>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="space-y-6">
          <div className="flex justify-end">
            <button onClick={() => setIsConnectingSocial(true)}
              className={`px-6 py-3 rounded-2xl text-sm font-black uppercase tracking-widest text-white shadow-lg transition-all flex items-center gap-2 ${activePlatform === 'facebook' ? 'bg-[#1877F2] shadow-blue-500/20' : 'bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF] shadow-pink-500/20'}`}>
              <Plus className="w-4 h-4" /> Connect {activePlatform === 'facebook' ? 'Facebook' : 'Instagram'}
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {socialAccounts.filter(a => a.platform === activePlatform).map((account) => (
              <div key={account.id} className="bg-white border border-gray-100 p-6 rounded-3xl shadow-sm">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <img src={account.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(account.name)}`} alt={account.name} className="w-12 h-12 rounded-2xl" />
                    <div>
                      <h3 className="font-bold text-gray-900 text-sm">{account.name}</h3>
                      <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Connected</p>
                    </div>
                  </div>
                  <button onClick={async () => { if (confirm('Disconnect?')) { await apiFetch(`/api/social/accounts/${account.id}`, { method: 'DELETE' }); fetchData(); } }}
                    className="p-1.5 bg-red-50 text-red-400 rounded-lg hover:bg-red-100">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex gap-2">
                  <button className="flex-1 py-2.5 bg-gray-50 text-gray-600 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-2"><ExternalLink className="w-3.5 h-3.5" /> View</button>
                  <button className="flex-1 py-2.5 bg-white border border-gray-200 text-gray-600 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-2"><Settings className="w-3.5 h-3.5" /> Config</button>
                </div>
              </div>
            ))}
            {socialAccounts.filter(a => a.platform === activePlatform).length === 0 && (
              <div className="col-span-3 bg-white border border-dashed border-gray-200 rounded-3xl p-16 text-center">
                {activePlatform === 'facebook' ? <Facebook className="w-14 h-14 text-gray-200 mx-auto mb-4" /> : <Instagram className="w-14 h-14 text-gray-200 mx-auto mb-4" />}
                <h3 className="text-lg font-black text-gray-900 mb-2">No {activePlatform === 'facebook' ? 'Facebook' : 'Instagram'} Connected</h3>
                <button onClick={() => setIsConnectingSocial(true)}
                  className={`mt-4 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest text-white inline-flex items-center gap-2 ${activePlatform === 'facebook' ? 'bg-[#1877F2]' : 'bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF]'}`}>
                  <Plus className="w-4 h-4" /> Connect Now
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Web.WhatsApp style Sync Popup */}
      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirm && createPortal(
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-gray-100">
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-center text-gray-900 mb-2">Confirm Deletion</h3>
              <p className="text-gray-500 text-center mb-8 text-sm">
                Are you sure you want to delete {deleteConfirm.id === 'bulk' ? `${deleteConfirm.count} sessions` : 'this session'}?
                This cannot be undone.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteConfirm(null)} disabled={isDeleting}
                  className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-all disabled:opacity-50">
                  Cancel
                </button>
                <button onClick={confirmDelete} disabled={isDeleting}
                  className="flex-1 py-3 bg-red-500 text-white rounded-xl font-bold shadow-lg shadow-red-500/20 hover:bg-red-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                  {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete'}
                </button>
              </div>
            </motion.div>
          </div>,
          document.body
        )}
      </AnimatePresence>

      {/* Social Connect Modal */}
      <AnimatePresence>
        {isConnectingSocial && createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[32px] p-8 max-w-md w-full shadow-2xl border border-gray-100">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Connect Account</h2>
                <button onClick={() => setIsConnectingSocial(false)} className="p-2 hover:bg-gray-100 rounded-xl">
                  <XCircle className="w-6 h-6 text-gray-400" />
                </button>
              </div>
              <div className="space-y-4">
                <button onClick={async () => {
                  const mock = { platform: 'facebook', account_id: 'fb_' + Date.now(), name: 'Facebook Page', access_token: 'mock', avatar: 'https://ui-avatars.com/api/?name=FB&background=1877F2&color=fff' };
                  await apiFetch('/api/social/login', { method: 'POST', body: JSON.stringify(mock), headers: { 'Content-Type': 'application/json' } });
                  fetchData(); setIsConnectingSocial(false);
                }} className="w-full flex items-center gap-4 p-4 rounded-2xl bg-[#1877F2] text-white hover:opacity-90 transition-all shadow-lg shadow-blue-500/20">
                  <div className="p-2 bg-white/20 rounded-xl"><Facebook className="w-6 h-6" /></div>
                  <div className="text-left"><p className="font-bold">Login with Facebook</p><p className="text-xs opacity-80">Connect pages & Instagram</p></div>
                </button>
              </div>
            </motion.div>
          </div>,
          document.body
        )}
      </AnimatePresence>
    </div>
  );
}