import React, { useState, useEffect } from 'react';
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
  Database
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { apiFetch } from '../lib/api';
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

  const fetchData = async () => {
    try {
      const [statsData, activitiesData, statusData, chartDataRes] = await Promise.all([
        apiFetch('/api/dashboard/stats'),
        apiFetch('/api/activities'),
        apiFetch('/api/system/status'),
        apiFetch('/api/dashboard/chart-data')
      ]);
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
    const interval = setInterval(fetchData, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-12 h-12 animate-spin text-indigo-600" />
      </div>
    );
  }

  const kpiCards = [
    { label: 'Total Leads', value: stats?.totalLeads, growth: stats?.growth?.leads, icon: Users, color: 'indigo' },
    { label: 'Qualified Leads', value: stats?.qualifiedLeads, growth: stats?.growth?.qualified, icon: UserCheck, color: 'emerald' },
    { label: 'Conversions', value: stats?.conversions, growth: stats?.growth?.conversions, icon: Target, color: 'purple' },
    { label: 'Inbox Messages', value: stats?.inboxMessages, growth: stats?.growth?.messages, icon: MessageSquare, color: 'blue' },
    { label: 'Active Campaigns', value: stats?.activeCampaigns, growth: stats?.growth?.campaigns, icon: Send, color: 'orange' },
    { label: 'Total Customers', value: stats?.totalCustomers, growth: stats?.growth?.customers, icon: Database, color: 'pink' },
  ];

  return (
    <div className="space-y-8 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Dashboard Overview</h1>
          <p className="text-gray-500 font-medium">Real-time performance of Webdo Solutions AI Automation</p>
        </div>
        <div className="flex items-center gap-4">
          <button className="p-3 bg-white rounded-2xl border border-gray-100 shadow-sm relative group">
            <Bell className="w-6 h-6 text-gray-400 group-hover:text-indigo-600 transition-colors" />
            <span className="absolute top-2.5 right-2.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white" />
          </button>
          <div className="px-4 py-2 bg-indigo-50 rounded-2xl border border-indigo-100 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
            <span className="text-xs font-black text-indigo-600 uppercase tracking-widest">Live Updates Active</span>
          </div>
        </div>
      </div>

      {/* User Profile & Tokens Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="md:col-span-2 bg-gray-900 rounded-[2.5rem] p-8 text-white relative overflow-hidden group shadow-2xl shadow-gray-900/20"
        >
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full -mr-32 -mt-32 blur-3xl group-hover:bg-indigo-500/20 transition-all duration-1000" />
          <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
            <div className="w-24 h-24 bg-white/10 rounded-3xl flex items-center justify-center border border-white/10 backdrop-blur-sm">
              <Users className="w-12 h-12 text-indigo-400" />
            </div>
            <div className="flex-1 text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-3 mb-2">
                <h2 className="text-2xl font-black tracking-tight">{stats?.username || 'Administrator'}</h2>
                <span className="px-3 py-1 bg-indigo-500/20 rounded-full text-[10px] font-black uppercase tracking-widest border border-indigo-500/30">Admin Account</span>
              </div>
              <p className="text-gray-400 text-sm font-medium mb-4">Member since {stats?.memberSince ? new Date(stats.memberSince).toLocaleDateString() : 'N/A'}</p>
              <div className="flex flex-wrap justify-center md:justify-start gap-4">
                <div className="px-4 py-2 bg-white/5 rounded-xl border border-white/5 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-indigo-400" />
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
            <div className="w-12 h-12 bg-orange-50 rounded-2xl flex items-center justify-center">
              <Zap className="w-6 h-6 text-orange-500" />
            </div>
            <div className="text-right">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Token Balance</p>
              <h3 className="text-2xl font-black text-gray-900">{(stats?.tokenLimit || 0) - (stats?.tokens || 0)}</h3>
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
              <span className="text-gray-400">Usage Progress</span>
              <span className="text-gray-900">{Math.round(((stats?.tokens || 0) / (stats?.tokenLimit || 1)) * 100)}%</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(((stats?.tokens || 0) / (stats?.tokenLimit || 1)) * 100, 100)}%` }}
                transition={{ duration: 1 }}
                className={`h-full rounded-full ${
                  ((stats?.tokens || 0) / (stats?.tokenLimit || 1)) > 0.9 ? 'bg-red-500' : 'bg-orange-500'
                }`}
              />
            </div>
            <p className="text-[10px] font-bold text-gray-400 text-center">
              {stats?.tokens || 0} used of {stats?.tokenLimit || 0} total tokens
            </p>
          </div>
        </motion.div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
        {kpiCards.map((card, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
          >
            <div className={`w-12 h-12 bg-${card.color}-50 rounded-2xl flex items-center justify-center mb-4`}>
              <card.icon className={`w-6 h-6 text-${card.color}-600`} />
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Growth Chart */}
        <div className="lg:col-span-2 bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-xl font-black text-gray-900">Growth Analytics</h3>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Leads vs Conversions Trend</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-indigo-600" />
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
                    <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#4F46E5" stopOpacity={0}/>
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
                <Area type="monotone" dataKey="leads" stroke="#4F46E5" strokeWidth={3} fillOpacity={1} fill="url(#colorLeads)" />
                <Area type="monotone" dataKey="conversions" stroke="#10B981" strokeWidth={3} fillOpacity={1} fill="url(#colorConversions)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Live Activity Feed */}
        <div className="bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-black text-gray-900 flex items-center gap-2">
              <Activity className="w-5 h-5 text-indigo-600" />
              Live Activity
            </h3>
            <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg uppercase tracking-widest">Real-time</span>
          </div>
          <div className="flex-1 space-y-6 overflow-auto max-h-[350px] pr-2 custom-scrollbar">
            <AnimatePresence initial={false}>
              {activities.map((activity, i) => (
                <motion.div
                  key={activity.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
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
                    <p className="text-sm font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">{activity.description}</p>
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
            <Zap className="w-5 h-5 text-indigo-600" />
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
        <div className="bg-indigo-600 p-8 rounded-[3rem] shadow-2xl shadow-indigo-600/20 text-white">
          <h3 className="text-xl font-black mb-8 flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Performance Metrics
          </h3>
          <div className="grid grid-cols-2 gap-8">
            <div>
              <p className="text-[10px] font-black text-indigo-200 uppercase tracking-widest mb-1">Conversion Rate</p>
              <div className="flex items-end gap-2">
                <h4 className="text-4xl font-black">
                  {stats?.totalLeads > 0 ? ((stats?.conversions / stats?.totalLeads) * 100).toFixed(1) : 0}%
                </h4>
                <ArrowUpRight className="w-5 h-5 text-emerald-400 mb-2" />
              </div>
            </div>
            <div>
              <p className="text-[10px] font-black text-indigo-200 uppercase tracking-widest mb-1">Lead-to-Customer</p>
              <div className="flex items-end gap-2">
                <h4 className="text-4xl font-black">1:{(stats?.totalLeads / (stats?.conversions || 1)).toFixed(1)}</h4>
                <ArrowUpRight className="w-5 h-5 text-emerald-400 mb-2" />
              </div>
            </div>
            <div className="col-span-2">
              <div className="flex justify-between text-[10px] font-black text-indigo-200 uppercase tracking-widest mb-2">
                <span>Monthly Goal Progress</span>
                <span>78%</span>
              </div>
              <div className="h-3 bg-white/10 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: '78%' }}
                  transition={{ duration: 1.5 }}
                  className="h-full bg-white rounded-full" 
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
