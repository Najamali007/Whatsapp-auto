import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Save, Key, Trash2, AlertCircle, CheckCircle2, Loader2, RefreshCw, Coins, X, Globe, Plus, ExternalLink } from 'lucide-react';
import { apiFetch } from '../lib/api';

interface ApiSetting {
  id: number;
  provider: string;
  api_key: string;
  status: string;
  is_active: number;
  credits_remaining: number;
}

interface UserWebsite {
  id: number;
  url: string;
  status: 'added' | 'audited';
  created_at: string;
}

const PROVIDERS = [
  { id: 'deepseek', name: 'DeepSeek' },
  { id: 'gemini', name: 'Google Gemini' }
];

export default function Settings() {
  const [settings, setSettings] = useState<ApiSetting[]>([]);
  const [websites, setWebsites] = useState<UserWebsite[]>([]);
  const [newWebsite, setNewWebsite] = useState('');
  const [loading, setLoading] = useState(true);
  const [addingWebsite, setAddingWebsite] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [newKeys, setNewKeys] = useState<Record<string, string>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [resetInput, setResetInput] = useState('');
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    fetchSettings();
    fetchWebsites();
  }, []);

  const fetchSettings = async () => {
    try {
      const data = await apiFetch('/api/settings');
      setSettings(data);
      const keys: Record<string, string> = {};
      data.forEach((s: ApiSetting) => {
        keys[s.provider] = s.api_key;
      });
      setNewKeys(keys);
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchWebsites = async () => {
    try {
      const data = await apiFetch('/api/user-websites');
      setWebsites(data);
    } catch (error) {
      console.error('Failed to fetch websites:', error);
    }
  };

  const handleAddWebsite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWebsite) return;
    setAddingWebsite(true);
    try {
      const data = await apiFetch('/api/user-websites', {
        method: 'POST',
        body: JSON.stringify({ url: newWebsite })
      });
      setWebsites([data, ...websites]);
      setNewWebsite('');
      setMessage({ type: 'success', text: 'Website added successfully' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to add website' });
    } finally {
      setAddingWebsite(false);
    }
  };

  const handleDeleteWebsite = async (id: number) => {
    try {
      await apiFetch(`/api/user-websites/${id}`, { method: 'DELETE' });
      setWebsites(websites.filter(w => w.id !== id));
    } catch (error) {
      console.error('Failed to delete website:', error);
    }
  };

  const handleAuditWebsite = async (id: number) => {
    try {
      const data = await apiFetch(`/api/user-websites/${id}/audit`, { method: 'POST' });
      setWebsites(websites.map(w => w.id === id ? { ...w, status: data.status } : w));
    } catch (error) {
      console.error('Failed to audit website:', error);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const data = await apiFetch('/api/settings/refresh', { method: 'POST' });
      setSettings(data);
      setMessage({ type: 'success', text: 'All API statuses and credits updated!' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to refresh API statuses.' });
    } finally {
      setRefreshing(false);
    }
  };

  const handleSave = async (provider: string) => {
    const apiKey = newKeys[provider];
    if (!apiKey) return;

    setSaving(provider);
    setMessage(null);

    try {
      const response = await apiFetch('/api/settings', {
        method: 'POST',
        body: JSON.stringify({ provider, api_key: apiKey })
      });
      setMessage({ 
        type: 'success', 
        text: `API connected successfully! Initial credits: $${response.credits?.toFixed(2) || '0.00'}` 
      });
      fetchSettings();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || `Failed to save ${provider} API key.` });
    } finally {
      setSaving(null);
    }
  };

  const handleDelete = async (provider: string) => {
    try {
      await apiFetch(`/api/settings/${provider}`, { method: 'DELETE' });
      setMessage({ type: 'success', text: `${provider} API key removed.` });
      fetchSettings();
      const updatedKeys = { ...newKeys };
      delete updatedKeys[provider];
      setNewKeys(updatedKeys);
    } catch (error) {
      setMessage({ type: 'error', text: `Failed to remove ${provider} API key.` });
    } finally {
      setDeleteConfirm(null);
    }
  };

  const handleResetDatabase = async () => {
    if (resetInput !== 'reset') return;
    setResetting(true);
    try {
      await apiFetch('/api/system/reset-database', {
        method: 'POST',
        body: JSON.stringify({ confirmation: resetInput })
      });
      // Logout user
      localStorage.removeItem('token');
      window.location.href = '/login';
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to reset database.' });
      setResetConfirm(false);
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Settings</h1>
          <p className="text-gray-500 dark:text-gray-400">Configure your API keys and system preferences.</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-white/10 rounded-xl text-sm font-bold text-gray-700 dark:text-white hover:bg-gray-50 transition-all shadow-sm disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh All
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section className="glass-card p-6 rounded-2xl border border-white/20 dark:border-white/10">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Key className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">AI Configuration</h2>
                <p className="text-sm text-gray-500">Configure your AI providers. The system will automatically use Gemini as a fallback if DeepSeek fails.</p>
              </div>
            </div>

            {message && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`mb-6 p-4 rounded-xl flex items-center gap-3 ${
                  message.type === 'success' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                }`}
              >
                {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                <span className="text-sm font-medium">{message.text}</span>
              </motion.div>
            )}

            <div className="grid gap-6">
              {PROVIDERS.map((provider) => {
                const setting = settings.find(s => s.provider === provider.id);
                const isSaving = saving === provider.id;

                return (
                  <div key={provider.id} className="flex flex-col gap-3 p-4 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/10">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                          {provider.name}
                        </label>
                        {setting && (
                          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-blue-500/10 text-blue-500 rounded-full">
                            <Coins className="w-3 h-3" />
                            <span className="text-[10px] font-bold">${setting.credits_remaining.toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                      {setting && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                          setting.status === 'active' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                        }`}>
                          {setting.status}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={newKeys[provider.id] || ''}
                        onChange={(e) => setNewKeys({ ...newKeys, [provider.id]: e.target.value })}
                        placeholder={`Enter ${provider.name} API Key`}
                        className="flex-1 px-4 py-2 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/10 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                      />
                      <button
                        onClick={() => handleSave(provider.id)}
                        disabled={isSaving || !newKeys[provider.id]}
                        className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
                      >
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save
                      </button>
                      {setting && (
                        <button
                          onClick={() => setDeleteConfirm(provider.id)}
                          className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="glass-card p-6 rounded-2xl border border-white/20 dark:border-white/10">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">System Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/10">
                <p className="text-xs text-gray-500 mb-1">AI Provider</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">DeepSeek + Gemini Fallback</p>
              </div>
              <div className="p-4 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/10">
                <p className="text-xs text-gray-500 mb-1">Default Model</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">DeepSeek Chat / Gemini Flash</p>
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="glass-card p-6 rounded-2xl border border-white/20 dark:border-white/10 h-fit">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Globe className="w-5 h-5 text-purple-500" />
              Website Audit Tracker
            </h2>

            <form onSubmit={handleAddWebsite} className="mb-6">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newWebsite}
                  onChange={(e) => setNewWebsite(e.target.value)}
                  placeholder="Enter website URL"
                  className="flex-1 px-4 py-2 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/10 focus:ring-2 focus:ring-purple-500 outline-none text-sm"
                />
                <button
                  type="submit"
                  disabled={addingWebsite || !newWebsite}
                  className="p-2 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white rounded-lg transition-colors"
                >
                  {addingWebsite ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                </button>
              </div>
            </form>

            <div className="space-y-3">
              {websites.length === 0 ? (
                <div className="text-center py-8">
                  <Globe className="w-8 h-8 text-gray-300 dark:text-gray-700 mx-auto mb-2 opacity-50" />
                  <p className="text-sm text-gray-500">No websites added yet</p>
                </div>
              ) : (
                websites.map((site) => (
                  <div key={site.id} className="group p-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/10 transition-all hover:border-purple-500/30">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <span className={`flex-shrink-0 w-2 h-2 rounded-full ${site.status === 'audited' ? 'bg-blue-500' : 'bg-purple-500'}`} />
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{site.url}</p>
                      </div>
                      <button
                        onClick={() => handleDeleteWebsite(site.id)}
                        className="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                        site.status === 'audited' 
                          ? 'bg-blue-500/10 text-blue-500' 
                          : 'bg-purple-500/10 text-purple-500'
                      }`}>
                        {site.status}
                      </span>
                      {site.status === 'added' && (
                        <button
                          onClick={() => handleAuditWebsite(site.id)}
                          className="text-[10px] text-purple-500 hover:underline font-medium flex items-center gap-1"
                        >
                          Mark as Audited
                          <ExternalLink className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-6 pt-6 border-t border-gray-100 dark:border-white/10">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Color Key</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-purple-500" />
                  <span className="text-xs text-gray-600 dark:text-gray-400">
                    <span className="font-bold text-purple-500">Purple:</span> Website added, awaiting audit.
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-blue-500" />
                  <span className="text-xs text-gray-600 dark:text-gray-400">
                    <span className="font-bold text-blue-500">Blue:</span> Audit report received/completed.
                  </span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      <section className="mt-12 pt-12 border-t border-gray-100 dark:border-white/10">
        <div className="max-w-2xl">
          <h2 className="text-lg font-bold text-red-600 dark:text-red-500 mb-2 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            Danger Zone
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Resetting the database will permanently delete all leads, conversations, messages, agents, and settings. This action cannot be undone.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <div className="relative flex-1 w-full sm:max-w-xs">
              <input
                type="text"
                value={resetInput}
                onChange={(e) => setResetInput(e.target.value)}
                placeholder='Type "reset" to confirm'
                className="w-full px-4 py-2 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/10 focus:ring-2 focus:ring-red-500 outline-none text-sm font-medium"
              />
            </div>
            <button
              onClick={() => setResetConfirm(true)}
              disabled={resetInput !== 'reset'}
              className="px-6 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:hover:bg-red-600 text-white rounded-xl font-bold transition-all shadow-lg shadow-red-600/20 flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Reset Database
            </button>
          </div>
        </div>
      </section>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100 dark:border-white/10"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <AlertCircle className="w-6 h-6 text-red-500" />
                    Delete API Key
                  </h3>
                  <button 
                    onClick={() => setDeleteConfirm(null)}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-full transition-colors"
                  >
                    <X className="w-5 h-5 text-gray-400" />
                  </button>
                </div>
                
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  Are you sure you want to remove the <span className="font-bold text-gray-900 dark:text-white">{PROVIDERS.find(p => p.id === deleteConfirm)?.name}</span> API key? This action cannot be undone.
                </p>

                <div className="flex gap-3">
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    className="flex-1 px-4 py-2 bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-white rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-white/10 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleDelete(deleteConfirm)}
                    className="flex-1 px-4 py-2 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition-all shadow-lg shadow-red-500/20"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Reset Confirmation Modal */}
      <AnimatePresence>
        {resetConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-gray-800 rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden border border-gray-100 dark:border-white/10"
            >
              <div className="p-8">
                <div className="w-16 h-16 bg-red-100 dark:bg-red-500/10 rounded-full flex items-center justify-center mb-6 mx-auto">
                  <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-500" />
                </div>
                
                <h3 className="text-2xl font-black text-gray-900 dark:text-white text-center mb-4">
                  Are you absolutely sure?
                </h3>
                
                <p className="text-gray-600 dark:text-gray-400 text-center mb-8 leading-relaxed">
                  This will <span className="font-black text-red-600">ERASE EVERYTHING</span> in the system. All data will be permanently lost and you will be logged out.
                </p>

                <div className="flex flex-col gap-3">
                  <button
                    onClick={handleResetDatabase}
                    disabled={resetting}
                    className="w-full py-4 bg-red-600 text-white rounded-2xl font-black hover:bg-red-700 transition-all shadow-xl shadow-red-600/20 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {resetting ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <Trash2 className="w-5 h-5" />
                        YES, RESET EVERYTHING
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setResetConfirm(false)}
                    disabled={resetting}
                    className="w-full py-4 bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-white rounded-2xl font-black hover:bg-gray-200 dark:hover:bg-white/10 transition-all"
                  >
                    Cancel
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
