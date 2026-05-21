import React from 'react';
import { motion } from 'motion/react';
import { MoreHorizontal } from 'lucide-react';

export function SyncItem({ icon: Icon, title, meta }) {
  return (
    <div className="flex items-center justify-between p-6 border border-border-subtle rounded-2xl group hover:bg-surface transition-all">
      <div className="flex items-center gap-6">
        <Icon size={20} className="text-zinc-600" />
        <div>
          <h4 className="text-white mb-1">{title}</h4>
          <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-medium">{meta}</p>
        </div>
      </div>
      <MoreHorizontal size={20} className="text-zinc-800 group-hover:text-zinc-400 transition-colors" />
    </div>
  );
}

export function DateMarker({ label }) {
  return (
    <div className="relative flex justify-center">
      <span className="px-6 py-2 bg-background border border-border-subtle rounded-full text-[10px] font-bold text-zinc-500 uppercase tracking-widest z-10">
        {label}
      </span>
    </div>
  );
}

export function TimelineItem({ side, date, title, content, tags, image, progress }) {
  return (
    <div className={`relative flex flex-col md:flex-row items-center w-full ${side === 'left' ? 'md:justify-start' : 'md:justify-end'}`}>
      <div className="hidden md:block absolute left-1/2 top-8 -translate-x-1/2 w-3 h-3 bg-background border border-white rounded-full z-20" />
      <div className={`w-full md:w-[45%] border border-border-subtle p-8 rounded-2xl hover:border-white transition-all group ${side === 'right' ? 'md:text-left' : ''}`}>
        <div className="flex justify-between items-center mb-4">
          <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">{date}</span>
          <MoreHorizontal size={14} className="text-zinc-800" />
        </div>
        
        {image && (
          <div className="mb-6 rounded-xl overflow-hidden border border-border-subtle grayscale opacity-60 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-700">
            <img src={image} className="w-full h-full object-cover" alt="Memory" />
          </div>
        )}

        <h3 className="text-2xl mb-4 group-hover:text-shadow-glow transition-all">{title}</h3>
        <p className="text-zinc-400 text-sm leading-relaxed mb-6">{content}</p>
        
        {tags && (
          <div className="flex gap-2">
            {tags.map((t) => (
              <span key={t} className="px-3 py-1 border border-border-subtle rounded text-[8px] font-bold text-zinc-600 uppercase tracking-widest">{t}</span>
            ))}
          </div>
        )}

        {progress !== undefined && (
          <div className="mt-4">
            <div className="w-full h-[1px] bg-border-subtle">
              <motion.div initial={{ width: 0 }} animate={{ width: `${progress}%` }} className="h-full bg-white shadow-glow" />
            </div>
            <p className="mt-2 text-[8px] text-zinc-600 uppercase tracking-[0.2em] font-bold">System_Status: Nominal</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function SelectionItem({ label, active }) {
  return (
    <div className={`p-4 border rounded-xl flex items-center justify-between cursor-pointer transition-all ${active ? 'border-white bg-white/5' : 'border-border-subtle hover:bg-white/[0.02]'}`}>
       <span className={`text-sm ${active ? 'text-white' : 'text-zinc-500'}`}>{label}</span>
       {active && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
    </div>
  );
}

export function ProfileField({ label, value }) {
  return (
    <div>
      <p className="text-[8px] text-zinc-600 font-bold uppercase tracking-widest mb-1">{label}</p>
      <p className="text-sm text-white">{value}</p>
    </div>
  );
}

export function MetricItem({ label, value }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-[8px] font-bold uppercase tracking-widest text-zinc-600">{label}</span>
      <span className="text-[10px] text-white tabular-nums">{value}</span>
    </div>
  );
}
