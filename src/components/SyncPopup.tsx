import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Smartphone, X, Loader2 } from 'lucide-react';

interface SyncPopupProps {
  data: {
    sessionId: number;
    name: string;
    progress: number;
    message: string;
  } | null;
  onClose: () => void;
}

export default function SyncPopup({ data, onClose }: SyncPopupProps) {
  return (
    <AnimatePresence>
      {data && (
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.9 }}
          className="fixed bottom-6 right-6 z-[200] bg-white dark:bg-gray-900 rounded-[32px] shadow-[0_20px_50px_rgba(0,0,0,0.15)] border border-gray-100 dark:border-white/10 p-6 w-85 overflow-hidden"
        >
          {/* Background Glow */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/10 blur-[60px] rounded-full" />
          
          <div className="relative">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center relative">
                  <Smartphone className="w-6 h-6 text-primary" />
                  {data.progress < 100 && (
                    <div className="absolute -top-1 -right-1">
                      <div className="w-3 h-3 bg-primary rounded-full animate-ping" />
                      <div className="absolute inset-0 w-3 h-3 bg-primary rounded-full" />
                    </div>
                  )}
                </div>
                <div>
                  <h4 className="font-black text-gray-900 dark:text-white text-base tracking-tight">{data.name}</h4>
                  <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">
                    {data.progress >= 100 ? 'Sync Complete' : 'Syncing Data...'}
                  </p>
                </div>
              </div>
              {data.progress >= 100 && (
                <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl transition-colors">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-end">
                <div className="space-y-1">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Status</span>
                  <span className="text-xs font-bold text-gray-600 dark:text-gray-300 truncate max-w-[200px] block">
                    {data.message}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xl font-black text-gray-900 dark:text-white leading-none">{data.progress}%</span>
                </div>
              </div>

              <div className="h-2.5 bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden p-0.5">
                <motion.div
                  className={`h-full rounded-full ${data.progress >= 100 ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.4)]' : 'bg-primary shadow-[0_0_15px_rgba(var(--primary-rgb),0.4)]'}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${data.progress}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </div>

              {data.progress < 100 && (
                <div className="flex items-center gap-2 pt-1">
                  <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
                  <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">
                    Keep this tab open for faster sync
                  </p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
