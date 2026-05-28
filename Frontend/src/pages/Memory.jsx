import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Edit2, Trash2, X, RefreshCw, Check } from 'lucide-react';

const parseUTCDate = (dateStr) => {
  if (!dateStr) return new Date();
  const cleanStr = dateStr.includes('Z') || dateStr.includes('+') ? dateStr : `${dateStr.replace(' ', 'T')}Z`;
  return new Date(cleanStr);
};

// ── Sync button for a single memory card ───────────────────────────────────────
function SyncButton({ memory, onSyncTriggered }) {
  const status = memory.indexing_status;
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (status === 'indexing') {
      setSyncing(true);
    } else {
      setSyncing(false);
    }
  }, [status]);

  const handleSync = async (e) => {
    e.stopPropagation();
    if (syncing || status === 'indexed') return;
    setSyncing(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`http://localhost:8000/memories/${memory.id}/index`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        onSyncTriggered && onSyncTriggered(memory.id);
      } else {
        setSyncing(false);
      }
    } catch (e) {
      console.error(e);
      setSyncing(false);
    }
  };

  if (status === 'indexed') {
    return (
      <button
        disabled
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-default transition-all"
        title="Memory synced to vector DB"
      >
        <Check size={12} /> Synced
      </button>
    );
  }

  if (syncing || status === 'indexing') {
    return (
      <button
        disabled
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse cursor-not-allowed transition-all"
        title="Syncing to vector DB..."
      >
        <RefreshCw size={12} className="animate-spin" /> Remembering...
      </button>
    );
  }

  if (status === 'failed') {
    return (
      <button
        onClick={handleSync}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 cursor-pointer transition-all"
        title="Sync failed — click to retry"
      >
        <RefreshCw size={12} /> Retry Sync
      </button>
    );
  }

  // Default: not_synced, pending, or no status — show clickable Sync button
  return (
    <button
      onClick={handleSync}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800/50 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 hover:text-white cursor-pointer transition-all"
      title="Sync this memory to vector DB"
    >
      <RefreshCw size={12} /> Sync
    </button>
  );
}


