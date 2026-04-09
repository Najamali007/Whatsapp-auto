import React, { useEffect, useState } from 'react';
import { 
  BarChart3,
  Bell,
  LayoutDashboard, 
  Users, 
  MessageSquare, 
  QrCode, 
  Send, 
  LogOut,
  Menu,
  X,
  Plus,
  ChevronRight,
  UserCircle,
  Settings,
  Layers,
  UserPlus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { apiFetch } from '../lib/api';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onLogout: () => void;
}

export default function Layout({ children, activeTab, setActiveTab, onLogout }: LayoutProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [newLeadsCount, setNewLeadsCount] = useState(0);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const stats = await apiFetch('/api/leads/stats');
        setNewLeadsCount(stats.new_count || 0);
        
        const convStats = await apiFetch('/api/conversations/unread-count');
        setUnreadMessagesCount(convStats.total || 0);
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const userRole = localStorage.getItem('user_role') || 'admin';

  const menuItems = userRole === 'super_admin' 
    ? [
        { id: 'settings', label: 'API Settings', icon: Settings },
        { id: 'admins', label: 'Manage Admins', icon: UserCircle },
      ]
    : [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'conversations', label: 'Inbox', icon: MessageSquare, badge: unreadMessagesCount },
        { id: 'leads', label: 'Leads', icon: UserPlus, badge: newLeadsCount },
        { id: 'campaigns', label: 'Campaigns', icon: Send },
        { id: 'agents', label: 'Agents', icon: Users },
        { id: 'reports', label: 'Reports', icon: BarChart3 },
        { id: 'whatsapp', label: 'Channels', icon: Layers },
      ];

  return (
    <div className="min-h-screen bg-[#F8F9FB] flex relative overflow-hidden">
      {/* Background Decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[20%] -right-[10%] w-[60%] h-[60%] bg-primary/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute -bottom-[20%] -left-[10%] w-[60%] h-[60%] bg-primary/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '3s' }} />
        <div className="absolute top-1/4 left-1/4 w-[40%] h-[40%] bg-purple-500/5 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '1.5s' }} />
        <div className="absolute bottom-1/4 right-1/4 w-[40%] h-[40%] bg-orange-500/5 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '4.5s' }} />
      </div>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-[280px] glass-card border-r border-gray-100 h-screen sticky top-0 z-20 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-purple-500 to-orange-500" />
        
        <div className="p-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-600/20 rotate-[-5deg] group hover:rotate-0 transition-all duration-500">
              <span className="text-white font-black text-2xl italic">O</span>
            </div>
            <div>
              <h1 className="text-xl font-black text-gray-900 tracking-tighter leading-none">
                Ondigix
              </h1>
              <p className="text-[8px] font-black text-indigo-600 uppercase tracking-widest mt-1">WhatsApp Auto Create by Ondigix</p>
            </div>
          </div>
        </div>

        {userRole !== 'super_admin' && (
          <div className="px-6 mb-8">
            <button
              onClick={() => setActiveTab('agents')}
              className="group relative w-full bg-gray-900 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-2xl shadow-gray-900/20 transition-all active:scale-[0.98] overflow-hidden"
            >
              <div className="absolute inset-0 bg-primary translate-y-[100%] group-hover:translate-y-0 transition-transform duration-500" />
              <Plus className="w-4 h-4 relative z-10" />
              <span className="relative z-10">Create Agent</span>
            </button>
          </div>
        )}

        <nav className="flex-1 px-4 space-y-2 overflow-y-auto custom-scrollbar">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl text-sm font-black uppercase tracking-widest transition-all ${
                activeTab === item.id 
                  ? 'bg-white text-gray-900 shadow-xl shadow-gray-200/50 ring-1 ring-gray-100' 
                  : 'text-gray-400 hover:bg-white/50 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-4">
                <item.icon className={`w-5 h-5 transition-colors ${activeTab === item.id ? 'text-primary' : 'text-gray-300'}`} />
                {item.label}
              </div>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="bg-primary text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-lg shadow-primary/20">
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center border border-white shadow-sm">
                <UserCircle className="w-6 h-6 text-gray-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-black text-gray-900 truncate">{userRole === 'super_admin' ? 'Super Admin' : 'Admin'}</p>
                <p className="text-[10px] font-bold text-gray-400 truncate">Ondigix Platform</p>
              </div>
            </div>
            <button 
              onClick={onLogout} 
              className="p-2.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 bg-white border-b border-gray-100 z-50 px-4 py-3 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-black text-lg italic">O</span>
          </div>
          <h1 className="text-lg font-bold text-gray-900 tracking-tight">
            Ondigix
          </h1>
        </div>
        <button 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 text-gray-500 hover:bg-gray-50 rounded-xl transition-all"
        >
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="md:hidden fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="md:hidden fixed top-0 left-0 bottom-0 w-[280px] bg-white z-50 shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                    <span className="text-white font-black text-lg italic">O</span>
                  </div>
                  <h1 className="text-lg font-bold text-gray-900">Ondigix</h1>
                </div>
                <button onClick={() => setIsMobileMenuOpen(false)} className="text-gray-400">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4">
                <button
                  onClick={() => {
                    setActiveTab('agents');
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full bg-[#00C853] text-white py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#00C853]/20"
                >
                  <Plus className="w-4 h-4" />
                  Create Agent
                </button>
              </div>

              <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
                {menuItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                      activeTab === item.id 
                        ? 'bg-[#F0F2F5] text-gray-900' 
                        : 'text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    <item.icon className={`w-5 h-5 ${activeTab === item.id ? 'text-gray-900' : 'text-gray-400'}`} />
                    {item.label}
                  </button>
                ))}
              </nav>

              <div className="p-6 border-t border-gray-100 space-y-4">
                <button 
                  onClick={onLogout}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-red-500 hover:bg-red-50 transition-all"
                >
                  <LogOut className="w-5 h-5" />
                  Logout
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 pt-[60px] md:pt-0 overflow-auto h-screen relative z-10 flex flex-col">
        <div className="flex-1 p-4 md:p-8">
          {children}
        </div>
        <footer className="p-8 border-t border-gray-100 bg-white/80 backdrop-blur-md">
          <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-black text-lg italic">O</span>
                </div>
                <h3 className="text-lg font-black text-gray-900">Ondigix</h3>
              </div>
              <p className="text-sm text-gray-500 leading-relaxed">
                Empowering businesses with intelligent AI automation and seamless communication solutions.
              </p>
            </div>
            <div className="space-y-4">
              <h4 className="text-sm font-black text-gray-900 uppercase tracking-widest">Contact Us</h4>
              <ul className="space-y-2 text-sm text-gray-500">
                <li>Email: <a href="mailto:queries@ondigix.com" className="text-indigo-600 hover:underline">queries@ondigix.com</a></li>
                <li>Support: 24/7 AI Assistance</li>
                <li>Location: Global Operations</li>
              </ul>
            </div>
            <div className="space-y-4">
              <h4 className="text-sm font-black text-gray-900 uppercase tracking-widest">Legal</h4>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><button className="hover:text-indigo-600 transition-colors">Privacy Policy</button></li>
                <li><button className="hover:text-indigo-600 transition-colors">Terms of Service</button></li>
                <li className="pt-2 text-[10px] font-bold uppercase tracking-tighter text-gray-400">
                  © 2026 Ondigix. All rights reserved.
                </li>
              </ul>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
