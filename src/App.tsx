import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Layout from './components/Layout';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Agents from './components/Agents';
import WhatsApp from './components/WhatsApp';
import Conversations from './components/Conversations';
import Leads from './components/Leads';
import Campaigns from './components/Campaigns';
import Reports from './components/Reports';
import Bulk from './components/Bulk';
import Settings from './components/Settings';
import LoadingOverlay from './components/LoadingOverlay';

import SuperAdminLogin from './components/SuperAdminLogin';
import SuperAdminDashboard from './components/SuperAdminDashboard';
import SuperAdminOverview from './components/SuperAdminOverview';
import TokenTopupModal from './components/TokenTopupModal';
import socket from './lib/socket';

export default function App() {
  const [token, setToken] = useState<string | null>(() => {
    const saved = localStorage.getItem('token');
    return (saved === 'null' || saved === 'undefined') ? null : saved;
  });
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [isSuperAdminPath] = useState(() => window.location.pathname === '/super-admin');
  const [showTokenModal, setShowTokenModal] = useState(false);

  useEffect(() => {
    socket.on('token_limit_reached', () => {
      const userRole = localStorage.getItem('user_role');
      if (userRole !== 'super_admin') {
        setShowTokenModal(true);
      }
    });

    socket.on('navigate_to_tab', (tab: string) => {
      setActiveTab(tab);
    });

    socket.on('force_refresh', () => {
      window.location.reload();
    });

    return () => {
      socket.off('token_limit_reached');
      socket.off('navigate_to_tab');
      socket.off('force_refresh');
    };
  }, []);

  const handleLogin = (newToken: string) => {
    setToken(newToken);
    localStorage.setItem('token', newToken);
  };

  const handleLogout = () => {
    setToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user_role');
  };

  if (!token) {
    return (
      <>
        {isSuperAdminPath ? (
          <SuperAdminLogin onLogin={handleLogin} />
        ) : (
          <Login onLogin={handleLogin} />
        )}
        <LoadingOverlay />
      </>
    );
  }

  const userRole = localStorage.getItem('user_role');

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return userRole === 'super_admin' ? <SuperAdminOverview /> : <Dashboard token={token} />;
      case 'agents':
        return <Agents token={token} initialAgentId={selectedAgentId} onNavigate={setActiveTab} />;
      case 'leads':
        return <Leads onOpenChat={(id) => {
          setSelectedConversationId(id);
          setActiveTab('conversations');
        }} />;
      case 'campaigns':
        return <Campaigns />;
      case 'reports':
        return <Reports />;
      case 'whatsapp':
        return <WhatsApp token={token} />;
      case 'conversations':
        return <Conversations token={token} initialConversationId={selectedConversationId} onConversationSelected={() => setSelectedConversationId(null)} />;
      case 'bulk':
        return <Bulk token={token} />;
      case 'settings':
        return <Settings />;
      case 'admins':
        return <SuperAdminDashboard />;
      default:
        return <Dashboard token={token} />;
    }
  };

  return (
    <>
      <Layout 
        activeTab={activeTab} 
        setActiveTab={(tab) => {
          setActiveTab(tab);
          if (tab === 'agents') setSelectedAgentId(null);
        }} 
        onLogout={handleLogout}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="h-full"
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </Layout>
      <TokenTopupModal isOpen={showTokenModal} onClose={() => setShowTokenModal(false)} />
      <LoadingOverlay />
    </>
  );
}