// ── MemoriesTab for TwinWorkspace.jsx or standalone route ─────────────────────
export default function MemoriesTab({ twin: propTwin }) {
  const [twins, setTwins] = useState([]);
  const [selectedTwin, setSelectedTwin] = useState(propTwin || null);
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [memoryToDelete, setMemoryToDelete] = useState(null);
  const [editingMemory, setEditingMemory] = useState(null);
  const [formData, setFormData] = useState({ title: '', content: '' });
  const pollRef = useRef(null);

  // Fetch twins list if accessed standalone without a twin prop
  useEffect(() => {
    if (!propTwin) {
      const fetchTwins = async () => {
        try {
          const token = localStorage.getItem('token');
          if (!token) return;
          const res = await fetch('http://localhost:8000/twins', {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            setTwins(data);
            if (data.length > 0) {
              setSelectedTwin(data[0]);
            } else {
              setLoading(false);
            }
          }
        } catch (e) {
          console.error(e);
          setLoading(false);
        }
      };
      fetchTwins();
    } else {
      setSelectedTwin(propTwin);
    }
  }, [propTwin]);

  const fetchMemories = useCallback(async () => {
    if (!selectedTwin) return;
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const res = await fetch(`http://localhost:8000/memories/twin/${selectedTwin.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMemories(data);
        return data;
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
    return [];
  }, [selectedTwin]);

  useEffect(() => {
    if (selectedTwin) {
      setLoading(true);
      fetchMemories();
    }
  }, [selectedTwin, fetchMemories]);

  // Poll for in-progress syncs
  useEffect(() => {
    const hasInProgress = memories.some(m => m.indexing_status === 'indexing');

    if (hasInProgress) {
      if (!pollRef.current) {
        pollRef.current = setInterval(async () => {
          const updated = await fetchMemories();
          if (updated && !updated.some(m => m.indexing_status === 'indexing')) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }, 2500);
      }
    } else {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [memories, fetchMemories]);

  const handleSyncTriggered = () => {
    // Start polling after a sync is triggered
    setTimeout(() => fetchMemories(), 800);
  };

  const handleOpenPopup = (mem = null) => {
    if (mem) {
      setEditingMemory(mem);
      setFormData({ title: mem.title, content: mem.content || '' });
    } else {
      setEditingMemory(null);
      setFormData({ title: '', content: '' });
    }
    setIsPopupOpen(true);
  };

  const handleClosePopup = () => {
    setIsPopupOpen(false);
    setEditingMemory(null);
    setFormData({ title: '', content: '' });
  };

  const handleSave = async () => {
    if (!formData.title.trim() || !selectedTwin) return;
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      
      const payload = {
        title: formData.title,
        content: formData.content,
      };

      let url = 'http://localhost:8000/memories';
      let method = 'POST';

      if (editingMemory) {
        url = `http://localhost:8000/memories/${editingMemory.id}`;
        method = 'PUT';
      } else {
        payload.twin_id = selectedTwin.id;
      }

      const res = await fetch(url, {
        method,
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        fetchMemories();
        handleClosePopup();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = (id) => {
    setMemoryToDelete(id);
  };

  const confirmDelete = async () => {
    if(!memoryToDelete) return;
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const res = await fetch(`http://localhost:8000/memories/${memoryToDelete}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchMemories();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setMemoryToDelete(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Standalone Twin Selector */}
      {!propTwin && twins.length > 0 && (
        <div className="p-5 border border-zinc-800 rounded-xl bg-zinc-950/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-white font-medium text-lg">Memory Archive</h3>
            <p className="text-zinc-500 text-xs mt-1">Manage core memories across your digital twins</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-zinc-400">Select Twin:</span>
            <select 
              value={selectedTwin?.id || ''} 
              onChange={(e) => {
                const selected = twins.find(t => t.id === parseInt(e.target.value));
                setSelectedTwin(selected);
              }}
              className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-zinc-500 transition-colors"
            >
              {twins.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* No twins found standalone state */}
      {!propTwin && twins.length === 0 && !loading && (
        <div className="text-zinc-500 text-center py-10">
          No digital twins found. Create a twin to start recording memories.
        </div>
      )}

      {selectedTwin && (
        <>
          <div className="flex justify-between items-center">
            <h2 className="text-xl text-white font-medium">
              {propTwin ? 'Core Memories' : `Memories for ${selectedTwin.name}`}
            </h2>
            <button onClick={() => handleOpenPopup()} className="flex items-center gap-2 px-4 py-2 border border-zinc-800 text-white rounded-lg text-sm font-medium hover:bg-zinc-800 transition-colors">
              <Plus size={16} /> Add Memory
            </button>
          </div>

          {loading ? (
            <div className="text-zinc-500 text-sm">Loading memories...</div>
          ) : memories.length === 0 ? (
            <div className="text-zinc-500 text-sm">No memories found. Click "Add Memory" to create one.</div>
          ) : (
            <div className="space-y-3">
              {memories.map(mem => (
                <div key={mem.id} className="p-5 border border-zinc-800 rounded-xl bg-zinc-950/50 flex justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-white font-medium mb-1">{mem.title}</h4>
                    {mem.content && (
                      <p className="text-sm text-zinc-400 mb-2 leading-relaxed line-clamp-3 overflow-hidden">
                        {mem.content}
                      </p>
                    )}
                    <span className="text-xs text-zinc-600">{parseUTCDate(mem.created_at).toLocaleDateString()}</span>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0 items-end">
                    <SyncButton memory={mem} onSyncTriggered={handleSyncTriggered} />
                    <div className="flex gap-1">
                      <button onClick={() => handleOpenPopup(mem)} className="p-1.5 text-zinc-500 hover:text-white transition-colors" title="Edit"><Edit2 size={14} /></button>
                      <button onClick={() => handleDelete(mem.id)} className="p-1.5 text-zinc-500 hover:text-red-400 transition-colors" title="Delete"><Trash2 size={14} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Delete Confirmation Popup */}
      <AnimatePresence>
        {memoryToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
            <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-2xl p-6 shadow-2xl">
              <h3 className="text-xl text-white font-medium mb-2">Delete Memory</h3>
              <p className="text-zinc-400 text-sm mb-6">Are you sure you want to delete this memory? This action cannot be undone.</p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setMemoryToDelete(null)} className="px-4 py-2 border border-zinc-800 text-zinc-400 rounded-lg text-sm hover:bg-zinc-900 transition-colors">Cancel</button>
                <button onClick={confirmDelete} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition-colors">Delete</button>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Add / Edit Popup */}
      <AnimatePresence>
        {isPopupOpen && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.95, opacity: 0 }} 
              className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-2xl p-6 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl text-white font-medium">{editingMemory ? 'Edit Memory' : 'Add Memory'}</h3>
                <button onClick={handleClosePopup} className="text-zinc-500 hover:text-white"><X size={20} /></button>
              </div>

              <div className="space-y-4 mb-8">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">Memory Title</label>
                  <input 
                    type="text" 
                    value={formData.title} 
                    onChange={(e) => setFormData({...formData, title: e.target.value})} 
                    className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-zinc-500 transition-colors" 
                    placeholder="e.g. Behavioral Quirks" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">Memory Content</label>
                  <textarea 
                    rows={5} 
                    value={formData.content} 
                    onChange={(e) => setFormData({...formData, content: e.target.value})} 
                    className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-zinc-500 transition-colors resize-none" 
                    placeholder="Describe facts, traits or context that the digital twin should remember..."
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button onClick={handleClosePopup} className="px-4 py-2 border border-zinc-800 text-zinc-400 rounded-lg text-sm hover:bg-zinc-900 transition-colors">Cancel</button>
                <button onClick={handleSave} className="px-4 py-2 bg-white text-black rounded-lg text-sm hover:bg-zinc-200 transition-colors">Save</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── LocalMemoriesSection for Twins.jsx (creation flow — local state only) ─────
export function LocalMemoriesSection({ localMemories, setLocalMemories, setDeletedMemories }) {
  const [isMemoryPopupOpen, setIsMemoryPopupOpen] = useState(false);
  const [editingMemoryIndex, setEditingMemoryIndex] = useState(null);
  const [memoryFormData, setMemoryFormData] = useState({ title: '', content: '' });
  const [syncingIds, setSyncingIds] = useState(new Set());
  const pollRef = useRef(null);

  const handleOpenMemoryPopup = (index = null) => {
    if (index !== null) {
      const mem = localMemories[index];
      setEditingMemoryIndex(index);
      setMemoryFormData({ title: mem.title, content: mem.content || '' });
    } else {
      setEditingMemoryIndex(null);
      setMemoryFormData({ title: '', content: '' });
    }
    setIsMemoryPopupOpen(true);
  };

  const handleCloseMemoryPopup = () => {
    setIsMemoryPopupOpen(false);
    setEditingMemoryIndex(null);
    setMemoryFormData({ title: '', content: '' });
  };

  const handleSaveMemory = () => {
    if (!memoryFormData.title.trim()) return;
    const newMem = { ...memoryFormData };
    if (editingMemoryIndex !== null) {
      const updated = [...localMemories];
      updated[editingMemoryIndex] = { ...updated[editingMemoryIndex], ...newMem, _isEdited: true };
      setLocalMemories(updated);
    } else {
      setLocalMemories([...localMemories, newMem]);
    }
    handleCloseMemoryPopup();
  };

  const handleDeleteMemory = (index) => {
    const mem = localMemories[index];
    if (mem.id && setDeletedMemories) {
      setDeletedMemories(prev => [...prev, mem.id]);
    }
    const updated = localMemories.filter((_, idx) => idx !== index);
    setLocalMemories(updated);
  };

  // Per-card sync for already-saved memories (those with an id)
  const handleSyncMemory = async (mem, index) => {
    if (!mem.id) return; // Can't sync unsaved memories
    setSyncingIds(prev => new Set(prev).add(mem.id));
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`http://localhost:8000/memories/${mem.id}/index`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        // Start polling for this memory's status
        startPollingForMemory(mem.id);
      } else {
        setSyncingIds(prev => { const s = new Set(prev); s.delete(mem.id); return s; });
      }
    } catch (e) {
      console.error(e);
      setSyncingIds(prev => { const s = new Set(prev); s.delete(mem.id); return s; });
    }
  };

  const startPollingForMemory = (memoryId) => {
    const interval = setInterval(async () => {
      try {
        const token = localStorage.getItem('token');
        // We need to find the twin_id from the memory
        const mem = localMemories.find(m => m.id === memoryId);
        if (!mem?.twin_id) {
          clearInterval(interval);
          return;
        }
        const res = await fetch(`http://localhost:8000/memories/twin/${mem.twin_id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          // Update localMemories with fresh data
          setLocalMemories(prev => {
            const updated = [...prev];
            for (let i = 0; i < updated.length; i++) {
              const fresh = data.find(d => d.id === updated[i].id);
              if (fresh) {
                updated[i] = { ...updated[i], indexing_status: fresh.indexing_status, is_indexed: fresh.is_indexed };
              }
            }
            return updated;
          });
          
          const target = data.find(d => d.id === memoryId);
          if (target && target.indexing_status !== 'indexing' && target.indexing_status !== 'pending') {
            setSyncingIds(prev => { const s = new Set(prev); s.delete(memoryId); return s; });
            clearInterval(interval);
          }
        }
      } catch (e) {
        clearInterval(interval);
        setSyncingIds(prev => { const s = new Set(prev); s.delete(memoryId); return s; });
      }
    }, 2500);
  };

  const getSyncButton = (mem, index) => {
    // Not yet saved — no sync available
    if (!mem.id) return null;

    const status = mem.indexing_status;
    const isSyncing = syncingIds.has(mem.id);

    if (status === 'indexed' && !isSyncing) {
      return (
        <button
          disabled
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-default transition-all"
          title="Memory synced"
        >
          <Check size={12} /> Synced
        </button>
      );
    }

    if (isSyncing || status === 'indexing') {
      return (
        <button
          disabled
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse cursor-not-allowed transition-all"
        >
          <RefreshCw size={12} className="animate-spin" /> Remembering...
        </button>
      );
    }

    if (status === 'failed') {
      return (
        <button
          type="button"
          onClick={() => handleSyncMemory(mem, index)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 cursor-pointer transition-all"
        >
          <RefreshCw size={12} /> Retry Sync
        </button>
      );
    }

    // Default: not_synced, pending, or no status yet
    return (
      <button
        type="button"
        onClick={() => handleSyncMemory(mem, index)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800/50 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 hover:text-white cursor-pointer transition-all"
      >
        <RefreshCw size={12} /> Sync
      </button>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg text-white">Core Memories</h3>
        <button type="button" onClick={() => handleOpenMemoryPopup()} className="text-xs font-medium text-white bg-zinc-800 px-3 py-1.5 rounded-lg flex items-center gap-2 hover:bg-zinc-700">
          <Plus size={14} /> Add Memory
        </button>
      </div>
      
      <div className="space-y-3">
        {localMemories.length === 0 ? (
          <div className="text-zinc-500 text-sm">No memories added yet.</div>
        ) : (
          localMemories.map((mem, idx) => (
            <div key={mem.id || idx} className="p-5 border border-zinc-800 rounded-xl bg-zinc-900/30 flex justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h4 className="text-white font-medium mb-1">{mem.title}</h4>
                {mem.content && (
                  <p className="text-sm text-zinc-400 mb-2 leading-relaxed line-clamp-3 overflow-hidden">
                    {mem.content}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2 shrink-0 items-end">
                {getSyncButton(mem, idx)}
                <div className="flex gap-1">
                  <button type="button" onClick={() => handleOpenMemoryPopup(idx)} className="p-1.5 text-zinc-500 hover:text-white transition-colors" title="Edit"><Edit2 size={14} /></button>
                  <button type="button" onClick={() => handleDeleteMemory(idx)} className="p-1.5 text-zinc-500 hover:text-red-400 transition-colors" title="Delete"><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <AnimatePresence>
        {isMemoryPopupOpen && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.95, opacity: 0 }} 
              className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-2xl p-6 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl text-white font-medium">{editingMemoryIndex !== null ? 'Edit Memory' : 'Add Memory'}</h3>
                <button type="button" onClick={handleCloseMemoryPopup} className="text-zinc-500 hover:text-white"><X size={20} /></button>
              </div>

              <div className="space-y-4 mb-8">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">Memory Title</label>
                  <input 
                    type="text" 
                    value={memoryFormData.title} 
                    onChange={(e) => setMemoryFormData({...memoryFormData, title: e.target.value})} 
                    className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-zinc-500 transition-colors" 
                    placeholder="e.g. User Preferences" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">Memory Content</label>
                  <textarea 
                    rows={4} 
                    value={memoryFormData.content} 
                    onChange={(e) => setMemoryFormData({...memoryFormData, content: e.target.value})} 
                    className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-zinc-500 transition-colors resize-none" 
                    placeholder="Write memory details here..."
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button type="button" onClick={handleCloseMemoryPopup} className="px-4 py-2 border border-zinc-800 text-zinc-400 rounded-lg text-sm hover:bg-zinc-900 transition-colors">Cancel</button>
                <button type="button" onClick={handleSaveMemory} className="px-4 py-2 bg-white text-black rounded-lg text-sm hover:bg-zinc-200 transition-colors">Save</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
