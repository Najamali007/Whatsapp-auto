import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Users, 
  Zap, 
  TrendingUp, 
  Activity, 
  ShieldCheck, 
  AlertCircle,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  Globe,
  Database,
  Key,
  MessageSquare,
  Target,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { apiFetch } from '../lib/api';
import socket from '../lib/socket';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
} from 'recharts';

export default function SuperAdminOverview() {
  const [stats, setStats] = useState<any>(null);
  const [activities, setActivities] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDetailedAnalytics, setShowDetailedAnalytics] = useState(false);

  useEffect(() => {
    const event = new CustomEvent('toggle-modal-blur', { 
      detail: { isOpen: showDetailedAnalytics } 
    });
    window.dispatchEvent(event);
  }, [showDetailedAnalytics]);

  const fetchData = async () => {
    try {
      const [statsData, activitiesData, chartDataRes] = await Promise.all([
        apiFetch('/api/super-admin/stats'),
        apiFetch('/api/super-admin/audit-logs'),
        apiFetch('/api/dashboard/chart-data')
      ]);
      setStats(statsData);
      setActivities(activitiesData.slice(0, 10));
      setChartData(chartDataRes);
      setError(null);
    } catch (error: any) {
      console.error('Failed to fetch super admin data:', error);
      setError('Failed to load global overview data.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    socket.on('super_admin_stats_update', fetchData);
    socket.on('admin_update', fetchData);
    
    const interval = setInterval(fetchData, 60000);
    return () => {
      clearInterval(interval);
      socket.off('super_admin_stats_update', fetchData);
      socket.off('admin_update', fetchData);
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
      </div>
    );
  }

  const kpiCards = [
    { label: 'Total Administrators', value: stats?.totalAdmins, icon: ShieldCheck, color: 'primary' },
    { label: 'Active Sessions', value: stats?.activeAdmins, icon: Users, color: 'emerald' },
    { label: 'Global Lead Count', value: stats?.totalLeads, icon: Database, color: 'blue' },
    { label: 'System Token Usage', value: stats?.totalTokensUsed, icon: Zap, color: 'orange' },
  ];

  return (
    <div className="space-y-12 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">
            WhatsApp Auto <span className="text-primary">Intelligence</span>
          </h1>
          <p className="text-gray-500 font-bold uppercase tracking-widest text-[10px] mt-1">Global Infrastructure Monitoring</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-4 py-2 bg-white rounded-xl border border-gray-100 shadow-sm flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Global Status: Optimal</span>
          </div>
          <button onClick={fetchData} className="p-2 bg-white border border-gray-100 rounded-xl shadow-sm hover:bg-gray-50 transition-all">
            <Activity className="w-5 h-5 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Professional Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        {kpiCards.map((card, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.1 }}
            className="bg-white border border-gray-100 p-6 rounded-3xl shadow-sm hover:shadow-md transition-all group"
          >
            <div className="flex items-start justify-between mb-4">
              <div className={`w-12 h-12 ${card.color === 'primary' ? 'bg-primary/10' : `bg-${card.color}-50`} rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform`}>
                <card.icon className={`w-6 h-6 ${card.color === 'primary' ? 'text-primary' : `text-${card.color}-600`}`} />
              </div>
            </div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{card.label}</p>
            <h3 className="text-3xl font-black text-gray-900 tracking-tight">{card.value?.toLocaleString() || 0}</h3>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        {/* Global Growth Chart */}
        <div className="lg:col-span-2 bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-lg font-black text-gray-900 tracking-tight uppercase">Network Performance</h3>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">System-wide engagement metrics</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-primary" />
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Leads</span>
              </div>
            </div>
          </div>
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorGlobal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#25D366" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#25D366" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#9CA3AF' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#9CA3AF' }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '16px', border: '1px solid #F3F4F6', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                  itemStyle={{ color: '#111827', fontWeight: 800, fontSize: '12px' }}
                />
                <Area type="monotone" dataKey="leads" stroke="#25D366" strokeWidth={3} fillOpacity={1} fill="url(#colorGlobal)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Global Audit Logs */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-black text-gray-900 flex items-center gap-3 uppercase tracking-tight">
              <Activity className="w-5 h-5 text-primary" />
              Audit Trail
            </h3>
            <span className="text-[10px] font-black text-primary bg-primary/5 px-2 py-1 rounded-lg uppercase tracking-widest">Live</span>
          </div>
          <div className="flex-1 space-y-6 overflow-auto max-h-[350px] pr-2 custom-scrollbar">
            <AnimatePresence initial={false}>
              {activities.map((log, i) => (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex gap-4 group"
                >
                  <div className="relative flex flex-col items-center">
                    <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0 z-10 group-hover:bg-primary/5 transition-colors">
                      <ShieldCheck className="w-5 h-5 text-primary" />
                    </div>
                    {i !== activities.length - 1 && (
                      <div className="w-px h-full bg-gray-100 absolute top-10" />
                    )}
                  </div>
                  <div className="flex-1 pt-0.5">
                    <p className="text-xs font-black text-gray-900">{log.username}</p>
                    <p className="text-[10px] text-gray-500 font-medium mt-0.5 leading-relaxed">{log.details}</p>
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">
                      {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* System Health Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
          <h3 className="text-lg font-black text-gray-900 mb-8 flex items-center gap-3 uppercase tracking-tight">
            <Zap className="w-5 h-5 text-orange-500" />
            Infrastructure Health
          </h3>
          <div className="space-y-8">
            <div className="grid grid-cols-2 gap-8">
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">System Status</p>
                <h4 className="text-3xl font-black text-emerald-600 tracking-tight">Active</h4>
              </div>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Network</p>
                <h4 className="text-3xl font-black text-emerald-600 tracking-tight">Stable</h4>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between text-[10px] font-black text-gray-400 uppercase tracking-widest">
                <span>System Load</span>
                <span>Optimal</span>
              </div>
              <div className="h-3 bg-gray-50 rounded-full overflow-hidden border border-gray-100">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: '42%' }}
                  transition={{ duration: 1.5, ease: "easeOut" }}
                  className="h-full bg-primary rounded-full" 
                />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-primary p-8 rounded-[2.5rem] shadow-xl shadow-primary/10 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl" />
          <h3 className="text-lg font-black mb-8 flex items-center gap-3 uppercase tracking-tight relative z-10">
            <TrendingUp className="w-5 h-5" />
            Growth Analytics
          </h3>
          <div className="grid grid-cols-2 gap-8 relative z-10">
            <div>
              <p className="text-[10px] font-black text-whatsapp/80 uppercase tracking-widest mb-1">Conversion Rate</p>
              <div className="flex items-center gap-2">
                <h4 className="text-4xl font-black tracking-tight">
                  {stats?.totalLeads > 0 ? ((stats?.totalConversions / stats?.totalLeads) * 100).toFixed(1) : 0}%
                </h4>
              </div>
            </div>
            <div>
              <p className="text-[10px] font-black text-whatsapp/80 uppercase tracking-widest mb-1">Total Users</p>
              <div className="flex items-center gap-2">
                <h4 className="text-4xl font-black tracking-tight">{stats?.totalAdmins || 0}</h4>
              </div>
            </div>
            <div className="col-span-2">
              <button 
                onClick={() => setShowDetailedAnalytics(true)}
                className="w-full py-4 bg-white text-primary rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-50 transition-all shadow-lg active:scale-[0.98]"
              >
                View Detailed Analytics
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Analytics Modal */}
      {showDetailedAnalytics && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowDetailedAnalytics(false)}
            className="absolute inset-0 bg-black/20 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-4xl bg-white rounded-[3rem] shadow-2xl p-10 border border-gray-100 flex flex-col max-h-[90vh] overflow-hidden"
          >
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-2xl font-black text-gray-900 tracking-tight uppercase">Detailed Growth Intelligence</h3>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Deep dive into system-wide performance metrics</p>
              </div>
              <button onClick={() => setShowDetailedAnalytics(false)} className="p-2 hover:bg-gray-50 rounded-xl transition-all">
                <X className="w-6 h-6 text-gray-400" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-4 space-y-8 custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-6 bg-gray-50 rounded-3xl border border-gray-100">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Lead Velocity</p>
                  <h4 className="text-2xl font-black text-gray-900">{(stats?.totalLeads / 30).toFixed(1)}/day</h4>
                  <p className="text-[10px] text-gray-400 font-bold mt-1">Average per day</p>
                </div>
                <div className="p-6 bg-gray-50 rounded-3xl border border-gray-100">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Token Efficiency</p>
                  <h4 className="text-2xl font-black text-gray-900">{(stats?.totalTokensUsed / (stats?.totalLeads || 1)).toFixed(1)}/lead</h4>
                  <p className="text-[10px] text-gray-400 font-bold mt-1">Tokens per lead</p>
                </div>
                <div className="p-6 bg-gray-50 rounded-3xl border border-gray-100">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Conversion Ratio</p>
                  <h4 className="text-2xl font-black text-gray-900">
                    {stats?.totalLeads > 0 ? ((stats?.totalConversions / stats?.totalLeads) * 100).toFixed(1) : 0}%
                  </h4>
                  <p className="text-[10px] text-gray-400 font-bold mt-1">System wide average</p>
                </div>
              </div>

              <div className="bg-gray-900 rounded-[2.5rem] p-8 text-white">
                <h4 className="text-lg font-black mb-6 uppercase tracking-tight">System Distribution</h4>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#374151" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#111827', borderRadius: '12px', border: 'none' }}
                        itemStyle={{ color: '#fff' }}
                      />
                      <Bar dataKey="leads" fill="#25D366" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-lg font-black text-gray-900 uppercase tracking-tight">Infrastructure Health</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { label: 'Database Status', value: 'Connected', status: 'Optimal' },
                    { label: 'System Status', value: 'Healthy', status: 'Healthy' },
                    { label: 'AI Engine', value: 'Ready', status: 'Processing' },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
                      <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{item.label}</p>
                        <p className="text-sm font-black text-gray-900">{item.value}</p>
                      </div>
                      <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg uppercase tracking-widest">{item.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>,
        document.body
      )}
    </div>
  );
}
