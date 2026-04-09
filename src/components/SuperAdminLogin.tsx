import React, { useState } from 'react';
import { Shield, Lock, User, Loader2, Key } from 'lucide-react';
import { motion } from 'motion/react';

interface SuperAdminLoginProps {
  onLogin: (token: string) => void;
}

export default function SuperAdminLogin({ onLogin }: SuperAdminLoginProps) {
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [securityKey, setSecurityKey] = useState('');
  const [pin, setPin] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccess('');

    if (mode === 'login') {
      try {
        const response = await fetch('/api/auth/super-admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, securityKey }),
        });

        const data = await response.json();

        if (response.ok) {
          localStorage.setItem('user_role', data.role);
          onLogin(data.token);
        } else {
          setError(data.error || 'Authentication failed');
        }
      } catch (err) {
        setError('Connection error');
      } finally {
        setIsLoading(false);
      }
    } else {
      try {
        const response = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, pin, newPassword }),
        });

        const data = await response.json();

        if (response.ok) {
          setSuccess('Password reset successfully. You can now sign in.');
          setMode('login');
          setPin('');
          setNewPassword('');
        } else {
          setError(data.error || 'Reset failed');
        }
      } catch (err) {
        setError('Connection error');
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full bg-gray-800 rounded-3xl shadow-2xl p-8 border border-gray-700"
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-indigo-500/20">
            <Shield className="w-8 h-8 text-indigo-400" />
          </div>
          <h1 className="text-2xl font-black text-white uppercase tracking-tighter">
            Ondigix
          </h1>
          <p className="text-indigo-400 text-[10px] font-black uppercase tracking-widest mt-1">
            WhatsApp Auto Create by Ondigix
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
              <User className="w-3 h-3" /> Username
            </label>
            <input
              type="text"
              className="w-full bg-gray-700 border border-gray-600 rounded-xl p-3 text-sm text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
              placeholder="najam786ali@yahoo.com"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          {mode === 'login' ? (
            <>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                  <Lock className="w-3 h-3" /> Password
                </label>
                <input
                  type="password"
                  className="w-full bg-gray-700 border border-gray-600 rounded-xl p-3 text-sm text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                  <Key className="w-3 h-3" /> Security Key
                </label>
                <input
                  type="password"
                  className="w-full bg-gray-700 border border-gray-600 rounded-xl p-3 text-sm text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                  placeholder="••••••••"
                  value={securityKey}
                  onChange={(e) => setSecurityKey(e.target.value)}
                  required
                />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                  <Lock className="w-3 h-3" /> Security Pin
                </label>
                <input
                  type="password"
                  className="w-full bg-gray-700 border border-gray-600 rounded-xl p-3 text-sm text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                  placeholder="Enter pin"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                  <Lock className="w-3 h-3" /> New Password
                </label>
                <input
                  type="password"
                  className="w-full bg-gray-700 border border-gray-600 rounded-xl p-3 text-sm text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </div>
            </>
          )}

          {error && (
            <p className="text-red-400 text-xs font-medium text-center">{error}</p>
          )}

          {success && (
            <p className="text-green-400 text-xs font-medium text-center">{success}</p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-4 bg-indigo-600 text-white font-bold uppercase tracking-widest text-xs rounded-xl shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              mode === 'login' ? 'Authorize Access' : 'Reset Password'
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => {
              setMode(mode === 'login' ? 'forgot' : 'login');
              setError('');
              setSuccess('');
            }}
            className="text-xs font-bold text-indigo-400 hover:underline uppercase tracking-wider"
          >
            {mode === 'login' ? "Forgot Password?" : "Back to Sign In"}
          </button>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-700 text-center">
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
            Secure Environment • AI Automation System
          </p>
        </div>
      </motion.div>
    </div>
  );
}
