import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { Database, Activity, ArrowRight, MessageSquare, Brain } from 'lucide-react';
import { SyncItem } from '../components/ui/Cards';
import hero1 from '../assets/images/hero1.png';

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState({ twins: 0, memories: 0, conversations: 0, lastTwinName: null });

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;
        const res = await fetch('http://localhost:8000/auth/me', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setUser(data);
        }
      } catch (e) {
        console.error(e);
      }
    };

    const fetchStats = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;
        
        const res = await fetch('http://localhost:8000/twins', {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (res.ok) {
          const twinsData = await res.json();
          let memoryCount = 0;
          let lastTwinName = null;
          
          if (twinsData.length > 0) {
            const recentTwin = twinsData.reduce((prev, current) => (prev.id > current.id) ? prev : current);
            lastTwinName = recentTwin.name;
          }

          await Promise.all(twinsData.map(async (twin) => {
            try {
              const memRes = await fetch(`http://localhost:8000/memories/twin/${twin.id}`, {
                headers: { Authorization: `Bearer ${token}` }
              });
              if (memRes.ok) {
                const memData = await memRes.json();
                memoryCount += memData.length;
              }
            } catch (e) {}
          }));

          setStats({
            twins: twinsData.length,
            memories: memoryCount,
            conversations: 0,
            lastTwinName
          });
        }
      } catch (e) {
        console.error(e);
      }
    };

    fetchUser();
    fetchStats();
  }, []);

  return (
    <motion.div 
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -20, opacity: 0 }}
      className="space-y-12"
    >
      <header>
        <h1 className="text-5xl mb-4 leading-tight text-white">Welcome, {user?.name || 'User'}.</h1>
        <p className="text-zinc-500 text-lg max-w-2xl leading-relaxed">
          A new reflection awaits.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        <div className="md:col-span-8 group relative aspect-video border border-border-subtle rounded-2xl overflow-hidden bg-surface">
          <img src={hero1} className="absolute inset-0 w-full h-full object-cover opacity-20 group-hover:scale-105 transition-transform duration-1000" alt="Mirror" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
          <div className="absolute inset-0 p-12 flex flex-col justify-end">
            <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500 mb-2">Neural Connection</span>
            <h2 className="text-4xl mb-8 text-white">Talk to Twin</h2>
            <button 
              onClick={() => navigate('/voice')}
              className="w-fit px-10 py-3 border border-white text-xs text-white font-bold uppercase tracking-widest hover:bg-white hover:text-black transition-all"
            >
              Initiate Protocol
            </button>
          </div>
        </div>

        <div className="md:col-span-4 flex flex-col gap-8">
           <div className="flex-1 border border-border-subtle rounded-2xl p-8 hover:border-zinc-500 transition-colors flex flex-col justify-between group cursor-pointer bg-surface" onClick={() => navigate('/twins')}>
             <div>
               <div className="flex items-center gap-3 mb-6">
                 <Activity size={24} className="text-white" />
                 <h3 className="text-2xl text-white">Workspace Overview</h3>
               </div>
               
               <div className="space-y-2 mb-8">
                 <p className="text-sm text-white font-medium">{stats.twins} Twins Active</p>
                 <p className="text-sm text-zinc-400">{stats.memories} Memory Stored</p>
                 <p className="text-sm text-zinc-400">{stats.conversations} Conversations</p>
               </div>

               {stats.lastTwinName && (
                 <div className="mb-4">
                   <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Last activity:</p>
                   <p className="text-sm text-zinc-300">Created "{stats.lastTwinName}" Twin</p>
                 </div>
               )}
             </div>
             
             <button className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest flex items-center gap-2 group-hover:gap-4 group-hover:text-white transition-all mt-6">
                Open Twins <ArrowRight size={12} />
             </button>
           </div>
        </div>
      </div>

      <section>
        <div className="flex justify-between items-end mb-8">
          <h3 className="text-3xl text-white">Recent Syncs</h3>
          <button onClick={() => navigate('/memory')} className="text-[10px] text-zinc-500 hover:text-white transition-colors uppercase tracking-[0.2em]">View All History</button>
        </div>
        <div className="space-y-4">
          <SyncItem 
            icon={MessageSquare} 
            title="Conversation: Life Philosophy" 
            meta="Synchronized 2h ago • 14.2 MB" 
          />
          <SyncItem 
            icon={Brain} 
            title="Pattern Recognition: Productivity" 
            meta="Updated 6h ago • 2.1 MB" 
          />
          <SyncItem 
            icon={Database} 
            title="Visual Memory: Sunset at Marina" 
            meta="Uploaded Yesterday • 8.5 MB" 
          />
        </div>
      </section>
    </motion.div>
  );
}
