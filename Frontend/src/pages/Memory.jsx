import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Search, Edit2, Trash2, Calendar } from 'lucide-react';

const DEMO_MEMORIES = [
  {
    id: 1,
    title: 'Architectural Synthesis',
    preview: 'Analysis of the Brutalist structure observed during the morning traversal. Reconstructing the geometry for the digital twin environment.',
    date: 'Oct 24, 2024'
  },
  {
    id: 2,
    title: 'Synaptic Synchronization',
    preview: 'Established a zero-latency link with the central processing unit. Logged 4GB of raw behavioral data for neural pattern matching.',
    date: 'Oct 22, 2024'
  },
  {
    id: 3,
    title: 'Initial Integration',
    preview: 'The primary digital twin instance was birthed. Initial data ingestion from legacy archives completed. Mirroring protocols initialized.',
    date: 'Sep 30, 2024'
  }
];

export default function Memory() {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-4xl mx-auto"
    >
      <header className="mb-10">
        <h1 className="text-4xl mb-2 text-white font-medium">Memory Archive</h1>
        <p className="text-xs text-zinc-500 font-bold uppercase tracking-[0.2em] mb-8">Chronological Records</p>
        
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
          <input 
            type="text" 
            placeholder="Search memories..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-950/50 border border-zinc-800 rounded-2xl py-4 pl-12 pr-4 text-white focus:outline-none focus:border-zinc-500 transition-colors"
          />
        </div>
      </header>

      <div className="space-y-4">
        {DEMO_MEMORIES.map((memory) => (
          <div key={memory.id} className="group p-6 border border-zinc-800 rounded-2xl bg-zinc-950/30 hover:bg-zinc-900/50 hover:border-zinc-700 transition-all flex flex-col md:flex-row md:items-start gap-4">
            <div className="flex-1">
              <h3 className="text-lg font-medium text-white mb-2">{memory.title}</h3>
              <p className="text-sm text-zinc-400 line-clamp-2 leading-relaxed mb-4">{memory.preview}</p>
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <Calendar size={14} />
                <span>{memory.date}</span>
              </div>
            </div>
            
            <div className="flex items-center gap-2 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
              <button className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors">
                <Edit2 size={16} />
              </button>
              <button className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
