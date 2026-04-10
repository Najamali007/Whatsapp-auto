import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Users, 
  MessageSquare, 
  Target, 
  TrendingUp, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Bell,
  Zap,
  UserCheck,
  UserPlus,
  Send,
  Database,
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
  Cell,
  PieChart,
  Pie
} from 'recharts';

interface DashboardProps {
  token: string;
}

export default function Dashboard({ token }: DashboardProps) {
  const [stats, setStats] = useState<any>(null);
  const [activities, setActivities] = useState<any[]>([]);
  const [systemStatus, setSystemStatus] = useState<any>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDetailedAnalytics, setShowDetailedAnalytics] = useState(false);
  const [showTokenEndedModal, setShowTokenEndedModal] = useState(false);
  const [showTokenAddedModal, setShowTokenAddedModal] = useState(false);
  const [lastTokenCount, setLastTokenCount] = useState<number | null>(null);

  useEffect(() => {
    const isModalOpen = showDetailedAnalytics || showTokenEndedModal || showTokenAddedModal;
    const event = new CustomEvent('toggle-modal-blur', { 
      detail: { isOpen: isModalOpen } 
    });
    window.dispatchEvent(event);
  }, [showDetailedAnalytics, showTokenEndedModal, showTokenAddedModal]);

  const fetchData = async () => {
    try {
      const [statsData, activitiesData, statusData, chartDataRes] = await Promise.all([
        apiFetch('/api/dashboard/stats'),
        apiFetch('/api/activities'),
        apiFetch('/api/system/status'),
        apiFetch('/api/dashboard/chart-data')
      ]);

      // Check for token changes
      if (lastTokenCount !== null) {
        if (statsData.tokens > lastTokenCount) {
          setShowTokenAddedModal(true);
        } else if (statsData.tokens <= 0 && lastTokenCount > 0) {
          setShowTokenEndedModal(true);
        }
      }
      
      setLastTokenCount(statsData.tokens);
      setStats(statsData);
      setActivities(activitiesData);
      setSystemStatus(statusData);
      setChartData(chartDataRes);
      setError(null);
    } catch (error: any) {
      console.error('Failed to fetch dashboard data:', error);
      setError('Failed to load dashboard data. Please check your connection.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    
    socket.on('dashboard_update', fetchData);
    socket.on('token_update', fetchData);
    socket.on('activity_update', fetchData);

    const interval = setInterval(fetchData, 30000); // Refresh every 30s as fallback
    return () => {
      clearInterval(interval);
      socket.off('dashboard_update', fetchData);
      socket.off('token_update', fetchData);
      socket.off('activity_update', fetchData);
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
    { label: 'Total Leads', value: stats?.totalLeads || 0, growth: stats?.growth?.leads || 0, icon: Users, color: 'primary' },
    { label: 'Qualified Leads', value: stats?.qualifiedLeads || 0, growth: stats?.growth?.qualified || 0, icon: UserCheck, color: 'emerald' },
    { label: 'Conversions', value: stats?.conversions || 0, growth: stats?.growth?.conversions || 0, icon: Target, color: 'purple' },
    { label: 'Inbox Messages', value: stats?.inboxMessages || 0, growth: stats?.growth?.messages || 0, icon: MessageSquare, color: 'blue' },
    { label: 'Active Campaigns', value: stats?.activeCampaigns || 0, growth: stats?.growth?.campaigns || 0, icon: Send, color: 'orange' },
    { label: 'Total Customers', value: stats?.totalCustomers || 0, growth: stats?.growth?.customers || 0, icon: Database, color: 'pink' },
  ];

  return (
    <div className="space-y-12 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Dashboard Overview</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="px-4 py-2 bg-primary/5 rounded-2xl border border-primary/10 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-xs font-black text-primary uppercase tracking-widest">Live Updates Active</span>
          </div>
        </div>
      </div>

      {/* User Profile & Tokens Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="md:col-span-2 bg-gray-900 rounded-[2.5rem] p-8 text-white relative overflow-hidden group shadow-2xl shadow-gray-900/20"
        >
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full -mr-32 -mt-32 blur-3xl group-hover:bg-primary/20 transition-all duration-1000" />
          <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
            <div className="w-24 h-24 bg-white/10 rounded-3xl flex items-center justify-center border border-white/10 backdrop-blur-sm">
              <Users className="w-12 h-12 text-primary" />
            </div>
            <div className="flex-1 text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-3 mb-2">
                <h2 className="text-2xl font-black tracking-tight">{stats?.username || 'Administrator'}</h2>
                <span className="px-3 py-1 bg-primary/20 rounded-full text-[10px] font-black uppercase tracking-widest border border-primary/30">Admin Account</span>
              </div>
              <p className="text-primary text-sm font-black mb-1">{stats?.email || 'No email provided'}</p>
              <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest mb-4">Member since {stats?.memberSince ? new Date(stats.memberSince).toLocaleDateString() : 'N/A'}</p>
              <div className="flex flex-wrap justify-center md:justify-start gap-4">
                <div className="px-4 py-2 bg-white/5 rounded-xl border border-white/5 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold">{stats?.totalLeads || 0} Leads Managed</span>
                </div>
                <div className="px-4 py-2 bg-white/5 rounded-xl border border-white/5 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-orange-400" />
                  <span className="text-xs font-bold">{stats?.tokens || 0} Tokens Consumed</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-orange-50 rounded-2xl flex items-center justify-center">
                <Zap className={`w-6 h-6 ${stats?.tokens <= 0 ? 'text-red-500' : 'text-orange-500'}`} />
              </div>
              {stats?.tokens <= 0 && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="bg-red-500 text-white p-1 rounded-full border-2 border-white shadow-lg"
                >
                  <AlertCircle className="w-4 h-4" />
                </motion.div>
              )}
            </div>
            <div className="text-right">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Token Balance</p>
              <h3 className="text-2xl font-black text-gray-900">{stats?.tokens || 0}</h3>
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
              <span className="text-gray-400">Remaining Tokens</span>
              <span className="text-gray-900">{Math.round(((stats?.tokens || 0) / (stats?.tokenLimit || 1)) * 100)}%</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(((stats?.tokens || 0) / (stats?.tokenLimit || 1)) * 100, 100)}%` }}
                transition={{ duration: 1 }}
                className={`h-full rounded-full ${
                  ((stats?.tokens || 0) / (stats?.tokenLimit || 1)) < 0.1 ? 'bg-red-500' : 'bg-orange-500'
                }`}
              />
            </div>
            <p className="text-[10px] font-bold text-gray-400 text-center">
              {stats?.tokens || 0} remaining of {stats?.tokenLimit || 0} total tokens
            </p>
          </div>
        </motion.div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-8">
        {kpiCards.map((card, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.05 }}
            className="bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
          >
            <div className={`w-12 h-12 ${card.color === 'primary' ? 'bg-primary/10' : `bg-${card.color}-50`} rounded-2xl flex items-center justify-center mb-4`}>
              <card.icon className={`w-6 h-6 ${card.color === 'primary' ? 'text-primary' : `text-${card.color}-600`}`} />
            </div>
            <h3 className="text-2xl font-black text-gray-900 leading-none">{card.value}</h3>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-2 mb-3">{card.label}</p>
            <div className="flex items-center gap-1">
              {card.growth >= 0 ? (
                <ArrowUpRight className="w-3 h-3 text-emerald-500" />
              ) : (
                <ArrowDownRight className="w-3 h-3 text-red-500" />
              )}
              <span className={`text-[10px] font-black ${card.growth >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                {Math.abs(card.growth)}%
              </span>
              <span className="text-[10px] font-bold text-gray-300 ml-1">vs last month</span>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        {/* Main Growth Chart */}
        <div className="lg:col-span-2 bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-xl font-black text-gray-900">Growth Analytics</h3>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Leads vs Conversions Trend</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-primary" />
                <span className="text-xs font-bold text-gray-500">Leads</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                <span className="text-xs font-bold text-gray-500">Conversions</span>
              </div>
            </div>
          </div>
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#25D366" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#25D366" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorConversions" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 600, fill: '#94A3B8' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 600, fill: '#94A3B8' }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Area type="monotone" dataKey="leads" stroke="#25D366" strokeWidth={3} fillOpacity={1} fill="url(#colorLeads)" />
                <Area type="monotone" dataKey="conversions" stroke="#10B981" strokeWidth={3} fillOpacity={1} fill="url(#colorConversions)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Live Activity Feed */}
        <div className="bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-black text-gray-900 flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              Live Activity
            </h3>
            <span className="text-[10px] font-black text-primary bg-primary/5 px-2 py-1 rounded-lg uppercase tracking-widest">Real-time</span>
          </div>
          <div className="flex-1 space-y-6 overflow-auto max-h-[350px] pr-2 custom-scrollbar">
            <AnimatePresence initial={false}>
              {activities.map((activity, i) => (
                <motion.div
                  key={activity.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex gap-4 group"
                >
                  <div className="relative flex flex-col items-center">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 z-10 ${
                      activity.type === 'lead_added' ? 'bg-blue-50 text-blue-600' :
                      activity.type === 'lead_qualified' ? 'bg-emerald-50 text-emerald-600' :
                      activity.type === 'followup_sent' ? 'bg-purple-50 text-purple-600' :
                      activity.type === 'customer_converted' ? 'bg-pink-50 text-pink-600' :
                      'bg-gray-50 text-gray-600'
                    }`}>
                      {activity.type === 'lead_added' ? <UserPlus className="w-5 h-5" /> :
                       activity.type === 'lead_qualified' ? <UserCheck className="w-5 h-5" /> :
                       activity.type === 'followup_sent' ? <Send className="w-5 h-5" /> :
                       activity.type === 'customer_converted' ? <Zap className="w-5 h-5" /> :
                       <MessageSquare className="w-5 h-5" />}
                    </div>
                    {i !== activities.length - 1 && (
                      <div className="w-0.5 h-full bg-gray-50 absolute top-10" />
                    )}
                  </div>
                  <div className="flex-1 pt-1">
                    <p className="text-sm font-bold text-gray-900 group-hover:text-primary transition-colors">{activity.description}</p>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">
                      {new Date(activity.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {activities.length === 0 && (
              <div className="text-center py-12">
                <p className="text-sm font-bold text-gray-400">No recent activity</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* System Status */}
        <div className="bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm">
          <h3 className="text-xl font-black text-gray-900 mb-8 flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            System Status
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {systemStatus && Object.entries(systemStatus).map(([key, value]: [string, any]) => (
              <div key={key} className="p-6 rounded-[2rem] bg-gray-50 border border-gray-100">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">{value.label}</p>
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full animate-pulse ${
                    value.variant === 'success' ? 'bg-emerald-500' :
                    value.variant === 'warning' ? 'bg-orange-500' : 'bg-red-500'
                  }`} />
                  <span className={`text-sm font-black ${
                    value.variant === 'success' ? 'text-emerald-600' :
                    value.variant === 'warning' ? 'text-orange-600' : 'text-red-600'
                  }`}>{value.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Performance Metrics */}
        <div className="bg-primary p-8 rounded-[3rem] shadow-2xl shadow-primary/20 text-white">
          <h3 className="text-xl font-black mb-8 flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Performance Metrics
          </h3>
          <div className="grid grid-cols-2 gap-8">
            <div>
              <p className="text-[10px] font-black text-whatsapp/80 uppercase tracking-widest mb-1">Conversion Rate</p>
              <div className="flex items-end gap-2">
                <h4 className="text-4xl font-black">
                  {stats?.totalLeads > 0 ? ((stats?.conversions / stats?.totalLeads) * 100).toFixed(1) : 0}%
                </h4>
                <ArrowUpRight className="w-5 h-5 text-emerald-400 mb-2" />
              </div>
            </div>
            <div>
              <p className="text-[10px] font-black text-whatsapp/80 uppercase tracking-widest mb-1">Lead-to-Customer</p>
              <div className="flex items-end gap-2">
                <h4 className="text-4xl font-black">1:{(stats?.totalLeads / (stats?.conversions || 1)).toFixed(1)}</h4>
                <ArrowUpRight className="w-5 h-5 text-emerald-400 mb-2" />
              </div>
            </div>
            <div className="col-span-2">
              <button 
                onClick={() => setShowDetailedAnalytics(true)}
                className="w-full py-4 bg-white/10 hover:bg-white/20 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all border border-white/10"
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
                <h3 className="text-2xl font-black text-gray-900 tracking-tight uppercase">Performance Intelligence</h3>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Deep dive into your business growth metrics</p>
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
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Conversion Efficiency</p>
                  <h4 className="text-2xl font-black text-gray-900">{stats?.totalLeads > 0 ? ((stats?.conversions / stats?.totalLeads) * 100).toFixed(1) : 0}%</h4>
                  <p className="text-[10px] text-gray-400 font-bold mt-1">Leads to customer</p>
                </div>
                <div className="p-6 bg-gray-50 rounded-3xl border border-gray-100">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Total Tokens</p>
                  <h4 className="text-2xl font-black text-gray-900">{stats?.tokenLimit || 0}</h4>
                  <p className="text-[10px] text-gray-400 font-bold mt-1">Allocated quota</p>
                </div>
              </div>

              <div className="bg-gray-900 rounded-[2.5rem] p-8 text-white">
                <h4 className="text-lg font-black mb-6 uppercase tracking-tight">Growth Distribution</h4>
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
                      <Bar dataKey="conversions" fill="#10B981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-lg font-black text-gray-900 uppercase tracking-tight">Channel Performance</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { label: 'WhatsApp', value: stats?.totalLeads || 0, status: 'Active' },
                    { label: 'Bulk Campaigns', value: stats?.activeCampaigns || 0, status: 'Running' },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
                      <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{item.label}</p>
                        <p className="text-sm font-black text-gray-900">{item.value}</p>
                      </div>
                      <span className={`text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-widest ${
                        item.status === 'Active' || item.status === 'Running' ? 'text-emerald-600 bg-emerald-50' : 'text-gray-400 bg-gray-100'
                      }`}>{item.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>,
        document.body
      )}

      {/* Token Ended Modal */}
      {showTokenEndedModal && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowTokenEndedModal(false)}
            className="absolute inset-0 bg-black/20 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl p-10 border border-red-100 text-center"
          >
            <div className="w-20 h-20 bg-red-50 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-10 h-10 text-red-500" />
            </div>
            <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tight mb-2">Tokens Exhausted</h3>
            <p className="text-sm text-gray-500 font-medium mb-8">
              Your token balance has reached zero. Automated responses and campaigns are currently paused, but your data remains safe and accessible.
            </p>
            
            <div className="space-y-3">
              <a 
                href="mailto:whatsappauto@ondigix.com"
                className="block w-full py-4 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-primary-hover transition-all shadow-xl shadow-primary/20"
              >
                Contact Support Team
              </a>
              <button
                onClick={() => setShowTokenEndedModal(false)}
                className="w-full py-4 bg-gray-50 text-gray-400 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gray-100 transition-all"
              >
                Close Dashboard
              </button>
            </div>
            
            <p className="mt-6 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              Contact your administrator for a top-up
            </p>
          </motion.div>
        </div>,
        document.body
      )}

      {/* Token Added Modal */}
      {showTokenAddedModal && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowTokenAddedModal(false)}
            className="absolute inset-0 bg-black/20 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl p-10 border border-emerald-100 text-center"
          >
            <div className="w-20 h-20 bg-emerald-50 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <Zap className="w-10 h-10 text-emerald-500" />
            </div>
            <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tight mb-2">Tokens Topped Up!</h3>
            <p className="text-sm text-gray-500 font-medium mb-8">
              Your account has been successfully credited with new tokens. All systems are now fully operational.
            </p>
            
            <button
              onClick={() => setShowTokenAddedModal(false)}
              className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-xl shadow-emerald-500/20"
            >
              Continue to Dashboard
            </button>
            
            <div className="mt-8 pt-8 border-t border-gray-50">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Need more help?</p>
              <div className="flex gap-2">
                <a href="mailto:whatsappauto@ondigix.com" className="flex-1 py-3 bg-gray-50 rounded-xl text-[10px] font-black text-gray-600 uppercase tracking-widest hover:bg-gray-100 transition-all">Support</a>
                <button className="flex-1 py-3 bg-gray-50 rounded-xl text-[10px] font-black text-gray-600 uppercase tracking-widest hover:bg-gray-100 transition-all">Admin</button>
              </div>
            </div>
          </motion.div>
        </div>,
        document.body
      )}
    </div>
  );
}
