import React from 'react';
import { motion } from 'motion/react';

export function ToggleButton({ active }) {
  return (
    <button className={`w-12 h-6 rounded-full p-1 transition-all ${active ? 'bg-white' : 'bg-zinc-900 border border-border-subtle'}`}>
      <motion.div 
        animate={{ x: active ? 22 : 0 }} 
        className={`w-4 h-4 rounded-full ${active ? 'bg-black' : 'bg-zinc-700'}`} 
      />
    </button>
  );
}

export function VoiceControl({ icon: Icon, label, active, onClick }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-3 group">
      <div className={`w-16 h-16 rounded-full border flex items-center justify-center transition-all ${active ? 'border-white bg-white/5' : 'border-border-subtle group-hover:border-zinc-400'}`}>
        <Icon size={20} className={active ? 'text-white' : 'text-zinc-600 group-hover:text-white'} />
      </div>
      <span className={`text-[8px] font-bold uppercase tracking-[0.2em] transition-colors ${active ? 'text-white' : 'text-zinc-600 group-hover:text-zinc-400'}`}>{label}</span>
    </button>
  );
}
