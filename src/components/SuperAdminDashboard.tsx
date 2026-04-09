import React, { useState, useEffect } from 'react';
import { Users, UserPlus, Trash2, ShieldCheck, ShieldAlert, Loader2, Search, Key, History, Zap, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { apiFetch } from '../lib/api';

export default function SuperAdminDashboard() {
  const [admins, setAdmins] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditingTokens, setIsEditingTokens] = useState<any>(null);
  const [isDeletingAdmin, setIsDeletingAdmin] = useState<any>(null);
  const [showAuditLogs, setShowAuditLogs] = useState(false);
  const [logFilter, setLogFilter] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [newAdmin, setNewAdmin] = useState({ username: '', password: '', token_limit: 0 });
  const [tokenLimitInput, setTokenLimitInput] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');

  const fetchAdmins = async () => {
    try {
      const [adminsData, statsData] = await Promise.all([
        apiFetch('/api/super-admin/admins'),
        apiFetch('/api/super-admin/stats')
      ]);
      setAdmins(adminsData);
      setStats(statsData);
    } catch (err) {
      console.error('Failed to fetch admins:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const data = await apiFetch('/api/super-admin/audit-logs');
      setAuditLogs(data);
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    }
  };

  useEffect(() => {
    fetchAdmins();
  }, []);

  useEffect(() => {
    if (showAuditLogs) {
      fetchAuditLogs();
    }
  }, [showAuditLogs]);

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await apiFetch('/api/super-admin/admins', {
        method: 'POST',
        body: JSON.stringify(newAdmin)
      });
      setNewAdmin({ username: '', password: '', token_limit: 0 });
      setIsCreating(false);
      fetchAdmins();
    } catch (err: any) {
      setError(err.message || 'Failed to create admin');
    }
  };

  const handleUpdateTokens = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEditingTokens) return;
    try {
      await apiFetch(`/api/super-admin/admins/${isEditingTokens.id}`, {
        method: 'PUT',
        body: JSON.stringify({ token_limit: tokenLimitInput })
      });
      setIsEditingTokens(null);
      fetchAdmins();
    } catch (err) {
      console.error('Failed to update tokens:', err);
    }
  };

  const handleToggleStatus = async (id: number, currentStatus: boolean) => {
    try {
      await apiFetch(`/api/super-admin/admins/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_active: !currentStatus })
      });
      fetchAdmins();
    } catch (err) {
      console.error('Failed to update admin status:', err);
    }
  };

  const handleDeleteAdmin = async (id: number) => {
    try {
      await apiFetch(`/api/super-admin/admins/${id}`, {
        method: 'DELETE'
      });
      setIsDeletingAdmin(null);
      fetchAdmins();
    } catch (err) {
      console.error('Failed to delete admin:', err);
    }
  };

  const filteredAdmins = admins.filter(admin => 
    admin.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-gray-900 tracking-tighter uppercase">Admin Management</h2>
          <p className="text-sm text-gray-500 font-medium">Manage and monitor system administrators</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowAuditLogs(true)}
            className="flex items-center justify-center gap-2 bg-white border border-gray-100 text-gray-600 px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gray-50 transition-all shadow-sm"
          >
            <History className="w-4 h-4" />
            Audit Logs
          </button>
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center justify-center gap-2 bg-gray-900 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gray-800 transition-all shadow-xl shadow-gray-900/10"
          >
            <UserPlus className="w-4 h-4" />
            Add New Admin
          </button>
        </div>
      </div>

      {/* Stats Section */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6 rounded-[2rem] border border-gray-100 shadow-sm"
        >
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-indigo-500" />
            </div>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Admins</p>
              <h3 className="text-2xl font-black text-gray-900">{stats?.totalAdmins || 0}</h3>
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-6 rounded-[2rem] border border-gray-100 shadow-sm"
        >
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-green-50 rounded-2xl flex items-center justify-center">
              <Users className="w-6 h-6 text-green-500" />
            </div>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Active Users</p>
              <h3 className="text-2xl font-black text-gray-900">{stats?.activeAdmins || 0}</h3>
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card p-6 rounded-[2rem] border border-gray-100 shadow-sm"
        >
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-orange-50 rounded-2xl flex items-center justify-center">
              <Zap className="w-6 h-6 text-orange-500" />
            </div>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Tokens Used</p>
              <h3 className="text-2xl font-black text-gray-900">{stats?.totalTokensUsed || 0}</h3>
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-card p-6 rounded-[2rem] border border-gray-100 shadow-sm"
        >
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center">
              <UserPlus className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Leads</p>
              <h3 className="text-2xl font-black text-gray-900">{stats?.totalLeads || 0}</h3>
            </div>
          </div>
        </motion.div>
      </div>

      <div className="glass-card rounded-[2.5rem] p-8 border border-gray-100 shadow-sm overflow-hidden relative">
        <div className="flex items-center gap-4 mb-8">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search admins by username..."
              className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-3.5 pl-12 pr-4 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-sm font-black text-gray-400 uppercase tracking-widest">Loading Administrators...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-50">
                  <th className="text-left py-4 px-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Administrator</th>
                  <th className="text-left py-4 px-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                  <th className="text-left py-4 px-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Tokens</th>
                  <th className="text-left py-4 px-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Created At</th>
                  <th className="text-right py-4 px-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredAdmins.map((admin) => (
                  <tr key={admin.id} className="group hover:bg-gray-50/50 transition-colors">
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${admin.is_active ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-100 text-gray-400'}`}>
                          <Users className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-sm font-black text-gray-900">{admin.username}</p>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">System Admin</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                        admin.is_active 
                          ? 'bg-green-50 text-green-600' 
                          : 'bg-red-50 text-red-600'
                      }`}>
                        {admin.is_active ? (
                          <><ShieldCheck className="w-3 h-3" /> Active</>
                        ) : (
                          <><ShieldAlert className="w-3 h-3" /> Inactive</>
                        )}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <Zap className="w-3 h-3 text-orange-500" />
                          <span className="text-xs font-black text-gray-900">{admin.tokens || 0} / {admin.token_limit || 0}</span>
                        </div>
                        <div className="w-24 h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                          <div 
                            className={`h-full transition-all ${
                              (admin.tokens || 0) >= (admin.token_limit || 0) ? 'bg-red-500' : 'bg-orange-500'
                            }`}
                            style={{ width: `${Math.min(((admin.tokens || 0) / (admin.token_limit || 1)) * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <p className="text-xs font-medium text-gray-500">
                        {new Date(admin.created_at).toLocaleDateString()}
                      </p>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setLogFilter(admin.username);
                            setShowAuditLogs(true);
                          }}
                          className="p-2 text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 rounded-xl transition-all"
                          title="View History"
                        >
                          <History className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setIsEditingTokens(admin);
                            setTokenLimitInput(admin.token_limit || 0);
                          }}
                          className="p-2 text-gray-300 hover:text-primary hover:bg-primary/5 rounded-xl transition-all"
                          title="Manage Tokens"
                        >
                          <Zap className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleToggleStatus(admin.id, !!admin.is_active)}
                          className={`p-2 rounded-xl transition-all ${
                            admin.is_active 
                              ? 'text-orange-500 hover:bg-orange-50' 
                              : 'text-green-500 hover:bg-green-50'
                          }`}
                          title={admin.is_active ? 'Deactivate' : 'Activate'}
                        >
                          <Key className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setIsDeletingAdmin(admin)}
                          className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                          title="Delete Admin"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredAdmins.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-20 text-center">
                      <p className="text-sm font-black text-gray-400 uppercase tracking-widest">No administrators found</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Admin Modal */}
      <AnimatePresence>
        {isCreating && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCreating(false)}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl p-8 border border-gray-100"
            >
              <h3 className="text-xl font-black text-gray-900 uppercase tracking-tighter mb-6">Create New Admin</h3>
              <form onSubmit={handleCreateAdmin} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Username / Email</label>
                  <input
                    type="email"
                    required
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                    placeholder="admin@example.com"
                    value={newAdmin.username}
                    onChange={(e) => setNewAdmin({ ...newAdmin, username: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Password</label>
                  <input
                    type="password"
                    required
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                    placeholder="••••••••"
                    value={newAdmin.password}
                    onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Token Limit</label>
                  <input
                    type="number"
                    required
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                    placeholder="1000"
                    value={newAdmin.token_limit}
                    onChange={(e) => setNewAdmin({ ...newAdmin, token_limit: parseInt(e.target.value) })}
                  />
                </div>
                {error && <p className="text-xs text-red-500 font-bold text-center">{error}</p>}
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsCreating(false)}
                    className="flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest text-gray-400 hover:bg-gray-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-4 bg-gray-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gray-800 transition-all shadow-xl shadow-gray-900/10"
                  >
                    Create Admin
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {isDeletingAdmin && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDeletingAdmin(null)}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl p-8 border border-gray-100"
            >
              <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mb-6">
                <Trash2 className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-xl font-black text-gray-900 uppercase tracking-tighter mb-2">Delete Administrator?</h3>
              <p className="text-sm text-gray-500 mb-8 font-medium">
                Are you sure you want to delete <span className="text-gray-900 font-bold">{isDeletingAdmin.username}</span>? 
                This action is permanent and will remove all associated data.
              </p>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setIsDeletingAdmin(null)}
                  className="flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest text-gray-400 hover:bg-gray-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteAdmin(isDeletingAdmin.id)}
                  className="flex-1 py-4 bg-red-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-red-600 transition-all shadow-xl shadow-red-500/10"
                >
                  Delete Admin
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Token Management Modal */}
      <AnimatePresence>
        {isEditingTokens && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditingTokens(null)}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl p-8 border border-gray-100"
            >
              <h3 className="text-xl font-black text-gray-900 uppercase tracking-tighter mb-2">Manage Tokens</h3>
              <p className="text-sm text-gray-500 mb-6 font-medium">Set message token limit for <span className="text-gray-900 font-bold">{isEditingTokens.username}</span></p>
              
              <form onSubmit={handleUpdateTokens} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Token Limit</label>
                  <input
                    type="number"
                    required
                    min="0"
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                    value={tokenLimitInput}
                    onChange={(e) => setTokenLimitInput(parseInt(e.target.value))}
                  />
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-2">
                    Current Usage: {isEditingTokens.tokens || 0} tokens consumed
                  </p>
                </div>
                
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsEditingTokens(null)}
                    className="flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest text-gray-400 hover:bg-gray-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-4 bg-gray-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gray-800 transition-all shadow-xl shadow-gray-900/10"
                  >
                    Update Limit
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Audit Logs Modal */}
      <AnimatePresence>
        {showAuditLogs && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAuditLogs(false)}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl p-8 border border-gray-100 flex flex-col max-h-[80vh]"
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-xl font-black text-gray-900 uppercase tracking-tighter">System Audit Logs</h3>
                  {logFilter && (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg uppercase tracking-widest">
                        Filtering: {logFilter}
                      </span>
                      <button 
                        onClick={() => setLogFilter(null)}
                        className="text-[10px] font-black text-gray-400 hover:text-gray-600 uppercase tracking-widest underline"
                      >
                        Clear Filter
                      </button>
                    </div>
                  )}
                </div>
                <button 
                  onClick={() => {
                    setShowAuditLogs(false);
                    setLogFilter(null);
                  }} 
                  className="p-2 hover:bg-gray-50 rounded-xl transition-all"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                {auditLogs
                  .filter(log => !logFilter || log.username === logFilter)
                  .map((log) => (
                  <div key={log.id} className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-black text-primary uppercase tracking-widest">{log.action.replace('_', ' ')}</span>
                      <span className="text-[10px] font-bold text-gray-400">{new Date(log.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-sm font-bold text-gray-900 mb-1">{log.username}</p>
                    <p className="text-xs text-gray-500 font-medium">{log.details}</p>
                  </div>
                ))}
                {auditLogs.length === 0 && (
                  <div className="text-center py-12">
                    <History className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                    <p className="text-sm font-black text-gray-300 uppercase tracking-widest">No logs found</p>
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
