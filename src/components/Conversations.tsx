import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageSquare, 
  User, 
  Clock, 
  Loader2, 
  Send, 
  Users, 
  Phone, 
  AlertCircle, 
  Paperclip, 
  Image as ImageIcon, 
  FileText, 
  Mic, 
  X, 
  Smartphone, 
  Plus, 
  Trash2,
  Search,
  MoreVertical,
  Check,
  CheckCheck,
  Smile,
  Video,
  Target,
  Zap,
  Bot,
  User as UserIcon,
  ChevronDown,
  ChevronLeft,
  Sparkles,
  RefreshCw,
  Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { apiFetch } from '../lib/api';
import { io } from 'socket.io-client';
// import { GoogleGenAI } from '@google/genai';
import QRCode from 'qrcode';

const socket = io();

interface Label {
  name: string;
  color: string;
}

interface Conversation {
  id: number;
  session_id: number;
  contact_number: string;
  profile_pic?: string;
  last_message?: string;
  last_message_at: string;
  session_number: string;
  agent_name: string;
  contact_name?: string;
  unread_count: number;
  is_saved: number;
  is_ordered: number;
  is_rated: number;
  is_audited: number;
  is_autopilot: number;
  platform: 'whatsapp' | 'facebook' | 'instagram';
  audit_status: 'none' | 'added' | 'audited';
  last_message_content?: string;
  last_message_type?: string;
  objective?: string;
  objective_progress?: number;
  labels?: Label[];
}

interface Contact {
  id: number;
  session_id: number;
  number: string;
  name?: string;
  session_number: string;
}

interface Message {
  id: number;
  conversation_id: number;
  sender: 'contact' | 'agent';
  content: string;
  type: string;
  transcription?: string;
  created_at: string;
}

interface ConversationsProps {
  token: string;
  initialConversationId?: number | null;
  onConversationSelected?: () => void;
}

