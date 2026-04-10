import React, { useEffect, useState } from 'react';
import { 
  BarChart3,
  Bell,
  PanelLeftClose,
  PanelLeftOpen,
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
  UserPlus,
  Globe,
  Zap,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { apiFetch } from '../lib/api';
import socket from '../lib/socket';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'lead_closed' | 'tokens_exhausted' | 'system';
  timestamp: Date;
  read: boolean;
}

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onLogout: () => void;
}

export default function Layout({ children, activeTab, setActiveTab, onLogout }: LayoutProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [newLeadsCount, setNewLeadsCount] = useState(0);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [expiredAdminsCount, setExpiredAdminsCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [isAnyModalOpen, setIsAnyModalOpen] = useState(false);

  // Prevent scrolling and apply blur when modals are open
  useEffect(() => {
    const internalModalOpen = showLogoutConfirm || showNotifications || isMobileMenuOpen;
    
    const handleExternalModal = (e: any) => {
      setIsAnyModalOpen(e.detail.isOpen);
    };

    window.addEventListener('toggle-modal-blur', handleExternalModal);

    if (internalModalOpen || isAnyModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('toggle-modal-blur', handleExternalModal);
    };
  }, [showLogoutConfirm, showNotifications, isMobileMenuOpen, isAnyModalOpen]);

  useEffect(() => {
    // Socket listeners for notifications
    socket.on('lead_closed', (data: any) => {
      const newNotif: Notification = {
        id: Math.random().toString(36).substr(2, 9),
        title: 'Lead Closed',
        message: `Lead ${data.name || 'Unknown'} has been marked as completed.`,
        type: 'lead_closed',
        timestamp: new Date(),
        read: false
      };
      setNotifications(prev => [newNotif, ...prev]);
    });

    socket.on('tokens_exhausted', () => {
      const newNotif: Notification = {
        id: Math.random().toString(36).substr(2, 9),
        title: 'Tokens Exhausted',
        message: 'Your token balance has reached zero. Contact +92 306 4443434 for top-up.',
        type: 'tokens_exhausted',
        timestamp: new Date(),
        read: false
      };
      setNotifications(prev => [newNotif, ...prev]);
    });

    return () => {
      socket.off('lead_closed');
      socket.off('tokens_exhausted');
    };
  }, []);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const userRole = localStorage.getItem('user_role');
        
        if (userRole === 'super_admin') {
          const admins = await apiFetch('/api/super-admin/admins');
          const expired = admins.filter((a: any) => (a.tokens || 0) <= 0).length;
          setExpiredAdminsCount(expired);
        } else {
          const stats = await apiFetch('/api/leads/stats');
          setNewLeadsCount(stats.new_count || 0);
          
          const convStats = await apiFetch('/api/conversations/unread-count');
          setUnreadMessagesCount(convStats.total || 0);
        }
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
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'settings', label: 'API Settings', icon: Settings },
        { id: 'admins', label: 'Manage Admins', icon: UserCircle, badge: expiredAdminsCount },
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
    <div className="h-screen bg-[#F8F9FB] flex relative overflow-hidden">
      <div className={`flex flex-1 h-full transition-all duration-300 ${isAnyModalOpen || showLogoutConfirm || showNotifications || isMobileMenuOpen ? 'modal-blur-active' : ''}`}>
        {/* Background Decoration */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[20%] -right-[10%] w-[60%] h-[60%] bg-primary/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute -bottom-[20%] -left-[10%] w-[60%] h-[60%] bg-primary/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '3s' }} />
        <div className="absolute top-1/4 left-1/4 w-[40%] h-[40%] bg-purple-500/5 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '1.5s' }} />
        <div className="absolute bottom-1/4 right-1/4 w-[40%] h-[40%] bg-orange-500/5 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '4.5s' }} />
      </div>

      <div className="flex flex-1 relative">
        {/* Desktop Sidebar */}
        <aside 
          className={`hidden md:flex flex-col ${isSidebarExpanded ? 'w-[280px]' : 'w-[80px]'} glass-card border-r border-gray-100 h-full sticky top-0 z-[60] transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] relative overflow-hidden shrink-0 shadow-2xl shadow-gray-200/50`}
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-purple-500 to-orange-500" />
          
          <div className={`${isSidebarExpanded ? 'p-6' : 'py-6 px-2'} flex items-center ${isSidebarExpanded ? 'justify-between' : 'justify-center'} gap-4 transition-all duration-300`}>
            <div className={`flex items-center ${isSidebarExpanded ? 'gap-3' : 'gap-0'} overflow-hidden`}>
              <button 
                onClick={() => {
                  setActiveTab('dashboard');
                  setIsSidebarExpanded(true);
                }}
                className="w-10 h-10 bg-whatsapp rounded-2xl flex items-center justify-center shadow-xl shadow-whatsapp/20 rotate-[-5deg] hover:rotate-0 transition-all duration-500 shrink-0 cursor-pointer active:scale-95"
              >
                <span className="text-white font-black text-lg italic">WA</span>
              </button>
              {isSidebarExpanded && (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2, duration: 0.4 }}
                  className="flex-1 min-w-0"
                >
                  <h1 className="text-lg font-black text-gray-900 tracking-tighter leading-none truncate">
                    WhatsApp Auto
                  </h1>
                  <p className="text-[8px] font-black text-indigo-600 uppercase tracking-widest mt-1">Created by OnDigix</p>
                </motion.div>
              )}
            </div>
            
            {isSidebarExpanded && (
              <button 
                onClick={() => setIsSidebarExpanded(false)}
                className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-all shrink-0"
              >
                <PanelLeftClose className="w-5 h-5" />
              </button>
            )}
          </div>

        <nav className={`flex-1 ${isSidebarExpanded ? 'px-3' : 'px-2'} space-y-2 overflow-y-auto overflow-x-hidden mt-4 transition-all duration-300 custom-scrollbar`}>
          {menuItems.map((item, index) => (
            <motion.button
              key={item.id}
              initial={isSidebarExpanded ? { opacity: 0, x: -10 } : {}}
              animate={isSidebarExpanded ? { opacity: 1, x: 0 } : {}}
              transition={{ delay: 0.3 + (index * 0.05) }}
              onClick={() => {
                setActiveTab(item.id);
                setIsSidebarExpanded(true);
              }}
              className={`w-full flex items-center ${isSidebarExpanded ? 'justify-between px-5' : 'justify-center'} py-4 rounded-2xl text-sm font-black uppercase tracking-widest transition-all relative group active:scale-[0.98] ${
                activeTab === item.id 
                  ? 'bg-white text-gray-900 shadow-xl shadow-gray-200/50 ring-1 ring-gray-100' 
                  : 'text-gray-400 hover:bg-white/50 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-4">
                <item.icon className={`w-5 h-5 transition-colors shrink-0 ${activeTab === item.id ? 'text-primary' : 'text-gray-300'}`} />
                {isSidebarExpanded && <span>{item.label}</span>}
              </div>
              {item.badge !== undefined && item.badge > 0 && (
                <span className={`bg-primary text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-lg shadow-primary/20 ${!isSidebarExpanded ? 'absolute -top-1 -right-1' : ''}`}>
                  {item.badge}
                </span>
              )}
              {!isSidebarExpanded && (
                <div className="absolute left-full ml-4 px-3 py-2 bg-gray-900 text-white text-[10px] font-black uppercase tracking-widest rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-all whitespace-nowrap z-[70]">
                  {item.label}
                </div>
              )}
            </motion.button>
          ))}
        </nav>

        <div className={`${isSidebarExpanded ? 'p-4' : 'py-4 px-2'} space-y-6 transition-all duration-300`}>
          <div 
            onClick={() => !isSidebarExpanded && setIsSidebarExpanded(true)}
            className={`flex items-center ${isSidebarExpanded ? 'justify-between px-2' : 'justify-center'} ${!isSidebarExpanded ? 'cursor-pointer hover:bg-gray-100 rounded-2xl p-1 transition-colors' : ''}`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center border border-white shadow-sm shrink-0">
                <UserCircle className="w-6 h-6 text-gray-400" />
              </div>
              {isSidebarExpanded && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="min-w-0"
                >
                  <p className="text-xs font-black text-gray-900 truncate">{userRole === 'super_admin' ? 'Super Admin' : 'Admin'}</p>
                  <p className="text-[10px] font-bold text-gray-400 truncate">Login: {localStorage.getItem('username') || 'Active Session'}</p>
                </motion.div>
              )}
            </div>
            {isSidebarExpanded && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setShowLogoutConfirm(true);
                }} 
                className="p-2.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                title="Logout"
              >
                <LogOut className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile Header - Removed for App Format */}

      {/* Main Content */}
      <main className="flex-1 h-full overflow-y-auto relative z-10 flex flex-col custom-scrollbar">
        <div className="flex-1 p-4 md:p-8">
          {children}
        </div>
      </main>
    </div>



    {/* User Touch Footer (Mobile Bottom Nav) - Removed for App Format */}
    </div>

    {/* Modals outside the blurred container */}
    <AnimatePresence>
      {isMobileMenuOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileMenuOpen(false)}
            className="md:hidden fixed inset-0 bg-black/20 backdrop-blur-sm z-[90]"
          />
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="md:hidden fixed top-0 left-0 bottom-0 w-[280px] bg-white z-[100] shadow-2xl flex flex-col"
          >
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-black text-sm italic">WA</span>
                </div>
                <h1 className="text-lg font-bold text-gray-900">WhatsApp Auto</h1>
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
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setShowLogoutConfirm(true);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-red-500 hover:bg-red-50 transition-all"
              >
                <LogOut className="w-5 h-5" />
                Logout
              </button>
            </div>
          </motion.div>
        </>
      )}

      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden border border-gray-100"
          >
            <div className="p-8">
              <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                <LogOut className="w-8 h-8 text-red-500" />
              </div>
              
              <h3 className="text-2xl font-black text-gray-900 text-center mb-4 uppercase tracking-tighter">
                Confirm Logout
              </h3>
              
              <p className="text-gray-500 text-center mb-8 font-medium leading-relaxed">
                Are you sure you want to logout? You will need to sign in again to access your account.
              </p>
              
              <div className="flex flex-col gap-3">
                <button
                  onClick={onLogout}
                  className="w-full py-4 bg-red-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-red-600 transition-all shadow-xl shadow-red-500/20"
                >
                  Yes, Logout
                </button>
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className="w-full py-4 bg-gray-100 text-gray-700 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gray-200 transition-all"
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
