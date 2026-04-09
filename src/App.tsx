import React, { useState, useEffect } from 'react';
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

export default function App() {
  const [token, setToken] = useState<string | null>(() => {
    const saved = localStorage.getItem('token');
    return (saved === 'null' || saved === 'undefined') ? null : saved;
  });
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [isSuperAdminPath] = useState(() => window.location.pathname === '/super-admin');

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

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard token={token} />;
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
        {renderContent()}
      </Layout>
      <LoadingOverlay />
    </>
  );
}