export default function Conversations({ token, initialConversationId, onConversationSelected }: ConversationsProps) {
  const [activeTab, setActiveTab] = useState<'chats' | 'contacts'>('chats');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [qrCodes, setQrCodes] = useState<{ [key: string]: string }>({});
  const [qrModalSessionId, setQrModalSessionId] = useState<number | null>(null);
  const [selectedSessions, setSelectedSessions] = useState<number[]>([]);
  const [isAddingSession, setIsAddingSession] = useState(false);
  const [selectedAgentForSession, setSelectedAgentForSession] = useState('');
  const [sessionName, setSessionName] = useState('');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<string>('all');
  const [selectedConversation, setSelectedConversation] = useState<number | null>(null);
  const [activePlatform, setActivePlatform] = useState<'whatsapp' | 'facebook' | 'instagram'>('whatsapp');
  const [selectedConversations, setSelectedConversations] = useState<number[]>([]);
  const [isAuditBatchMode, setIsAuditBatchMode] = useState(false);
  const [socialAccounts, setSocialAccounts] = useState<any[]>([]);
  const [isConnectingSocial, setIsConnectingSocial] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<number | null>(null);
  const [selectedSessionsForBulk, setSelectedSessionsForBulk] = useState<number[]>([]);
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [syncingSessions, setSyncingSessions] = useState<Record<number, { status: string, progress: number, message?: string }>>({});
  const [isUpdatingObjective, setIsUpdatingObjective] = useState(false);
  const [tempObjective, setTempObjective] = useState('');
  const [isGlobalAutopilot, setIsGlobalAutopilot] = useState(true);

  const fetchGlobalAutopilot = async () => {
    try {
      const data = await apiFetch('/api/settings/autopilot');
      setIsGlobalAutopilot(data.is_global_autopilot);
    } catch (error) {
      console.error('Failed to fetch global autopilot setting');
    }
  };

  const handleToggleGlobalAutopilot = async () => {
    const newValue = !isGlobalAutopilot;
    setIsGlobalAutopilot(newValue);
    try {
      await apiFetch('/api/settings/autopilot', {
        method: 'POST',
        body: JSON.stringify({ is_global_autopilot: newValue }),
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('Failed to update global autopilot setting');
      setIsGlobalAutopilot(!newValue); // Rollback
    }
  };
  
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAutopilot, setIsAutopilot] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<'text' | 'image' | 'video' | 'audio' | 'document'>('text');
  const [showRightSidebar, setShowRightSidebar] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isEditingLabels, setIsEditingLabels] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newLabelColor, setNewLabelColor] = useState('bg-gray-100 text-gray-700 border-gray-200');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchConversations = async () => {
    try {
      const queryParams = selectedChannel !== 'all' ? `?sessionId=${selectedChannel}` : '';
      const data = await apiFetch(`/api/conversations${queryParams}`);
      setConversations(data);
      
      // Handle initial conversation ID from prop
      if (initialConversationId && !selectedConversation) {
        const conv = data.find((c: any) => c.id === initialConversationId);
        if (conv) {
          setSelectedConversation(initialConversationId);
          setSelectedSessionId(conv.session_id);
          setIsAutopilot(conv.is_autopilot === 1);
          if (onConversationSelected) onConversationSelected();
        }
      }
      
      // Handle URL ID parameter as fallback
      const urlParams = new URLSearchParams(window.location.search);
      const convId = urlParams.get('id');
      if (convId && !selectedConversation && !initialConversationId) {
        const id = parseInt(convId);
        const conv = data.find((c: any) => c.id === id);
        if (conv) {
          setSelectedConversation(id);
          setSelectedSessionId(conv.session_id);
          setIsAutopilot(conv.is_autopilot === 1);
        }
      }
      
      setError(null);
    } catch (error: any) {
      console.error('Failed to fetch conversations:', error);
      setError(`Failed to load conversations: ${error.message || 'Please check your connection.'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchContacts = async () => {
    try {
      const data = await apiFetch('/api/whatsapp/contacts');
      setContacts(data);
    } catch (error: any) {
      console.error('Failed to fetch contacts:', error);
      setError(`Failed to load contacts: ${error.message || 'Please check your connection.'}`);
    }
  };

  const fetchSessions = async () => {
    try {
      const data = await apiFetch('/api/whatsapp/sessions');
      // Sab sessions dikhao — connected, connecting, disconnected sab
      setSessions(data);
      const connectedSessions = data.filter((s: any) => s.status === 'connected');
      if (connectedSessions.length > 0 && !selectedSessionId) {
        setSelectedSessionId(connectedSessions[0].id);
      } else if (data.length === 0) {
        setSelectedSessionId(null);
        setSelectedConversation(null);
      }
    } catch (err: any) {
      console.error('Failed to fetch sessions:', err);
      setError(`Failed to load sessions: ${err.message || 'Please check your connection.'}`);
    }
  };

  const fetchAgents = async () => {
    try {
      const data = await apiFetch('/api/agents');
      setAgents(data);
    } catch (err: any) {
      console.error('Failed to fetch agents:', err);
      setError(`Failed to load agents: ${err.message || 'Please check your connection.'}`);
    }
  };

  const fetchSocialAccounts = async () => {
    try {
      const data = await apiFetch('/api/social/accounts');
      setSocialAccounts(data);
    } catch (error) {
      console.error('Failed to fetch social accounts');
    }
  };

  const handleBatchAudit = async (status: 'added' | 'audited') => {
    if (selectedConversations.length === 0) return;
    try {
      await apiFetch('/api/conversations/batch-audit', {
        method: 'POST',
        body: JSON.stringify({ ids: selectedConversations, status }),
        headers: { 'Content-Type': 'application/json' }
      });
      setConversations(prev => prev.map(c => 
        selectedConversations.includes(c.id) ? { ...c, audit_status: status } : c
      ));
      setSelectedConversations([]);
      setIsAuditBatchMode(false);
    } catch (error) {
      console.error('Failed to update batch audit status');
    }
  };

  const validateSessionForm = () => {
    const errors: Record<string, string> = {};
    if (!sessionName.trim()) errors.sessionName = 'WhatsApp name is required';
    if (!selectedAgentForSession) errors.selectedAgent = 'Please assign an agent';
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAddSession = async () => {
    if (!validateSessionForm()) return;
    try {
      const result = await apiFetch('/api/whatsapp/sessions', {
        method: 'POST',
        body: JSON.stringify({ 
          agent_id: parseInt(selectedAgentForSession),
          name: sessionName
        }),
        headers: { 'Content-Type': 'application/json' }
      });
      
      const newSessionId = result.id;
      fetchSessions();
      setIsAddingSession(false);
      setSelectedAgentForSession('');
      setSessionName('');
      setValidationErrors({});
      
      // Open QR Modal and start connection
      setQrModalSessionId(newSessionId);
      handleConnect(newSessionId);
    } catch (error) {
      console.error('Failed to add session');
    }
  };

  const handleDeleteSession = async (id: number) => {
    try {
      // Try to disconnect first for a cleaner exit
      const session = sessions.find(s => s.id === id);
      if (session && session.status === 'connected') {
        await apiFetch(`/api/whatsapp/sessions/${id}/disconnect`, { method: 'POST' }).catch(() => {});
      }

      await apiFetch(`/api/whatsapp/sessions/${id}`, {
        method: 'DELETE',
      });
      
      if (selectedSessionId === id) {
        setSelectedSessionId(null);
        setSelectedConversation(null);
        setMessages([]);
      }
      setSelectedSessionsForBulk(prev => prev.filter(sid => sid !== id));
      fetchSessions();
      setSessionToDelete(null);
    } catch (error) {
      console.error('Failed to delete session');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedSessionsForBulk.length === 0) return;
    try {
      for (const id of selectedSessionsForBulk) {
        // Try to disconnect first
        const session = sessions.find(s => s.id === id);
        if (session && session.status === 'connected') {
          await apiFetch(`/api/whatsapp/sessions/${id}/disconnect`, { method: 'POST' }).catch(() => {});
        }
        await apiFetch(`/api/whatsapp/sessions/${id}`, { method: 'DELETE' });
      }
      
      if (selectedSessionId && selectedSessionsForBulk.includes(selectedSessionId)) {
        setSelectedSessionId(null);
        setSelectedConversation(null);
        setMessages([]);
      }
      
      fetchSessions();
      setSelectedSessionsForBulk([]);
      setIsBulkMode(false);
    } catch (error) {
      console.error('Failed to perform bulk delete');
    }
  };

  const toggleSessionSelection = (id: number, e: React.MouseEvent | React.ChangeEvent) => {
    e.stopPropagation();
    setSelectedSessionsForBulk(prev => 
      prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedSessions.length === sessions.length) {
      setSelectedSessions([]);
    } else {
      setSelectedSessions(sessions.map(s => s.id));
    }
  };

  const handleConnect = async (id: number, force: boolean = false) => {
    try {
      const data = await apiFetch(`/api/whatsapp/sessions/${id}/connect`, {
        method: 'POST',
        body: JSON.stringify({ force }),
        headers: { 'Content-Type': 'application/json' }
      });
      if (data.qr) {
        const qrDataUrl = await QRCode.toDataURL(data.qr);
        setQrCodes(prev => ({ ...prev, [id]: qrDataUrl }));
      }
      fetchSessions();
    } catch (error) {
      console.error('Failed to connect');
    }
  };

  const fetchQrCode = async (id: number) => {
    try {
      const data = await apiFetch(`/api/whatsapp/sessions/${id}/qr`);
      if (data.qr) {
        const qrDataUrl = await QRCode.toDataURL(data.qr);
        setQrCodes(prev => ({ ...prev, [id]: qrDataUrl }));
      }
    } catch (error) {
      console.error('Failed to fetch QR');
    }
  };

  const handleDisconnect = async (id: number) => {
    try {
      await apiFetch(`/api/whatsapp/sessions/${id}/disconnect`, {
        method: 'POST',
      });
      fetchSessions();
    } catch (error) {
      console.error('Failed to disconnect');
    }
  };

  const fetchMessages = async (id: number) => {
    try {
      const data = await apiFetch(`/api/conversations/${id}/messages`);
      setMessages(data);
    } catch (error) {
      console.error('Failed to fetch messages');
    }
  };

  useEffect(() => {
    if (qrModalSessionId && !qrCodes[qrModalSessionId]) {
      fetchQrCode(qrModalSessionId);
    }
  }, [qrModalSessionId]);

  useEffect(() => {
    fetchConversations();
  }, [selectedChannel]);

  useEffect(() => {
    console.log('Connecting to socket...');
    socket.on('connect', () => console.log('Socket connected:', socket.id));
    socket.on('disconnect', () => console.log('Socket disconnected'));
    socket.on('connect_error', (err) => console.error('Socket connection error:', err));

    fetchContacts();
    fetchSessions();
    fetchAgents();
    fetchSocialAccounts();
    fetchGlobalAutopilot();

    socket.on('new_message', async (data) => {
      console.log('Received new message via socket:', data);
      
      // Update conversations list state directly for better performance
      setConversations(prev => {
        const index = prev.findIndex(c => c.id === data.conversation_id);
        if (index === -1) {
          // If conversation not in list, add it if we have enough info
          if (data.contact_number) {
            const newConv: Conversation = {
              id: data.conversation_id,
              session_id: data.session_id || 0,
              contact_number: data.contact_number,
              last_message_at: data.created_at,
              session_number: '', // Not strictly needed for display
              agent_name: 'AI Agent', // Default
              contact_name: data.contact_name,
              unread_count: data.unread_count || 1,
              is_saved: data.is_saved || 0,
              is_ordered: data.is_ordered || 0,
              is_rated: data.is_rated || 0,
              is_audited: data.is_audited || 0,
              is_autopilot: data.is_autopilot || 1,
              platform: data.platform || 'whatsapp',
              audit_status: data.audit_status || null
            };
            return [newConv, ...prev];
          }
          fetchConversations();
          return prev;
        }
        
        const updated = [...prev];
        const conv = { ...updated[index] };
        conv.last_message_at = data.created_at;
        
        if (data.contact_number) {
          conv.contact_number = data.contact_number;
        }
        
        // Update unread count if not selected
        if (selectedConversation !== data.conversation_id && data.sender === 'contact') {
          conv.unread_count = (data.unread_count !== undefined) ? data.unread_count : (conv.unread_count + 1);
        } else if (selectedConversation === data.conversation_id) {
          conv.unread_count = 0;
        }

        if (data.contact_name) {
          conv.contact_name = data.contact_name;
        }
        
        if (data.is_autopilot !== undefined) {
          conv.is_autopilot = data.is_autopilot;
          if (selectedConversation === data.conversation_id) {
            setIsAutopilot(data.is_autopilot === 1);
          }
        }
        
        updated.splice(index, 1);
        updated.unshift(conv); // Move to top
        return updated;
      });
      
      // If the new message belongs to the selected conversation, add it to the messages state
      if (selectedConversation === data.conversation_id) {
        setMessages(prev => {
          // Avoid duplicates
          if (prev.some(m => m.content === data.content && m.created_at === data.created_at)) {
            return prev;
          }
          return [...prev, {
            id: Date.now(), // Temporary ID
            ...data
          }];
        });
      }
    });

    socket.on('unread_reset', (data) => {
      setConversations(prev => prev.map(c => 
        c.id === parseInt(data.conversationId) ? { ...c, unread_count: 0 } : c
      ));
    });

    socket.on('qr', async ({ sessionId, qr }) => {
      try {
        const qrDataUrl = await QRCode.toDataURL(qr);
        setQrCodes(prev => ({ ...prev, [sessionId]: qrDataUrl }));
      } catch (e) {
        console.error('QR conversion failed:', e);
      }
    });

    socket.on('connection_status', ({ sessionId, status, number }) => {
      const sid = parseInt(sessionId);
      if (status === 'connected' || status === 'connecting') {
        fetchSessions();
      } else if (status === 'disconnected') {
        // If it's disconnected, remove it from the Inbox view
        setSessions(prev => {
          const filtered = prev.filter(s => s.id !== sid);
          if (selectedSessionId === sid) {
            setSelectedSessionId(filtered.length > 0 ? filtered[0].id : null);
            setSelectedConversation(null);
          }
          return filtered;
        });
        setConversations(prev => prev.filter(c => c.session_id !== sid));
        setContacts(prev => prev.filter(c => c.session_id !== sid));
      }
      
      if (status === 'connected') {
        setQrCodes(prev => {
          const newCodes = { ...prev };
          delete newCodes[sessionId];
          return newCodes;
        });
        // Don't close modal immediately if it's the one we're watching
        // The sync_status will handle showing progress in the modal
        // Refresh data when connected
        fetchConversations();
        fetchContacts();
      }
    });

    socket.on('sync_status', ({ sessionId, status, progress, message }) => {
      const sid = parseInt(sessionId);
      if (status === 'syncing') {
        setSyncingSessions(prev => ({ ...prev, [sid]: { status, progress: progress || 0, message } }));
      } else if (status === 'completed') {
        setSyncingSessions(prev => {
          const newState = { ...prev };
          delete newState[sid];
          return newState;
        });
        // Close modal if it was showing sync progress
        if (qrModalSessionId === sid) {
          setQrModalSessionId(null);
        }
        fetchConversations();
        fetchContacts();
        if (selectedConversation) {
          fetchMessages(selectedConversation);
        }
      } else if (status === 'error') {
        setSyncingSessions(prev => {
          const newState = { ...prev };
          delete newState[sid];
          return newState;
        });
        if (qrModalSessionId === sid) {
          setQrModalSessionId(null);
        }
      }
    });

    socket.on('session_disconnected', ({ sessionId }) => {
      const sid = parseInt(sessionId);
      setSessions(prev => prev.filter(s => s.id !== sid));
      setConversations(prev => prev.filter(c => c.session_id !== sid));
      setContacts(prev => prev.filter(c => c.session_id !== sid));
      if (selectedSessionId === sid) {
        setSelectedSessionId(null);
        setSelectedConversation(null);
      }
    });

    // WhatsApp.tsx se disconnect event listen karo
    const handleWADisconnect = (e: any) => {
      const sid = e.detail.sessionId;
      setSessions(prev => prev.filter(s => s.id !== sid));
      setConversations(prev => prev.filter(c => c.session_id !== sid));
      setContacts(prev => prev.filter(c => c.session_id !== sid));
      if (selectedSessionId === sid) {
        setSelectedSessionId(null);
        setSelectedConversation(null);
      }
    };
    window.addEventListener('whatsapp_disconnected', handleWADisconnect);

    return () => {
      socket.off('new_message');
      socket.off('unread_reset');
      socket.off('qr');
      socket.off('connection_status');
      socket.off('sync_status');
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
      window.removeEventListener('whatsapp_disconnected', handleWADisconnect);
    };
  }, [selectedConversation]);

  useEffect(() => {
    if (selectedConversation) {
      setIsMessagesLoading(true);
      fetchMessages(selectedConversation).finally(() => setIsMessagesLoading(false));
    }
  }, [selectedConversation]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newMessage.trim() && !selectedFile) || isSending || !selectedConversation) return;

    setIsSending(true);
    const conv = conversations.find(c => c.id === selectedConversation);
    if (!conv) return;

    try {
      const formData = new FormData();
      formData.append('sessionId', conv.session_id.toString());
      formData.append('jid', conv.contact_number);
      formData.append('text', newMessage);
      formData.append('type', selectedFile ? fileType : 'text');
      if (selectedFile) {
        formData.append('file', selectedFile);
      }

      const response = await fetch(conv.platform === 'whatsapp' ? '/api/whatsapp/send' : '/api/social/send', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          ...(conv.platform !== 'whatsapp' ? { 'Content-Type': 'application/json' } : {})
        },
        body: conv.platform === 'whatsapp' ? formData : JSON.stringify({
          platform: conv.platform,
          contact_number: conv.contact_number,
          text: newMessage
        }),
      });

      if (response.ok) {
        setNewMessage('');
        setSelectedFile(null);
        setFileType('text');
        fetchMessages(selectedConversation);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsSending(false);
    }
  };

  const generateAiSuggestion = async () => {
    if (!selectedConversation || !currentConv) return;
    setIsSending(true);
    try {
      const lastMessage = messages[messages.length - 1]?.content || 'Hello';
      
      const response = await fetch('/api/ai/suggestion', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId: currentConv.session_id,
          lastMessage
        })
      });
      
      if (!response.ok) throw new Error('Failed to fetch suggestion');
      const data = await response.json();
      setNewMessage(data.suggestion || '');
    } catch (err) {
      console.error('Failed to generate AI suggestion:', err);
    } finally {
      setIsSending(false);
    }
  };

  const updateConversationFlags = async (id: number, flags: { is_saved?: boolean, is_ordered?: boolean, is_rated?: boolean, is_audited?: boolean }) => {
    try {
      await fetch(`/api/conversations/${id}/flags`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(flags),
      });
      
      setConversations(prev => prev.map(c => 
        c.id === id ? { ...c, ...flags as any } : c
      ));
    } catch (err) {
      console.error('Failed to update flags:', err);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, type: typeof fileType) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setFileType(type);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/ogg; codecs=opus' });
        const file = new File([audioBlob], 'recording.ogg', { type: 'audio/ogg' });
        setSelectedFile(file);
        setFileType('audio');
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Failed to start recording:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const transcribeAudio = async (messageId: number, audioUrl: string) => {
    try {
      const response = await fetch(audioUrl);
      const blob = await response.blob();
      const base64Audio = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result?.toString().split(',')[1] || '');
        reader.readAsDataURL(blob);
      });

      const transcribeResp = await fetch('/api/transcribe', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          audio: base64Audio,
          mimeType: blob.type || "audio/mp3"
        })
      });

      if (!transcribeResp.ok) throw new Error('Transcription failed');
      const data = await transcribeResp.json();
      const transcription = data.text || '';
      
      // Update local state
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, transcription } : m));
      
      // Save to DB
      if (messageId) {
        await fetch(`/api/messages/${messageId}/transcription`, {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ transcription })
        });
      }
    } catch (err) {
      console.error('Failed to transcribe audio:', err);
    }
  };

  const updateObjective = async () => {
    if (!selectedConversation || !tempObjective.trim()) return;
    setIsUpdatingObjective(true);
    try {
      await apiFetch(`/api/conversations/${selectedConversation}/objective`, {
        method: 'PATCH',
        body: JSON.stringify({ objective: tempObjective }),
        headers: { 'Content-Type': 'application/json' }
      });
      setConversations(prev => prev.map(c => 
        c.id === selectedConversation ? { ...c, objective: tempObjective } : c
      ));
      setTempObjective('');
    } catch (err) {
      console.error('Failed to update objective:', err);
    } finally {
      setIsUpdatingObjective(false);
    }
  };

  const getAutoLabels = (conv: Conversation) => {
    const labels: { text: string, color: string }[] = [];
    
    // Customer - Green
    if (conv.is_saved === 1 || conv.is_ordered === 1) {
      labels.push({ text: 'Customer', color: 'bg-green-500 text-white border-green-600' });
    }

    // URL Received (Pending Audit) - Orange
    if (conv.audit_status === 'added' && conv.is_audited === 0) {
      labels.push({ text: 'URL Received', color: 'bg-orange-500 text-white border-orange-600' });
    }

    // Website Submitted (Free Audit) - Purple
    if (conv.audit_status === 'added') {
      labels.push({ text: 'Website Submitted', color: 'bg-purple-500 text-white border-purple-600' });
    }

    // Add manual labels if any
    if (conv.labels && Array.isArray(conv.labels)) {
      conv.labels.forEach(label => {
        if (!labels.find(l => l.text === label.name)) {
          labels.push({ text: label.name, color: label.color });
        }
      });
    }

    return labels;
  };

  const handleAddLabel = async (name: string, color: string) => {
    if (!selectedConversation || !name.trim()) return;
    const conv = conversations.find(c => c.id === selectedConversation);
    if (!conv) return;

    const currentLabels = conv.labels || [];
    if (currentLabels.find(l => l.name === name)) return;

    const updatedLabels = [...currentLabels, { name, color }];
    
    try {
      await apiFetch(`/api/conversations/${selectedConversation}/labels`, {
        method: 'PUT',
        body: JSON.stringify({ labels: updatedLabels }),
        headers: { 'Content-Type': 'application/json' }
      });
      
      setConversations(prev => prev.map(c => 
        c.id === selectedConversation ? { ...c, labels: updatedLabels } : c
      ));
      setNewLabel('');
    } catch (err) {
      console.error('Failed to add label:', err);
    }
  };

  const handleRemoveLabel = async (name: string) => {
    if (!selectedConversation) return;
    const conv = conversations.find(c => c.id === selectedConversation);
    if (!conv) return;

    const updatedLabels = (conv.labels || []).filter(l => l.name !== name);
    
    try {
      await apiFetch(`/api/conversations/${selectedConversation}/labels`, {
        method: 'PUT',
        body: JSON.stringify({ labels: updatedLabels }),
        headers: { 'Content-Type': 'application/json' }
      });
      
      setConversations(prev => prev.map(c => 
        c.id === selectedConversation ? { ...c, labels: updatedLabels } : c
      ));
    } catch (err) {
      console.error('Failed to remove label:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center space-y-4">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <p className="text-gray-900 font-bold">{error}</p>
        <button 
          onClick={fetchConversations}
          className="bg-primary text-white px-6 py-2 rounded-xl text-sm font-bold"
        >
          Retry
        </button>
      </div>
    );
  }

  const currentConv = conversations.find(c => c.id === selectedConversation);
  const selectedSession = sessions.find(s => s.id === selectedSessionId);
  const filteredConversations = conversations.filter(c => 
    c.platform === activePlatform &&
    (c.contact_name || c.contact_number).toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredContacts = selectedSession?.status === 'connected'
    ? contacts.filter(c => c.session_id === selectedSessionId)
    : [];

  return (
    <div className="flex flex-col min-h-[600px] h-[calc(100vh-64px)] bg-[#F8F9FB] rounded-3xl border border-gray-100 shadow-sm">
      {/* Platform Tabs */}
      <div className="flex items-center gap-1 p-2 bg-white border-b border-gray-100 shrink-0">
        {[
          { id: 'whatsapp', name: 'WhatsApp', icon: MessageSquare },
          { id: 'facebook', name: 'Facebook', icon: Users },
          { id: 'instagram', name: 'Instagram', icon: ImageIcon },
        ].map((platform) => (
          <button
            key={platform.id}
            onClick={() => {
              setActivePlatform(platform.id as any);
              setSelectedConversation(null);
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activePlatform === platform.id
                ? 'bg-primary/5 text-primary'
                : 'text-gray-400 hover:bg-gray-50'
            }`}
          >
            <platform.icon className="w-4 h-4" />
            {platform.name}
          </button>
        ))}
        <button
          onClick={() => setIsConnectingSocial(true)}
          className="p-2.5 bg-primary text-white rounded-xl hover:bg-primary/90 transition-all shadow-sm ml-1"
          title="Connect Social Account"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Sync Status Bar */}
      <AnimatePresence>
        {Object.keys(syncingSessions).length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-primary/10 border-b border-primary/20 px-4 py-2 flex items-center justify-between overflow-hidden"
          >
            <div className="flex items-center gap-3">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span className="text-xs font-bold text-primary">Loading chats...</span>
            </div>
            <div className="flex items-center gap-4">
              {Object.entries(syncingSessions).map(([sid, data]) => (
                <div key={sid} className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                    {sessions.find(s => s.id === parseInt(sid))?.name || 'WhatsApp'}
                  </span>
                  <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-primary"
                      initial={{ width: 0 }}
                      animate={{ width: `${data.progress}%` }}
                      transition={{ type: 'tween', ease: 'linear', duration: 0.5 }}
                    />
                  </div>
                  <span className="text-[10px] font-bold text-primary">{data.progress}%</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sessions Bar */}
      <div className="flex items-center gap-2 p-4 bg-white border-b border-gray-100 overflow-x-auto overflow-y-hidden scrollbar-hide shrink-0">
        <div className="flex items-center gap-2 flex-1">
          {sessions.map(session => (
            <div key={session.id} className="relative group flex items-center">
              {isBulkMode && (
                <input 
                  type="checkbox"
                  checked={selectedSessionsForBulk.includes(session.id)}
                  onChange={(e) => toggleSessionSelection(session.id, e)}
                  className="mr-2 w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary/20"
                />
              )}
              <div 
                onClick={() => {
                  if (isBulkMode) {
                    setSelectedSessionsForBulk(prev => 
                      prev.includes(session.id) ? prev.filter(sid => sid !== session.id) : [...prev, session.id]
                    );
                  } else {
                    setSelectedSessionId(session.id);
                    setSelectedConversation(null);
                  }
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    if (isBulkMode) {
                      setSelectedSessionsForBulk(prev => 
                        prev.includes(session.id) ? prev.filter(sid => sid !== session.id) : [...prev, session.id]
                      );
                    } else {
                      setSelectedSessionId(session.id);
                      setSelectedConversation(null);
                    }
                  }
                }}
                className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 border pr-8 relative cursor-pointer ${
                  selectedSessionId === session.id 
                    ? 'bg-primary/5 text-primary border-primary/20' 
                    : 'bg-white text-gray-500 border-gray-100 hover:border-gray-200'
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${session.status === 'connected' ? 'bg-[#00C853]' : 'bg-gray-300'}`} />
                {session.name || session.number || 'WhatsApp'}
                {session.status === 'disconnected' && (
                  <span 
                    onClick={(e) => {
                      e.stopPropagation();
                      setQrModalSessionId(session.id);
                      handleConnect(session.id);
                    }}
                    className="ml-1 text-[10px] bg-primary text-white px-2 py-0.5 rounded-lg"
                  >
                    Connect
                  </span>
                )}
                {session.status === 'connecting' && (
                  <span 
                    onClick={(e) => {
                      e.stopPropagation();
                      setQrModalSessionId(session.id);
                    }}
                    className="ml-1 text-[10px] bg-orange-500 text-white px-2 py-0.5 rounded-lg animate-pulse"
                  >
                    Connecting...
                  </span>
                )}
                {session.status === 'connected' && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      apiFetch(`/api/whatsapp/sessions/${session.id}/sync`, { method: 'POST' });
                    }}
                    className="ml-2 p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-all"
                    title="Sync Chats"
                  >
                    <RefreshCw className={`w-3 h-3 ${syncingSessions[session.id] ? 'animate-spin' : ''}`} />
                  </button>
                )}
              </div>

              {!isBulkMode && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSessionToDelete(session.id);
                  }}
                  className="absolute right-2 p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 transition-all text-gray-300"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
          <button 
            onClick={() => setIsAddingSession(true)}
            className="p-2 rounded-xl bg-gray-50 text-gray-400 border border-dashed border-gray-200 hover:bg-gray-100 transition-all"
            title="Add Session"
          >
            <Plus className="w-4 h-4" />
          </button>
          
          {sessions.some(s => s.status === 'connected') && (
            <button 
              onClick={() => {
                if (confirm('This will re-sync all connected WhatsApp sessions. Continue?')) {
                  sessions.filter(s => s.status === 'connected').forEach(s => {
                    apiFetch(`/api/whatsapp/sessions/${s.id}/sync`, { method: 'POST' });
                  });
                }
              }}
              className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-all flex items-center gap-2 text-xs font-bold px-4"
              title="Re-sync All Sessions"
            >
              <RefreshCw className={`w-4 h-4 ${Object.keys(syncingSessions).length > 0 ? 'animate-spin' : ''}`} />
              Re-sync All
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 ml-4">
          <div className="flex items-center gap-3 bg-gray-50 p-1.5 rounded-2xl border border-gray-100 mr-2">
            <div className="flex items-center gap-2 px-2">
              <div className={`w-2 h-2 rounded-full ${isGlobalAutopilot ? 'bg-primary animate-pulse' : 'bg-gray-300'}`} />
              <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Auto-Reply All</span>
              <button 
                onClick={handleToggleGlobalAutopilot}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${isGlobalAutopilot ? 'bg-primary' : 'bg-gray-200'}`}
              >
                <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${isGlobalAutopilot ? 'translate-x-5' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>
          {isBulkMode ? (
            <>
              <button 
                onClick={handleBulkDelete}
                disabled={selectedSessionsForBulk.length === 0}
                className="px-4 py-2 bg-red-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-red-500/20 disabled:opacity-50 flex items-center gap-2"
              >
                <Trash2 className="w-3 h-3" /> Delete ({selectedSessionsForBulk.length})
              </button>
              <button 
                onClick={() => {
                  setIsBulkMode(false);
                  setSelectedSessionsForBulk([]);
                }}
                className="px-4 py-2 bg-gray-100 text-gray-500 rounded-xl text-xs font-bold"
              >
                Cancel
              </button>
            </>
          ) : (
            <button 
              onClick={() => setIsBulkMode(true)}
              className="px-4 py-2 bg-gray-50 text-gray-500 border border-gray-200 rounded-xl text-xs font-bold hover:bg-gray-100 transition-all flex items-center gap-2"
            >
              <Trash2 className="w-3 h-3" /> Bulk Delete
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Chat List Column */}
        <div className={`w-full md:w-[320px] bg-white border-r border-gray-100 flex flex-col shrink-0 ${selectedConversation ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-4 space-y-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search"
                    className="w-full bg-[#F0F2F5] border-none rounded-xl py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <button 
                  onClick={() => setIsAuditBatchMode(!isAuditBatchMode)}
                  className={`p-2.5 rounded-xl transition-all ${isAuditBatchMode ? 'bg-purple-500 text-white' : 'bg-[#F0F2F5] text-gray-500 hover:bg-gray-200'}`}
                  title="Batch Audit"
                >
                  <Zap className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-gray-400" />
                <select 
                  value={selectedChannel}
                  onChange={(e) => setSelectedChannel(e.target.value)}
                  className="flex-1 bg-[#F0F2F5] border-none rounded-xl py-2 px-3 text-xs font-bold text-gray-700 focus:ring-2 focus:ring-primary/20 outline-none"
                >
                  <option value="all">All Channels</option>
                  {sessions.map(session => (
                    <option key={session.id} value={session.id}>
                      {session.name || session.number || `Channel ${session.id}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {isAuditBatchMode && (
              <div className="flex items-center gap-2 p-2 bg-purple-50/50 rounded-xl border border-purple-100">
                <span className="text-[10px] font-bold text-purple-600 px-2">
                  {selectedConversations.length} Selected
                </span>
                <div className="flex-1" />
                <button
                  onClick={() => handleBatchAudit('added')}
                  disabled={selectedConversations.length === 0}
                  className="px-2 py-1 bg-purple-500 text-white text-[10px] font-bold rounded-lg disabled:opacity-50"
                >
                  Mark Added
                </button>
                <button
                  onClick={() => handleBatchAudit('audited')}
                  disabled={selectedConversations.length === 0}
                  className="px-2 py-1 bg-blue-500 text-white text-[10px] font-bold rounded-lg disabled:opacity-50"
                >
                  Mark Audited
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            {filteredConversations.length > 0 ? (
              filteredConversations.map((conv) => (
                <div key={conv.id} className="relative group">
                  {isAuditBatchMode && (
                    <div className="absolute left-2 top-1/2 -translate-y-1/2 z-10">
                      <input
                        type="checkbox"
                        checked={selectedConversations.includes(conv.id)}
                        onChange={(e) => {
                          setSelectedConversations(prev => 
                            e.target.checked ? [...prev, conv.id] : prev.filter(id => id !== conv.id)
                          );
                        }}
                        className="w-4 h-4 rounded border-gray-300 text-purple-500 focus:ring-purple-500/20"
                      />
                    </div>
                  )}
                  <button
                    onClick={() => {
                      if (isAuditBatchMode) {
                        setSelectedConversations(prev => 
                          prev.includes(conv.id) ? prev.filter(id => id !== conv.id) : [...prev, conv.id]
                        );
                      } else {
                        setSelectedConversation(conv.id);
                        setIsAutopilot(conv.is_autopilot === 1);
                        setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c));
                      }
                    }}
                    className={`w-full p-4 text-left flex items-center gap-3 transition-all hover:bg-gray-50 relative ${
                      selectedConversation === conv.id ? 'bg-[#F0F2F5]' : ''
                    } ${isAuditBatchMode ? 'pl-10' : ''}`}
                  >
                    {/* Vertical Label Strip */}
                    <div className="absolute left-0 top-0 bottom-0 w-1 flex flex-col gap-0.5 py-1">
                      {getAutoLabels(conv).map((label, i) => (
                        <div 
                          key={i} 
                          className={`flex-1 w-full rounded-full ${label.color.split(' ')[0]}`} 
                          title={label.text}
                        />
                      ))}
                    </div>
                    <div className="relative shrink-0">
                      <div className="w-12 h-12 bg-gray-100 rounded-2xl overflow-hidden">
                        {conv.profile_pic ? (
                          <img 
                            src={conv.profile_pic} 
                            alt="" 
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <img 
                            src={`https://ui-avatars.com/api/?name=${conv.contact_name || 'Unknown'}&background=random`} 
                            alt="" 
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        )}
                      </div>
                      <div className={`absolute -bottom-1 -right-1 w-4 h-4 border-2 border-white rounded-full flex items-center justify-center ${
                        conv.audit_status === 'audited' ? 'bg-blue-500' : 
                        conv.audit_status === 'added' ? 'bg-purple-500' : 'bg-[#00C853]'
                      }`}>
                        {conv.audit_status !== 'none' ? (
                          <Sparkles className="w-2 h-2 text-white" />
                        ) : (
                          <MessageSquare className="w-2 h-2 text-white" />
                        )}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-0.5">
                        <div className="flex flex-col min-w-0">
                          <h4 className="font-bold text-sm text-gray-900 truncate flex items-center gap-2">
                            {conv.contact_name || 'Unknown'}
                            {conv.audit_status !== 'none' && (
                              <span className={`w-1.5 h-1.5 rounded-full ${conv.audit_status === 'audited' ? 'bg-blue-500' : 'bg-purple-500'}`} />
                            )}
                          </h4>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {getAutoLabels(conv).map((label, i) => (
                              <div 
                                key={i} 
                                title={label.text}
                                className={`w-2 h-2 rounded-full border border-white shadow-sm ${label.color.split(' ')[0]}`} 
                              />
                            ))}
                            {getAutoLabels(conv).length === 0 && (
                              <div className="w-2 h-2 rounded-full bg-gray-100 border border-white shadow-sm" />
                            )}
                          </div>
                        </div>
                        <span className="text-[10px] text-gray-400 shrink-0">
                          {new Date(conv.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <p className="text-xs text-gray-500 truncate max-w-[180px]">
                          {conv.unread_count > 0 ? (
                            <span className="text-gray-900 font-medium">New message...</span>
                          ) : (
                            conv.last_message || conv.last_message_content || 'No messages yet'
                          )}
                        </p>
                        {conv.unread_count > 0 && (
                          <div className="w-4 h-4 bg-primary text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                            {conv.unread_count}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                </div>
              ))
            ) : (
              <div className="p-12 text-center text-gray-400">
                <MessageSquare className="w-10 h-10 mx-auto mb-4 opacity-10" />
                <p className="text-xs font-bold">No chats found</p>
              </div>
            )}
          </div>
        </div>

        {/* Chat Area Column */}
        <div className={`flex-1 flex flex-col bg-white min-w-0 relative ${selectedConversation ? 'flex' : 'hidden md:flex'}`}>
          {selectedConversation ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b border-gray-100 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setSelectedConversation(null)}
                    className="md:hidden p-2 -ml-2 text-gray-400 hover:bg-gray-50 rounded-lg"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <div className="w-10 h-10 bg-gray-100 rounded-xl overflow-hidden">
                    <img 
                      src={`https://ui-avatars.com/api/?name=${currentConv?.contact_name || 'Unknown'}&background=random`} 
                      alt="" 
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-gray-900">
                      {currentConv?.contact_name || 'Unknown'}
                    </h3>
                    <p className="text-[10px] text-gray-400 font-medium">
                      {(currentConv?.contact_number || '').replace('@s.whatsapp.net','').replace('@g.us','')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setShowRightSidebar(!showRightSidebar)}
                    className={`p-2 rounded-xl transition-all ${showRightSidebar ? 'bg-primary/10 text-primary' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'}`}
                    title={showRightSidebar ? "Hide Details" : "Show Details"}
                  >
                    <Bot className="w-5 h-5" />
                  </button>
                  <div className="flex items-center gap-3 bg-gray-50 p-1.5 rounded-2xl border border-gray-100">
                    <div className="flex items-center gap-2 px-2">
                      <div className={`w-2 h-2 rounded-full ${isAutopilot && isGlobalAutopilot ? 'bg-[#00C853] animate-pulse' : 'bg-gray-300'}`} />
                      <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Auto-reply</span>
                      <button 
                        onClick={async () => {
                          if (!selectedConversation) return;
                          const newValue = !isAutopilot;
                          setIsAutopilot(newValue);
                          try {
                            await apiFetch(`/api/conversations/${selectedConversation}/flags`, {
                              method: 'PUT',
                              body: JSON.stringify({ is_autopilot: newValue ? 1 : 0 }),
                              headers: { 'Content-Type': 'application/json' }
                            });
                            setConversations(prev => prev.map(c => c.id === selectedConversation ? { ...c, is_autopilot: newValue ? 1 : 0 } : c));
                          } catch (err) {
                            console.error('Failed to update autopilot flag');
                          }
                        }}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${isAutopilot ? 'bg-[#00C853]' : 'bg-gray-200'}`}
                      >
                        <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${isAutopilot ? 'translate-x-5' : 'translate-x-1'}`} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 space-y-6 bg-whatsapp-pattern scroll-smooth">
                <div className="flex justify-center">
                  <span className="px-3 py-1 bg-white/80 backdrop-blur-sm border border-white/40 rounded-full text-[10px] font-bold text-gray-400 uppercase tracking-widest shadow-sm">
                    Yesterday
                  </span>
                </div>
                
                {messages.map((msg, idx) => (
                  <div 
                    key={msg.id} 
                    className={`flex ${msg.sender === 'agent' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[70%] space-y-1 ${msg.sender === 'agent' ? 'items-end' : 'items-start'}`}>
                      <div className={`p-4 rounded-2xl text-sm break-words whitespace-pre-wrap overflow-hidden ${
                        msg.sender === 'agent' 
                          ? 'bg-[#E1F5FE] text-gray-900 rounded-tr-none' 
                          : 'bg-white text-gray-900 rounded-tl-none border border-gray-100 shadow-sm'
                      }`}>
                        {msg.type === 'image' ? (
                          <div className="space-y-2">
                            <img src={msg.content} alt="WhatsApp Image" className="max-w-full rounded-lg" referrerPolicy="no-referrer" />
                          </div>
                        ) : msg.type === 'video' ? (
                          <video src={msg.content} controls className="max-w-full rounded-lg" />
                        ) : msg.type === 'audio' ? (
                          <div className="space-y-3 min-w-[200px]">
                            <audio src={msg.content} controls className="max-w-full" />
                            {msg.transcription ? (
                              <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-xs text-gray-600 italic leading-relaxed">
                                <span className="font-bold text-[10px] uppercase tracking-widest text-gray-400 block mb-1">Transcription</span>
                                {msg.transcription}
                              </div>
                            ) : (
                              <button 
                                onClick={() => transcribeAudio(msg.id, msg.content)}
                                className="flex items-center gap-2 text-[10px] font-bold text-primary uppercase tracking-widest hover:opacity-80 transition-all"
                              >
                                <RefreshCw className="w-3 h-3" /> Read Voice Message
                              </button>
                            )}
                          </div>
                        ) : msg.type === 'document' ? (
                          <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-100">
                            <FileText className="w-5 h-5 text-primary" />
                            <span className="text-xs font-medium truncate max-w-[200px]">{msg.content}</span>
                          </div>
                        ) : (
                          msg.content
                        )}
                      </div>
                      <div className="flex items-center gap-2 px-1">
                        <span className="text-[10px] text-gray-400 font-medium">
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {msg.sender === 'agent' && <CheckCheck className="w-3 h-3 text-[#00C853]" />}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Input Area */}
              <div className="p-4 bg-white border-t border-gray-100 shrink-0">
                <form onSubmit={handleSendMessage} className="space-y-3">
                  <div className="relative">
                    {isRecording ? (
                      <div className="w-full bg-red-50 border border-red-100 rounded-2xl p-4 flex items-center justify-between animate-pulse">
                        <div className="flex items-center gap-3">
                          <div className="w-3 h-3 bg-red-500 rounded-full animate-ping" />
                          <span className="text-sm font-black text-red-500 uppercase tracking-widest">Recording Voice... {formatTime(recordingTime)}</span>
                        </div>
                        <button 
                          type="button"
                          onClick={stopRecording}
                          className="w-10 h-10 bg-red-500 text-white rounded-xl flex items-center justify-center shadow-lg shadow-red-500/20"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <textarea
                          placeholder="Type here"
                          className="w-full bg-[#F8F9FB] border border-gray-100 rounded-2xl p-4 pr-12 text-sm min-h-[100px] resize-none focus:ring-2 focus:ring-primary/10 outline-none"
                          value={newMessage}
                          onChange={(e) => setNewMessage(e.target.value)}
                        />
                        {selectedFile && (
                          <div className="absolute top-2 left-2 right-12 bg-white p-2 rounded-xl border border-gray-100 flex items-center justify-between shadow-sm">
                            <div className="flex items-center gap-2">
                              {fileType === 'image' ? <ImageIcon className="w-4 h-4 text-primary" /> : <FileText className="w-4 h-4 text-primary" />}
                              <span className="text-[10px] font-bold truncate max-w-[150px]">{selectedFile.name}</span>
                            </div>
                            <button onClick={() => setSelectedFile(null)} className="text-gray-400 hover:text-red-500"><X className="w-3 h-3" /></button>
                          </div>
                        )}
                        <button 
                          type="submit"
                          disabled={isSending || (!newMessage.trim() && !selectedFile)}
                          className="absolute bottom-4 right-4 w-10 h-10 bg-[#00C853] text-white rounded-xl flex items-center justify-center shadow-lg shadow-[#00C853]/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                        >
                          <Send className="w-5 h-5" />
                        </button>
                      </>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <button 
                        type="button"
                        onClick={generateAiSuggestion}
                        className="bg-[#00C853] text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-[#00C853]/20"
                      >
                        Generate
                      </button>
                      <div className="flex items-center gap-2 text-gray-400">
                        <input 
                          type="file" 
                          ref={fileInputRef} 
                          className="hidden" 
                          onChange={(e) => handleFileSelect(e, fileType)} 
                        />
                        <button 
                          type="button" 
                          onClick={() => { setFileType('image'); fileInputRef.current?.click(); }}
                          className="p-2 hover:bg-gray-50 rounded-lg transition-all"
                        >
                          <ImageIcon className="w-5 h-5" />
                        </button>
                        <button 
                          type="button" 
                          onClick={() => { setFileType('video'); fileInputRef.current?.click(); }}
                          className="p-2 hover:bg-gray-50 rounded-lg transition-all"
                        >
                          <Video className="w-5 h-5" />
                        </button>
                        <button 
                          type="button" 
                          onClick={() => { setFileType('document'); fileInputRef.current?.click(); }}
                          className="p-2 hover:bg-gray-50 rounded-lg transition-all"
                        >
                          <Paperclip className="w-5 h-5" />
                        </button>
                        <button 
                          type="button" 
                          onClick={isRecording ? stopRecording : startRecording}
                          className={`p-2 rounded-lg transition-all ${isRecording ? 'bg-red-50 text-red-500' : 'hover:bg-gray-50'}`}
                        >
                          <Mic className={`w-5 h-5 ${isRecording ? 'animate-pulse' : ''}`} />
                        </button>
                      </div>
                    </div>
                  </div>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-gray-400">
              <div className="w-20 h-20 bg-gray-50 rounded-3xl flex items-center justify-center mb-6">
                <MessageSquare className="w-10 h-10 opacity-20" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Select a conversation</h3>
              <p className="text-sm max-w-xs mt-2">Choose a chat from the left to start messaging with your customers.</p>
            </div>
          )}
        </div>

        {/* Right Sidebar Column */}
        <AnimatePresence>
          {showRightSidebar && (
            <motion.div 
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 300, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute lg:relative right-0 top-0 bottom-0 z-30 lg:z-0 border-l border-gray-100 flex flex-col shrink-0 bg-white shadow-2xl lg:shadow-none overflow-hidden"
            >
              <div className="w-[300px] h-full p-6 space-y-8 relative flex flex-col overflow-y-auto overflow-x-hidden">
                {/* Close Button */}
                <button 
                  onClick={() => setShowRightSidebar(false)}
                  className="absolute top-4 right-4 p-2 text-gray-400 hover:bg-gray-50 rounded-lg transition-all"
                  title="Close Sidebar"
                >
                  <X className="w-5 h-5" />
                </button>

                {/* Agent Profile */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#E8F5E9] rounded-xl flex items-center justify-center text-[#00C853]">
                      <Bot className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-gray-900 flex items-center gap-1">
                        {agents.find(a => a.id === selectedSession?.agent_id)?.name || 'Agent'} <ChevronDown className="w-3 h-3 text-gray-400" />
                      </h4>
                      <p className="text-[10px] text-[#00C853] font-bold uppercase tracking-wider">
                        {selectedSession?.name || 'VINI ONLINE'}
                      </p>
                    </div>
                  </div>
                  <button className="p-2 text-gray-400 hover:bg-gray-50 rounded-lg transition-all">
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </div>

                {/* Labels Section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-indigo-500">
                      <Sparkles className="w-4 h-4" />
                      <span className="text-xs font-bold uppercase tracking-wider">Labels</span>
                    </div>
                    <button 
                      onClick={() => setIsEditingLabels(!isEditingLabels)}
                      className="p-1.5 hover:bg-gray-50 rounded-lg text-gray-400 transition-all"
                    >
                      <Plus className={`w-4 h-4 transition-transform ${isEditingLabels ? 'rotate-45' : ''}`} />
                    </button>
                  </div>
                  
                    <div className="flex flex-wrap gap-2">
                      {currentConv && getAutoLabels(currentConv).map((label, i) => (
                        <div key={i} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[10px] font-bold ${label.color} shadow-sm`}>
                          {label.text}
                          {isEditingLabels && (
                            <button 
                              onClick={() => handleRemoveLabel(label.text)}
                              className="hover:text-red-500 transition-colors"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ))}
                      {currentConv && getAutoLabels(currentConv).length === 0 && !isEditingLabels && (
                        <p className="text-[10px] text-gray-400 italic">No labels assigned</p>
                      )}
                    </div>

                  {isEditingLabels && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-3 pt-2"
                    >
                      <div className="flex gap-2">
                        <input 
                          type="text"
                          placeholder="Label name..."
                          className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-primary/20"
                          value={newLabel}
                          onChange={(e) => setNewLabel(e.target.value)}
                        />
                        <button 
                          onClick={() => handleAddLabel(newLabel, newLabelColor)}
                          disabled={!newLabel.trim()}
                          className="p-2 bg-primary text-white rounded-xl disabled:opacity-50"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { id: 'gray', color: 'bg-gray-100 text-gray-700 border-gray-200' },
                          { id: 'blue', color: 'bg-blue-100 text-blue-700 border-blue-200' },
                          { id: 'green', color: 'bg-green-100 text-green-700 border-green-200' },
                          { id: 'purple', color: 'bg-purple-100 text-purple-700 border-purple-200' },
                          { id: 'orange', color: 'bg-orange-100 text-orange-700 border-orange-200' },
                          { id: 'red', color: 'bg-red-100 text-red-700 border-red-200' }
                        ].map(c => (
                          <button
                            key={c.id}
                            onClick={() => setNewLabelColor(c.color)}
                            className={`w-6 h-6 rounded-full border-2 transition-all ${c.color} ${newLabelColor === c.color ? 'border-primary scale-110' : 'border-transparent'}`}
                          />
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { name: 'VIP', color: 'bg-purple-100 text-purple-700 border-purple-200' },
                          { name: 'Follow-up', color: 'bg-blue-100 text-blue-700 border-blue-200' },
                          { name: 'Interested', color: 'bg-orange-100 text-orange-700 border-orange-200' },
                          { name: 'Spam', color: 'bg-red-100 text-red-700 border-red-200' }
                        ].map(tag => (
                          <button
                            key={tag.name}
                            onClick={() => handleAddLabel(tag.name, tag.color)}
                            className={`px-2 py-1 border rounded-lg text-[9px] font-bold hover:opacity-80 transition-all ${tag.color}`}
                          >
                            {tag.name}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* Objective Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-purple-500">
                    <Zap className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">Objective</span>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                    {currentConv?.objective ? (
                      <div className="mb-4">
                        <p className="text-xs text-gray-600 font-medium leading-relaxed">
                          {currentConv.objective}
                        </p>
                      </div>
                    ) : (
                      <div className="mb-4 space-y-2">
                        <input 
                          type="text"
                          placeholder="Set conversation goal..."
                          className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-primary/20"
                          value={tempObjective}
                          onChange={(e) => setTempObjective(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && updateObjective()}
                        />
                        <button 
                          onClick={updateObjective}
                          disabled={isUpdatingObjective || !tempObjective.trim()}
                          className="w-full py-2 bg-primary text-white rounded-xl text-[10px] font-bold uppercase tracking-widest disabled:opacity-50"
                        >
                          {isUpdatingObjective ? 'Setting...' : 'Set Objective'}
                        </button>
                      </div>
                    )}

                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 text-orange-500">
                        <Clock className="w-3 h-3" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Objective Progress</span>
                        <AlertCircle className="w-3 h-3 text-gray-300" />
                      </div>
                      <span className="text-xs font-bold text-gray-900">{currentConv?.objective_progress || 0}%</span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${currentConv?.objective_progress || 0}%` }}
                        className="h-full bg-gradient-to-r from-orange-400 to-orange-600"
                      />
                    </div>
                  </div>
                </div>

                {/* Motivational Card */}
                <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6 pt-10">
                  <div className="relative">
                    <div className="w-32 h-32 bg-gray-50 rounded-full flex items-center justify-center">
                      <Sparkles className="w-12 h-12 text-gray-200" />
                    </div>
                    <motion.div 
                      animate={{ y: [0, -10, 0] }}
                      transition={{ repeat: Infinity, duration: 3 }}
                      className="absolute -top-2 -right-2 bg-white p-3 rounded-2xl shadow-xl border border-gray-100"
                    >
                      <MessageSquare className="w-6 h-6 text-[#00C853]" />
                    </motion.div>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-bold text-gray-900">Let's team up and win this client!</h4>
                    <p className="text-xs text-gray-500 leading-relaxed">
                      Use AI suggestions to provide fast and accurate responses.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {qrModalSessionId && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[32px] p-8 max-w-md w-full shadow-2xl text-center relative"
            >
              <button 
                onClick={() => setQrModalSessionId(null)}
                className="absolute top-6 right-6 p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
              
              <div className="mb-6">
                <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary mx-auto mb-4">
                  <Smartphone className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Link WhatsApp</h3>
                <p className="text-sm text-gray-500 mt-2">Scan the QR code below with your WhatsApp to connect.</p>
              </div>

              <div className="bg-gray-50 p-6 rounded-3xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center min-h-[280px]">
                {syncingSessions[qrModalSessionId] ? (
                  <div className="flex flex-col items-center gap-6 w-full px-4">
                    <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center text-primary animate-pulse">
                      <RefreshCw className="w-10 h-10 animate-spin" />
                    </div>
                    <div className="space-y-4 w-full">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-black uppercase tracking-widest text-primary">Syncing Contacts...</span>
                        <span className="text-xs font-black text-primary">{syncingSessions[qrModalSessionId].progress}%</span>
                      </div>
                      <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden shadow-inner">
                        <motion.div 
                          className="h-full bg-primary"
                          initial={{ width: 0 }}
                          animate={{ width: `${syncingSessions[qrModalSessionId].progress}%` }}
                          transition={{ type: 'tween', ease: 'linear', duration: 0.5 }}
                        />
                      </div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest animate-pulse">
                        {syncingSessions[qrModalSessionId].message || 'Please wait while we load your chat history...'}
                      </p>
                    </div>
                  </div>
                ) : qrCodes[qrModalSessionId] ? (
                  <div className="flex flex-col items-center gap-4">
                    <motion.img 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      src={qrCodes[qrModalSessionId]} 
                      alt="WhatsApp QR Code" 
                      className="w-full max-w-[200px] shadow-sm rounded-xl"
                    />
                    <button 
                      onClick={() => handleConnect(qrModalSessionId, true)}
                      className="text-[10px] font-bold text-primary uppercase tracking-widest hover:underline"
                    >
                      Refresh QR Code
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 animate-spin text-primary" />
                    <p className="text-xs font-bold text-gray-400">Generating QR Code...</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isAddingSession && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="bg-white rounded-[32px] p-8 max-w-md w-full shadow-2xl"
            >
              <h3 className="text-xl font-bold text-gray-900 mb-6">Add WhatsApp Session</h3>
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">WhatsApp Name <span className="text-red-500 ml-1">*Required</span></label>
                  <input
                    type="text"
                    placeholder="e.g. Sales Support"
                    className={`w-full bg-gray-50 border ${validationErrors.sessionName ? 'border-red-500' : 'border-gray-200'} rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-primary/20`}
                    value={sessionName}
                    onChange={(e) => setSessionName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Assign Agent <span className="text-red-500 ml-1">*Required</span></label>
                  <select
                    className={`w-full bg-gray-50 border ${validationErrors.selectedAgent ? 'border-red-500' : 'border-gray-200'} rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-primary/20`}
                    value={selectedAgentForSession}
                    onChange={(e) => setSelectedAgentForSession(e.target.value)}
                  >
                    <option value="">Select Agent</option>
                    {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={handleAddSession}
                    className="flex-1 bg-primary text-white py-3 rounded-xl font-bold text-sm shadow-lg shadow-primary/20"
                  >
                    Create Session
                  </button>
                  <button
                    onClick={() => setIsAddingSession(false)}
                    className="flex-1 bg-gray-100 text-gray-500 py-3 rounded-xl font-bold text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {sessionToDelete && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[32px] p-8 max-w-sm w-full shadow-2xl text-center"
            >
              <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center text-red-500 mx-auto mb-4">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">Delete Session?</h3>
              <p className="text-sm text-gray-500 mt-2 mb-8">
                Are you sure you want to delete this WhatsApp session? This action cannot be undone and all conversation history will be lost.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => handleDeleteSession(sessionToDelete)}
                  className="flex-1 bg-red-500 text-white py-3 rounded-xl font-bold text-sm shadow-lg shadow-red-500/20"
                >
                  Delete
                </button>
                <button
                  onClick={() => setSessionToDelete(null)}
                  className="flex-1 bg-gray-100 text-gray-500 py-3 rounded-xl font-bold text-sm"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isConnectingSocial && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-gray-800 rounded-[32px] p-8 max-w-md w-full shadow-2xl border border-white/20"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Connect Account</h2>
                <button 
                  onClick={() => setIsConnectingSocial(false)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
                >
                  <X className="w-6 h-6 text-gray-400" />
                </button>
              </div>

              <div className="space-y-4">
                <button
                  onClick={async () => {
                    // Mock Facebook Login
                    const mockAccount = {
                      platform: 'facebook',
                      account_id: 'fb_' + Date.now(),
                      name: 'Facebook User',
                      access_token: 'mock_token',
                      avatar: 'https://ui-avatars.com/api/?name=FB&background=1877F2&color=fff'
                    };
                    await apiFetch('/api/social/login', {
                      method: 'POST',
                      body: JSON.stringify(mockAccount),
                      headers: { 'Content-Type': 'application/json' }
                    });
                    fetchSocialAccounts();
                    setIsConnectingSocial(false);
                  }}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl bg-[#1877F2] text-white hover:bg-[#1877F2]/90 transition-all shadow-lg shadow-blue-500/20"
                >
                  <div className="p-2 bg-white/20 rounded-xl">
                    <Users className="w-6 h-6" />
                  </div>
                  <div className="text-left">
                    <p className="font-bold">Login with Facebook</p>
                    <p className="text-xs opacity-80">Connect your Facebook pages</p>
                  </div>
                </button>

                <button
                  onClick={async () => {
                    // Mock Instagram Login
                    const mockAccount = {
                      platform: 'instagram',
                      account_id: 'ig_' + Date.now(),
                      name: 'Instagram User',
                      access_token: 'mock_token',
                      avatar: 'https://ui-avatars.com/api/?name=IG&background=E4405F&color=fff'
                    };
                    await apiFetch('/api/social/login', {
                      method: 'POST',
                      body: JSON.stringify(mockAccount),
                      headers: { 'Content-Type': 'application/json' }
                    });
                    fetchSocialAccounts();
                    setIsConnectingSocial(false);
                  }}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white hover:opacity-90 transition-all shadow-lg shadow-pink-500/20"
                >
                  <div className="p-2 bg-white/20 rounded-xl">
                    <ImageIcon className="w-6 h-6" />
                  </div>
                  <div className="text-left">
                    <p className="font-bold">Login with Instagram</p>
                    <p className="text-xs opacity-80">Connect your Instagram business account</p>
                  </div>
                </button>
              </div>

              <p className="mt-6 text-center text-xs text-gray-400">
                By connecting, you agree to our terms of service and allow the bot to access your messages.
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}