import React, { useState, useEffect } from 'react';
import { Send, Users, FileText, Clock, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { apiFetch } from '../lib/api';

interface BulkProps {
  token: string;
}

export default function Bulk({ token }: BulkProps) {
  const [campaignName, setCampaignName] = useState('');
  const [message, setMessage] = useState('');
  const [recipients, setRecipients] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!campaignName.trim()) errors.campaignName = 'Campaign name is required';
    if (!message.trim()) errors.message = 'Message content is required';
    if (!recipients.trim()) errors.recipients = 'Recipients are required';
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsLoading(true);
    setStatus('idle');

    const recipientList = recipients.split('\n').map(r => r.trim()).filter(r => r);

    try {
      await apiFetch('/api/bulk/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: campaignName,
          message,
          recipients: recipientList,
        }),
        heavy: true,
      });

      setStatus('success');
      setCampaignName('');
      setMessage('');
      setRecipients('');
    } catch (error) {
      console.error('Failed to schedule campaign:', error);
      setStatus('error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Bulk Messaging</h2>
        <p className="text-gray-500 text-sm">Send campaigns with rate limiting and human-like behavior</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white border border-gray-100 p-8 rounded-3xl shadow-xl shadow-gray-200/50 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-3 h-3" /> Campaign Name
            </label>
            <input
              type="text"
              className={`w-full bg-gray-50 border ${validationErrors.campaignName ? 'border-red-500' : 'border-gray-200'} rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all`}
              placeholder="Spring Course Promotion"
              value={campaignName}
              onChange={(e) => {
                setCampaignName(e.target.value);
                if (validationErrors.campaignName) setValidationErrors(prev => {
                  const next = { ...prev };
                  delete next.campaignName;
                  return next;
                });
              }}
            />
            {validationErrors.campaignName && <p className="text-[10px] text-red-500 font-bold">{validationErrors.campaignName}</p>}
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-3 h-3" /> Delay Control
            </label>
            <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl p-3">
              <span className="text-xs font-bold text-primary">Randomized: 10-30s</span>
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
            <MessageSquare className="w-3 h-3" /> Message Content
          </label>
          <textarea
            className={`w-full bg-gray-50 border ${validationErrors.message ? 'border-red-500' : 'border-gray-200'} rounded-xl p-3 text-sm h-32 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all`}
            placeholder="Hello! We are excited to announce our new SEO course..."
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              if (validationErrors.message) setValidationErrors(prev => {
                const next = { ...prev };
                delete next.message;
                return next;
              });
            }}
          />
          {validationErrors.message && <p className="text-[10px] text-red-500 font-bold">{validationErrors.message}</p>}
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
            <Users className="w-3 h-3" /> Recipients (One number per line)
          </label>
          <textarea
            className={`w-full bg-gray-50 border ${validationErrors.recipients ? 'border-red-500' : 'border-gray-200'} rounded-xl p-3 text-sm h-48 font-mono focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all`}
            placeholder="Enter phone numbers here (one per line)..."
            value={recipients}
            onChange={(e) => {
              setRecipients(e.target.value);
              if (validationErrors.recipients) setValidationErrors(prev => {
                const next = { ...prev };
                delete next.recipients;
                return next;
              });
            }}
          />
          {validationErrors.recipients && <p className="text-[10px] text-red-500 font-bold">{validationErrors.recipients}</p>}
        </div>

        <AnimatePresence>
          {status === 'success' && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl flex items-center gap-3 text-emerald-600"
            >
              <CheckCircle2 className="w-5 h-5" />
              <span className="text-xs font-bold uppercase tracking-wider">Campaign Scheduled Successfully</span>
            </motion.div>
          )}
          {status === 'error' && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-red-50 border border-red-100 p-4 rounded-xl flex items-center gap-3 text-red-600"
            >
              <AlertCircle className="w-5 h-5" />
              <span className="text-xs font-bold uppercase tracking-wider">Failed to Schedule Campaign</span>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-4 bg-primary text-white font-bold uppercase tracking-widest text-xs rounded-xl shadow-lg shadow-primary/20 hover:bg-primary-hover active:scale-[0.98] transition-all flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <Send className="w-4 h-4" />
              Launch Campaign
            </>
          )}
        </button>
      </form>
    </div>
  );
}

function MessageSquare(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
