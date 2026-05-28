import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { Activity, ArrowRight, MessageSquare, X } from 'lucide-react';
import hero1 from '../assets/images/hero1.png';
import etherealFace from '../assets/images/ethereal_face.png';

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { y: 20, opacity: 0, scale: 0.9 },
  show: { y: 0, opacity: 1, scale: 1, transition: { type: "spring", stiffness: 120, damping: 15 } }
};

const parseUTCDate = (dateStr) => {
  if (!dateStr) return new Date();
  const cleanStr = dateStr.includes('Z') || dateStr.includes('+') ? dateStr : `${dateStr.replace(' ', 'T')}Z`;
  return new Date(cleanStr);
};

const timeAgo = (dateStr) => {
  const now = new Date();
  const date = parseUTCDate(dateStr);
  const diffMs = now - date;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState({ twins: 0, memories: 0, conversations: 0, lastTwinName: null });
  const [recentConversations, setRecentConversations] = useState([]);
  const [selectedConv, setSelectedConv] = useState(null);
  const [twinMap, setTwinMap] = useState({});
  const [twins, setTwins] = useState([]);
  const [showProtocolPopup, setShowProtocolPopup] = useState(false);

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
          let conversationCount = 0;
          let lastTwinName = null;
          let allConversations = [];
          const twinNameMap = {};
          
          if (twinsData.length > 0) {
            const recentTwin = twinsData.reduce((prev, current) => (prev.id > current.id) ? prev : current);
            lastTwinName = recentTwin.name;
          }

          // Build a twin name map for conversation display
          twinsData.forEach(t => { twinNameMap[t.id] = t.name; });
          setTwinMap(twinNameMap);
          setTwins(twinsData);

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

            try {
              const convoRes = await fetch(`http://localhost:8000/conversations/twin/${twin.id}`, {
                headers: { Authorization: `Bearer ${token}` }
              });
              if (convoRes.ok) {
                const convoData = await convoRes.json();
                conversationCount += convoData.length;
                // Tag each conversation with the twin name for display
                const tagged = convoData.map(c => ({ ...c, twinName: twin.name }));
                allConversations = allConversations.concat(tagged);
              }
            } catch (e) {}
          }));

          // Sort by most recent first, take top 4
          allConversations.sort((a, b) => parseUTCDate(b.created_at) - parseUTCDate(a.created_at));
          setRecentConversations(allConversations.slice(0, 2));

          setStats({
            twins: twinsData.length,
            memories: memoryCount,
            conversations: conversationCount,
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

  const getPreviewLine = (conv) => {
    if (!conv.messages || conv.messages.length === 0) return 'No messages yet';
    const firstMsg = conv.messages[0];
    const prefix = firstMsg.role === 'user' ? 'You' : (conv.twinName || 'Twin');
    const text = firstMsg.message || '';
    return `${prefix}: ${text.length > 80 ? text.slice(0, 80) + '…' : text}`;
  };

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
              onClick={() => setShowProtocolPopup(true)}
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
        <div className="mb-8">
          <h3 className="text-3xl text-white">Recent Conversations</h3>
        </div>
        
        {recentConversations.length === 0 ? (
          <div className="p-8 border border-border-subtle rounded-2xl text-center">
            <MessageSquare size={32} className="text-zinc-700 mx-auto mb-4" />
            <p className="text-zinc-500 text-sm">No conversations yet. Start a voice chat with one of your twins.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {recentConversations.map((conv, idx) => (
              <div 
                key={conv.id} 
                onClick={() => setSelectedConv(conv)}
                className="p-5 border border-border-subtle rounded-2xl bg-surface hover:border-zinc-500 transition-all cursor-pointer group"
                style={{ opacity: idx === 0 ? 1 : 0.5 }}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                      <MessageSquare size={14} className="text-zinc-400" />
                    </div>
                    <h4 className="text-white font-medium group-hover:text-emerald-400 transition-colors truncate">{conv.title || 'Conversation'}</h4>
                  </div>
                </div>
                <p className="text-xs text-zinc-400 line-clamp-1 mb-2 ml-11">{getPreviewLine(conv)}</p>
                <div className="flex items-center gap-3 ml-11">
                  <span className="text-[10px] text-zinc-600 uppercase tracking-wider font-medium">{conv.twinName}</span>
                  <span className="text-[10px] text-zinc-700">•</span>
                  <span className="text-[10px] text-zinc-600">{timeAgo(conv.created_at)}</span>
                  <span className="text-[10px] text-zinc-700">•</span>
                  <span className="text-[10px] text-zinc-600">{conv.messages?.length || 0} msgs</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Conversation Detail Popup ─────────────────────────────────────── */}
      <AnimatePresence>
        {selectedConv && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-10"
            onClick={() => setSelectedConv(null)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.95, opacity: 0 }} 
              onClick={e => e.stopPropagation()}
              className="w-full max-w-2xl max-h-full bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
                <div>
                  <h3 className="text-lg text-white font-medium">{selectedConv.title || 'Conversation'}</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    with {selectedConv.twinName || 'Twin'} • {parseUTCDate(selectedConv.created_at).toLocaleString()}
                  </p>
                </div>
                <button onClick={() => setSelectedConv(null)} className="text-zinc-400 hover:text-white transition-colors">
                  <X size={20} />
                </button>
              </div>
              
              <div className="p-4 overflow-y-auto flex-1 space-y-4">
                {selectedConv.messages?.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-3 relative ${
                      msg.role === 'user' 
                        ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-50' 
                        : 'bg-zinc-900 border border-zinc-800 text-zinc-200'
                    }`}>
                      <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                      <span className="text-[10px] opacity-50 block mt-2 text-right">
                        {parseUTCDate(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Protocol Select Twin Popup ─────────────────────────────────────── */}
      <AnimatePresence>
        {showProtocolPopup && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md px-4 py-10"
            onClick={() => setShowProtocolPopup(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20, opacity: 0 }} 
              animate={{ scale: 1, y: 0, opacity: 1 }} 
              exit={{ scale: 0.9, y: 20, opacity: 0 }} 
              transition={{ type: "spring", duration: 0.5 }}
              onClick={e => e.stopPropagation()}
              className="w-[90vw] md:w-[75vw] lg:w-[70vw] h-[80vh] md:h-[70vh] bg-zinc-950 border border-zinc-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden relative animate-fade-in"
            >
              {/* Decorative glows */}
              <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none" />
              <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />
              
              {/* Scan grid */}
              <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:30px_30px] [mask-image:radial-gradient(ellipse_at_center,black_60%,transparent_100%)] pointer-events-none" />

              {/* Header */}
              <div className="p-6 md:p-8 border-b border-zinc-900 flex justify-between items-center bg-zinc-950/50 z-10">
                <div className="flex items-center gap-4">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500 block mb-0.5">Neural Connection Protocol</span>
                    <h3 className="text-xl md:text-2xl text-white font-medium tracking-tight">SELECT TARGET IDENTITY</h3>
                  </div>
                </div>
                <button 
                  onClick={() => setShowProtocolPopup(false)} 
                  className="w-10 h-10 rounded-full border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white hover:border-zinc-700 hover:bg-zinc-900 transition-all"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Body */}
              {twins.length === 0 ? (
                <div className="flex-1 overflow-y-auto px-6 py-10 md:px-12 flex flex-col justify-center items-center z-10 text-center">
                  <div className="max-w-md p-8 border border-zinc-900 rounded-2xl bg-zinc-950/50 backdrop-blur-sm">
                    <div className="w-16 h-16 rounded-full border border-zinc-800 flex items-center justify-center mx-auto mb-6 text-zinc-600">
                      <Activity size={28} />
                    </div>
                    <h4 className="text-white font-medium text-lg mb-2">No Active Twins</h4>
                    <p className="text-zinc-500 text-sm mb-8 leading-relaxed">
                      You need to initialize a digital replica twin core before establishing a neural connection.
                    </p>
                    <button 
                      onClick={() => {
                        setShowProtocolPopup(false);
                        navigate('/twins');
                      }}
                      className="w-full py-3 bg-white text-black text-xs font-bold uppercase tracking-widest hover:bg-zinc-200 transition-all rounded-lg"
                    >
                      Create Twin Core
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto px-6 py-10 md:px-12 flex flex-col justify-center items-center z-10">
                  <motion.div 
                    variants={containerVariants}
                    initial="hidden"
                    animate="show"
                    className="flex flex-wrap justify-center items-center gap-10 md:gap-14 max-w-4xl"
                  >
                    {twins.map((twin) => (
                      <motion.div
                        key={twin.id}
                        variants={itemVariants}
                        onClick={() => {
                          setShowProtocolPopup(false);
                          navigate('/voice', { state: { twin } });
                        }}
                        className="relative group cursor-pointer flex flex-col items-center select-none"
                      >
                        {/* Main thick border container */}
                        <div className="relative w-32 h-32 md:w-36 md:h-36 rounded-full p-[4px] bg-zinc-800 group-hover:bg-white group-hover:scale-105 transition-all duration-500 z-10">
                          
                          {/* Inner container containing image */}
                          <div className="w-full h-full rounded-full bg-zinc-950 overflow-hidden relative">
                            <img 
                              src={twin.image_url || etherealFace} 
                              alt={twin.name}
                              className="w-full h-full object-cover grayscale opacity-60 group-hover:grayscale-0 group-hover:opacity-95 group-hover:scale-110 transition-all duration-700 ease-out"
                            />

                                 
                            {/* Radial overlay */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
                          </div>
                        </div>

                        {/* Twin Name & Profession */}
                        <div className="mt-5 text-center">
                          <h4 className="text-white font-medium tracking-widest text-sm md:text-base uppercase group-hover:text-white transition-colors duration-300">
                            {twin.name}
                          </h4>
                          <span className="text-[10px] text-zinc-500 uppercase tracking-widest block mt-1 font-bold">
                            {twin.profession || 'Digital Twin'}
                          </span>
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                </div>
              )}

              {/* Footer */}
              <div className="p-4 border-t border-zinc-900 bg-zinc-950/50 text-center z-10">
                <p className="text-[9px] text-zinc-600 font-mono tracking-widest uppercase">// SECURE NEURAL OVERLAY • LINK ESTABLISHED // CURRENT LATENCY: 24ms</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
