import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { loadingManager } from '../lib/loading';

export default function LoadingOverlay() {
  const [state, setState] = useState({ isLoading: false, progress: 0, message: 'Please wait...', isError: false });

  useEffect(() => {
    return loadingManager.subscribe((isLoading, progress, message, isError) => {
      setState({ isLoading, progress, message, isError });
    });
  }, []);

  return (
    <AnimatePresence>
      {state.isLoading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-white rounded-[2.5rem] p-12 max-w-md w-full mx-4 shadow-2xl flex flex-col items-center text-center gap-8 relative"
          >
            {state.isError && (
              <button 
                onClick={() => loadingManager.setLoading(false)}
                className="absolute top-6 right-6 p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <Loader2 className="w-6 h-6 text-gray-400 rotate-45" />
              </button>
            )}

            <div className="relative">
              <div className={`w-24 h-24 rounded-full border-4 ${state.isError ? 'border-red-100' : 'border-gray-100'} flex items-center justify-center`}>
                <Loader2 className={`w-10 h-10 ${state.isError ? 'text-red-500' : 'text-primary'} ${state.isError ? '' : 'animate-spin'}`} />
              </div>
              {!state.isError && (
                <svg className="absolute inset-0 w-24 h-24 -rotate-90">
                  <circle
                    cx="48"
                    cy="48"
                    r="44"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="4"
                    className="text-primary"
                    strokeDasharray={276}
                    strokeDashoffset={276 - (276 * state.progress) / 100}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 0.5s ease-out' }}
                  />
                </svg>
              )}
            </div>

            <div className="space-y-2">
              <h3 className={`text-xl font-black uppercase tracking-widest ${state.isError ? 'text-red-500' : 'text-gray-900'}`}>
                {state.message}
              </h3>
              <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">
                {state.isError ? 'Action required' : 'System is processing your request'}
              </p>
            </div>

            {!state.isError && (
              <div className="w-full space-y-3">
                <div className="flex justify-between items-end">
                  <span className="text-[10px] font-black uppercase tracking-widest text-primary">Progress</span>
                  <span className="text-2xl font-black text-gray-900">{state.progress}%</span>
                </div>
                <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden p-1">
                  <motion.div
                    className="h-full bg-primary rounded-full shadow-[0_0_10px_rgba(var(--primary-rgb),0.5)]"
                    initial={{ width: 0 }}
                    animate={{ width: `${state.progress}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </div>
            )}

            <div className={`p-4 ${state.isError ? 'bg-red-50' : 'bg-primary/5'} rounded-2xl border ${state.isError ? 'border-red-100' : 'border-primary/10'}`}>
              <p className={`text-[10px] font-bold ${state.isError ? 'text-red-500' : 'text-primary'} uppercase tracking-widest leading-relaxed`}>
                {state.isError ? 'Please resolve the issue to continue.' : 'To prevent data loss, all functions are temporarily disabled.'}
              </p>
            </div>

            {state.isError && (
              <button
                onClick={() => loadingManager.setLoading(false)}
                className="w-full py-4 bg-red-500 hover:bg-red-600 text-white rounded-2xl font-black uppercase tracking-widest transition-all shadow-lg shadow-red-500/25"
              >
                Dismiss
              </button>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
