import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, MessageSquare, X } from 'lucide-react';

interface TokenTopupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function TokenTopupModal({ isOpen, onClose }: TokenTopupModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden border border-gray-100"
          >
            <div className="p-8">
              <div className="flex justify-end mb-2">
                <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-all">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>
              
              <div className="w-20 h-20 bg-orange-50 rounded-[2rem] flex items-center justify-center mb-6 mx-auto">
                <AlertCircle className="w-10 h-10 text-orange-500" />
              </div>
              
              <h3 className="text-2xl font-black text-gray-900 text-center mb-4 uppercase tracking-tighter">
                Tokens Exhausted
              </h3>
              
              <p className="text-gray-500 text-center mb-8 font-medium leading-relaxed">
                Your AI agent has run out of tokens. To continue using the automation features, please top up your account.
              </p>
              
              <div className="bg-indigo-50 rounded-2xl p-6 mb-8 border border-indigo-100">
                <p className="text-xs font-black text-indigo-600 uppercase tracking-widest mb-2 text-center">Contact for Top-up</p>
                <div className="flex items-center justify-center gap-3">
                  <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/20">
                    <MessageSquare className="text-white w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-black text-gray-900">WhatsApp Auto Team</p>
                    <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Official Support</p>
                  </div>
                </div>
              </div>
              
              <button
                onClick={() => window.open('https://wa.me/your_whatsapp_number', '_blank')}
                className="w-full py-4 bg-gray-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gray-800 transition-all shadow-xl shadow-gray-900/20 flex items-center justify-center gap-2"
              >
                <MessageSquare className="w-4 h-4" />
                Contact on WhatsApp
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
