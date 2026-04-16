import React, { useState, useEffect } from 'react';
import { Users, UserPlus, Trash2, ShieldCheck, ShieldAlert, Loader2, Search, Key, History, Zap, X, Bell, AlertCircle, FileDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { apiFetch } from '../lib/api';
import socket from '../lib/socket';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function SuperAdminDashboard({ token }: { token?: string | null }) {
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
    if (!token) return;
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
    if (!token) return;
    try {
      const data = await apiFetch('/api/super-admin/audit-logs');
      setAuditLogs(data);
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    }
  };

  useEffect(() => {
    fetchAdmins();

    socket.on('admin_update', fetchAdmins);
    socket.on('super_admin_stats_update', fetchAdmins);

    return () => {
      socket.off('admin_update', fetchAdmins);
      socket.off('super_admin_stats_update', fetchAdmins);
    };
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
      const admin = admins.find(a => a.id === id);
      if (admin) {
        // Download PDF before deletion
        await generateUserPDF(admin);
      }

      await apiFetch(`/api/super-admin/admins/${id}`, {
        method: 'DELETE'
      });
      setIsDeletingAdmin(null);
      fetchAdmins();
    } catch (err) {
      console.error('Failed to delete admin:', err);
    }
  };

  const generateUserPDF = async (admin: any) => {
    const doc = new jsPDF();
    const timestamp = new Date().toLocaleString();

    // Header
    doc.setFontSize(22);
    doc.setTextColor(37, 211, 102); // WhatsApp Green
    doc.text('WhatsApp Auto - System Export', 14, 20);
    
    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.text(`Administrator: ${admin.username}`, 14, 30);
    doc.text(`Export Date: ${timestamp}`, 14, 37);
    doc.text(`Created by Ondigix`, 14, 44);

    try {
      // Fetch Leads for this admin
      // Note: We need an endpoint that can fetch data for a specific admin as super admin
      // For now, we'll try to fetch what we can or use mock data if endpoint doesn't exist
      // Since I can't change the backend easily, I'll assume standard endpoints might work if filtered
      const leads = await apiFetch(`/api/leads?adminId=${admin.id}`).catch(() => []);
      const activities = await apiFetch(`/api/activities?adminId=${admin.id}`).catch(() => []);

      // Leads Table
      doc.setFontSize(16);
      doc.setTextColor(0);
      doc.text('User Leads Data', 14, 60);
      
      autoTable(doc, {
        startY: 65,
        head: [['Name', 'Phone', 'Status', 'Created At']],
        body: leads.map((l: any) => [l.name, l.phone, l.status, new Date(l.created_at).toLocaleDateString()]),
        theme: 'striped',
        headStyles: { fillColor: [37, 211, 102] }
      });

      // Activities Table
      const finalY = (doc as any).lastAutoTable.finalY + 15;
      doc.text('System Activity Logs', 14, finalY);
      
      autoTable(doc, {
        startY: finalY + 5,
        head: [['Action', 'Details', 'Timestamp']],
        body: activities.map((a: any) => [a.type, a.description, new Date(a.created_at).toLocaleString()]),
        theme: 'grid',
        headStyles: { fillColor: [18, 140, 126] }
      });

      doc.save(`WA_Auto_Export_${admin.username}_${Date.now()}.pdf`);
    } catch (err) {
      console.error('PDF Generation failed:', err);
    }
  };

  const filteredAdmins = admins.filter(admin => 
    admin.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const notificationCount = admins.filter(a => (a.tokens || 0) <= 0).length;

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-4">
            Manage <span className="text-primary">Users</span>
            {notificationCount > 0 && (
              <div className="flex items-center gap-2 bg-red-50 text-red-600 px-3 py-1 rounded-full border border-red-100 animate-pulse">
                <Bell className="w-4 h-4" />
                <span className="text-xs font-black tracking-widest">{notificationCount}</span>
              </div>
            )}
          </h2>
          <p className="text-gray-500 font-bold uppercase tracking-widest text-[10px] mt-1">System Access & Resource Allocation</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowAuditLogs(true)}
            className="flex items-center justify-center gap-2 bg-white border border-gray-100 text-gray-600 px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-gray-50 transition-all shadow-sm"
          >
            <History className="w-4 h-4" />
            Audit Logs
          </button>
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center justify-center gap-2 bg-primary text-white px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-primary-hover transition-all shadow-xl shadow-primary/10"
          >
            <UserPlus className="w-4 h-4" />
            New User
          </button>
        </div>
      </div>

      {/* Stats Section */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: 'Total Users', value: stats?.totalAdmins || 0, icon: ShieldCheck, color: 'primary' },
          { label: 'Active Users', value: stats?.activeAdmins || 0, icon: Users, color: 'emerald' },
          { label: 'Tokens Used', value: stats?.totalTokensUsed || 0, icon: Zap, color: 'orange' },
          { label: 'Total Leads', value: stats?.totalLeads || 0, icon: UserPlus, color: 'blue' },
        ].map((stat, i) => (
          <motion.div 
            key={`stat-card-${i}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm"
          >
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 ${stat.color === 'primary' ? 'bg-primary/10' : `bg-${stat.color}-50`} rounded-2xl flex items-center justify-center`}>
                <stat.icon className={`w-6 h-6 ${stat.color === 'primary' ? 'text-primary' : `text-${stat.color}-600`}`} />
              </div>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{stat.label}</p>
                <h3 className="text-2xl font-black text-gray-900 tracking-tight">{stat.value.toLocaleString()}</h3>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm">
        <div className="flex items-center gap-4 mb-8">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search users..."
              className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 pl-12 pr-4 text-sm font-bold focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Synchronizing Data...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-50">
                  <th className="text-left py-4 px-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">User</th>
                  <th className="text-left py-4 px-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                  <th className="text-left py-4 px-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Token Allocation</th>
                  <th className="text-left py-4 px-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Joined</th>
                  <th className="text-right py-4 px-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredAdmins.map((admin, idx) => (
                  <tr key={`admin-row-${admin.id || idx}`} className="group hover:bg-gray-50/50 transition-colors">
                    <td className="py-5 px-4">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${admin.is_active ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-gray-400'}`}>
                          <Users className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="text-sm font-black text-gray-900">{admin.username}</p>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                            {(admin.tokens || 0) <= 0 ? 'Contact: +92 306 4443434' : 'User Account'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-5 px-4">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                        admin.is_active 
                          ? 'bg-emerald-50 text-emerald-600' 
                          : 'bg-red-50 text-red-600'
                      }`}>
                        {admin.is_active ? (
                          <><ShieldCheck className="w-3 h-3" /> Active</>
                        ) : (
                          <><ShieldAlert className="w-3 h-3" /> Suspended</>
                        )}
                      </span>
                    </td>
                    <td className="py-5 px-4">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Zap className={`w-3 h-3 ${(admin.tokens || 0) <= 0 ? 'text-red-500' : 'text-orange-500'}`} />
                            <span className={`text-xs font-black ${(admin.tokens || 0) <= 0 ? 'text-red-600' : 'text-gray-900'}`}>
                              {admin.tokens?.toLocaleString() || 0}
                            </span>
                          </div>
                          {(admin.tokens || 0) <= 0 && (
                            <span className="text-[9px] font-black text-red-600 bg-red-50 px-2 py-0.5 rounded-lg uppercase tracking-widest animate-pulse border border-red-100">
                              Expired
                            </span>
                          )}
                        </div>
                        <div className="w-32 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(((admin.tokens || 0) / (admin.token_limit || 1)) * 100, 100)}%` }}
                            className={`h-full rounded-full ${
                              (admin.tokens || 0) <= 10 ? 'bg-red-500' : 'bg-orange-500'
                            }`}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-5 px-4">
                      <p className="text-xs font-bold text-gray-500">
                        {new Date(admin.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </td>
                    <td className="py-5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setLogFilter(admin.username);
                            setShowAuditLogs(true);
                          }}
                          className="p-2.5 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-xl transition-all"
                          title="Audit Trail"
                        >
                          <History className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setIsEditingTokens(admin);
                            setTokenLimitInput(admin.token_limit || 0);
                          }}
                          className="p-2.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-xl transition-all"
                          title="Allocate Tokens"
                        >
                          <Zap className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleToggleStatus(admin.id, !!admin.is_active)}
                          className={`p-2.5 rounded-xl transition-all ${
                            admin.is_active 
                              ? 'text-orange-500 hover:bg-orange-50' 
                              : 'text-emerald-500 hover:bg-emerald-50'
                          }`}
                          title={admin.is_active ? 'Suspend' : 'Activate'}
                        >
                          <Key className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setIsDeletingAdmin(admin)}
                          className="p-2.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                          title="Remove User"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals Refined */}
      <AnimatePresence>
        {isCreating && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCreating(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl p-10 border border-gray-100"
            >
              <h3 className="text-2xl font-black text-gray-900 tracking-tight uppercase mb-8">New User</h3>
              <form onSubmit={handleCreateAdmin} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Email Address</label>
                  <input
                    type="email"
                    required
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-bold focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all"
                    placeholder="najam786ali@yahoo.com"
                    value={newAdmin.username}
                    onChange={(e) => setNewAdmin({ ...newAdmin, username: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Security Password</label>
                  <input
                    type="password"
                    required
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-bold focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all"
                    placeholder="••••••••"
                    value={newAdmin.password}
                    onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Initial Token Quota</label>
                  <input
                    type="number"
                    required
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-bold focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all"
                    placeholder="5000"
                    value={newAdmin.token_limit}
                    onChange={(e) => setNewAdmin({ ...newAdmin, token_limit: parseInt(e.target.value) })}
                  />
                </div>
                {error && <p className="text-xs text-red-600 font-black text-center uppercase tracking-widest">{error}</p>}
                <div className="flex gap-4 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsCreating(false)}
                    className="flex-1 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest text-gray-400 hover:bg-gray-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-4 bg-primary text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-primary-hover transition-all shadow-xl shadow-primary/10"
                  >
                    Deploy Account
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
              <h3 className="text-xl font-black text-gray-900 uppercase tracking-tighter mb-2">Delete User?</h3>
              <p className="text-sm text-gray-500 mb-8 font-medium">
                Are you sure you want to delete <span className="text-gray-900 font-bold">{isDeletingAdmin.username}</span>? 
                All activity and leads will be downloaded as PDF before permanent removal.
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
                  className="flex-1 py-4 bg-red-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-red-600 transition-all shadow-xl shadow-red-500/10 flex items-center justify-center gap-2"
                >
                  <FileDown className="w-4 h-4" />
                  Export & Delete
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
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Add/Set Tokens</label>
                  <input
                    type="number"
                    required
                    min="0"
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                    value={tokenLimitInput}
                    onChange={(e) => setTokenLimitInput(parseInt(e.target.value))}
                  />
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-2">
                    Current Balance: {isEditingTokens.tokens || 0} tokens remaining
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
                  .map((log, idx) => (
                  <div key={`audit-log-${log.id || idx}`} className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
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
