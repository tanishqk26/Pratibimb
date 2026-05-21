import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit2, Trash2, MessageSquare, ArrowRight, ArrowLeft, Upload, Mic, Search, X } from 'lucide-react';

export default function Twins() {
  const navigate = useNavigate();
  const [twins, setTwins] = useState([]);
  const [isCreating, setIsCreating] = useState(false);
  const [editingTwin, setEditingTwin] = useState(null);
  const [deletingTwinId, setDeletingTwinId] = useState(null);

  const fetchTwins = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const res = await fetch('http://localhost:8000/twins', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const twinsWithStats = await Promise.all(data.map(async (twin) => {
          let memoryCount = 0;
          try {
            const memRes = await fetch(`http://localhost:8000/memories/twin/${twin.id}`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            if (memRes.ok) {
              const memData = await memRes.json();
              memoryCount = memData.length;
            }
          } catch (e) {
            console.error('Failed to fetch memories for twin', twin.id);
          }
          return { ...twin, memoryCount, conversationCount: 0 };
        }));
        setTwins(twinsWithStats);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingTwinId) return;
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const res = await fetch(`http://localhost:8000/twins/${deletingTwinId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchTwins();
        setDeletingTwinId(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchTwins();
  }, []);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-5xl mx-auto"
    >
      {!(isCreating || editingTwin) ? (
        <>
          <header className="mb-12 flex justify-between items-end">
            <div>
              <h1 className="text-4xl mb-2 text-white font-medium">Your Twins</h1>
              <p className="text-xs text-zinc-500 font-bold uppercase tracking-[0.2em]">Manage Digital Replicas</p>
            </div>
            <button 
              onClick={() => setIsCreating(true)}
              className="flex items-center gap-2 px-6 py-3 border border-zinc-800 rounded-xl hover:border-white hover:text-white transition-all bg-zinc-950/50"
            >
              <Plus size={16} />
              <span className="text-sm font-medium">Add New Twin</span>
            </button>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {twins.map(twin => (
              <div key={twin.id} className="border border-zinc-800 rounded-2xl p-6 bg-zinc-950/50 hover:border-zinc-700 transition-colors group relative overflow-hidden flex flex-col">
                <div className="flex gap-4 mb-6 relative z-10">
                  <div className="w-16 h-16 rounded-xl overflow-hidden border border-zinc-800 shrink-0">
                    <img src={twin.image_url || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop'} alt={twin.name} className="w-full h-full object-cover grayscale opacity-80 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-500" />
                  </div>
                  <div>
                    <h3 className="text-xl font-medium text-white mb-1">{twin.name}</h3>
                    <p className="text-xs text-zinc-400">{twin.profession} • {twin.age} yrs</p>
                  </div>
                </div>
                <p className="text-sm text-zinc-500 line-clamp-3 mb-4 flex-1 relative z-10">{twin.description}</p>
                
                <div className="flex gap-4 mb-8 text-xs text-zinc-400 relative z-10">
                  <div className="flex flex-col">
                    <span className="text-white font-medium">{twin.memoryCount ?? 0}</span>
                    <span>Memories</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-white font-medium">{twin.conversationCount ?? 0}</span>
                    <span>Conversations</span>
                  </div>
                </div>

                <div className="flex gap-2 relative z-10">
                  <button onClick={() => navigate('/voice', { state: { twin } })} className="flex-1 flex justify-center items-center gap-2 py-2.5 bg-white text-black rounded-lg text-sm font-medium hover:bg-zinc-200 transition-colors">
                    <MessageSquare size={16} />
                    Initiate Twin
                  </button>
                  <button onClick={() => navigate(`/twins/${twin.id}`)} className="p-2.5 border border-zinc-800 rounded-lg text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors">
                    <Edit2 size={16} />
                  </button>
                  <button onClick={() => setDeletingTwinId(twin.id)} className="p-2.5 border border-zinc-800 rounded-lg text-zinc-400 hover:text-red-400 hover:border-red-400/50 transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <TwinCreationForm initialData={editingTwin} onCancel={() => { setIsCreating(false); setEditingTwin(null); }} onSuccess={() => { setIsCreating(false); setEditingTwin(null); fetchTwins(); }} />
      )}

      <AnimatePresence>
        {deletingTwinId && (
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
              <h3 className="text-xl text-white font-medium mb-2">Delete Twin</h3>
              <p className="text-zinc-400 text-sm mb-8">Are you sure you want to permanently delete this digital replica? This action cannot be undone.</p>
              
              <div className="flex gap-3 justify-end">
                <button 
                  onClick={() => setDeletingTwinId(null)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleDeleteConfirm}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-colors"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function TwinCreationForm({ onCancel, onSuccess, initialData }) {
  const [step, setStep] = useState(1);
  const totalSteps = 5;

  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    age: initialData?.age || '',
    gender: initialData?.gender || '',
    profession: initialData?.profession || '',
    description: initialData?.description || '',
    personality_traits: initialData?.personality_traits || '',
    interests: initialData?.interests || '',
    image_url: initialData?.image_url || '',
    voice_id: initialData?.voice_id || '',
  });

  // Voice upload state
  const [voiceName, setVoiceName] = useState(
    initialData?.voice_id ? (initialData.name || '') : ''
  );
  // Ref so handleSubmit always reads the latest voice_id regardless of React render timing
  const voiceIdRef = useRef(initialData?.voice_id || '');
  const [voiceUploadState, setVoiceUploadState] = useState(
    initialData?.voice_id
      ? { status: 'done', filename: 'Existing cloned voice', voice_id: initialData.voice_id }
      : { status: 'idle', filename: '', voice_id: '', error: '' }
  );

  const [localMemories, setLocalMemories] = useState([]);
  const [deletedMemories, setDeletedMemories] = useState([]);
  const [isMemoryPopupOpen, setIsMemoryPopupOpen] = useState(false);
  const [editingMemoryIndex, setEditingMemoryIndex] = useState(null);
  const [memoryFormData, setMemoryFormData] = useState({ title: '', content: '' });

  useEffect(() => {
    if (initialData?.id) {
      const fetchMems = async () => {
        try {
          const token = localStorage.getItem('token');
          const res = await fetch(`http://localhost:8000/memories/twin/${initialData.id}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            setLocalMemories(data);
          }
        } catch(e) {}
      };
      fetchMems();
    }
  }, [initialData]);

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
    if (mem.id) {
      setDeletedMemories([...deletedMemories, mem.id]);
    }
    const updated = [...localMemories];
    updated.splice(index, 1);
    setLocalMemories(updated);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, image_url: reader.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleVoiceUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    const trimmedName = voiceName.trim();
    if (!trimmedName) {
      setVoiceUploadState(prev => ({ ...prev, status: 'error', error: 'Please enter a voice name before uploading.' }));
      return;
    }

    const filenameStr = files.length === 1 ? files[0].name : `${files.length} files selected`;
    setVoiceUploadState({ status: 'uploading', filename: filenameStr, voice_id: '', error: '' });

    try {
      const token = localStorage.getItem('token');
      const fd = new FormData();
      files.forEach(file => {
        fd.append('files', file);
      });
      fd.append('voice_name', trimmedName.slice(0, 100)); // ElevenLabs max 100 chars

      const res = await fetch('http://localhost:8000/voice/clone', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Upload failed' }));
        throw new Error(err.detail || 'Upload failed');
      }

      const { voice_id } = await res.json();
      voiceIdRef.current = voice_id;           // synchronous — always read by handleSubmit
      setFormData(prev => ({ ...prev, voice_id }));
      setVoiceUploadState({ status: 'done', filename: filenameStr, voice_id, error: '' });
    } catch (err) {
      setVoiceUploadState(prev => ({ ...prev, status: 'error', error: err.message }));
    }
  };

  const handleSubmit = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      
      const payload = {
        ...formData,
        voice_id: voiceIdRef.current || formData.voice_id || '',  // always latest
        age: formData.age ? parseInt(formData.age) : null
      };

      const url = initialData ? `http://localhost:8000/twins/${initialData.id}` : 'http://localhost:8000/twins';
      const method = initialData ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        const savedTwin = await res.json();
        
        // Handle memories
        for (const mem of localMemories) {
          if (!mem.id) {
            await fetch('http://localhost:8000/memories', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ title: mem.title, content: mem.content, twin_id: savedTwin.id })
            });
          } else if (mem._isEdited) {
            await fetch(`http://localhost:8000/memories/${mem.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ title: mem.title, content: mem.content })
            });
          }
        }
        
        for (const delId of deletedMemories) {
          await fetch(`http://localhost:8000/memories/${delId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
          });
        }

        onSuccess();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const nextStep = () => setStep(s => Math.min(s + 1, totalSteps));
  const prevStep = () => setStep(s => Math.max(s - 1, 1));

  return (
    <div className="max-w-2xl mx-auto border border-zinc-800 rounded-2xl bg-zinc-950/50 overflow-hidden">
      <div className="p-8 border-b border-zinc-800 flex justify-between items-center">
        <div>
          <h2 className="text-2xl text-white font-medium mb-1">{initialData ? 'Edit Twin' : 'Create Twin'}</h2>
          <p className="text-xs text-zinc-500 font-medium">Step {step} of {totalSteps}</p>
        </div>
        <button onClick={onCancel} className="text-sm text-zinc-500 hover:text-white">Cancel</button>
      </div>

      <div className="p-8 min-h-[400px]">
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <h3 className="text-lg text-white mb-6">Basic Information</h3>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">Twin Name</label>
                <input type="text" name="name" value={formData.name} onChange={handleChange} className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-zinc-500 transition-colors" placeholder="e.g. Atlas Prime" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">Age</label>
                  <input type="number" name="age" value={formData.age} onChange={handleChange} className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-zinc-500 transition-colors" placeholder="e.g. 32" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">Gender</label>
                  <select name="gender" value={formData.gender} onChange={handleChange} className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-zinc-500 transition-colors appearance-none">
                    <option value="">Select</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">Profession</label>
                <input type="text" name="profession" value={formData.profession} onChange={handleChange} className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-zinc-500 transition-colors" placeholder="e.g. Quantum Architect" />
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <h3 className="text-lg text-white mb-6">Persona</h3>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">Biography / Description</label>
                <textarea rows={4} name="description" value={formData.description} onChange={handleChange} className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-zinc-500 transition-colors" placeholder="Describe the twin's background and purpose..."></textarea>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">Personality Traits</label>
                <input type="text" name="personality_traits" value={formData.personality_traits} onChange={handleChange} className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-zinc-500 transition-colors" placeholder="e.g. Analytical, Calm, Insightful (comma separated)" />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">Interests</label>
                <input type="text" name="interests" value={formData.interests} onChange={handleChange} className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-zinc-500 transition-colors" placeholder="e.g. Philosophy, Physics, Art (comma separated)" />
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <h3 className="text-lg text-white mb-6">Visual Identity</h3>
              <label className="border-2 border-dashed border-zinc-800 rounded-2xl p-12 flex flex-col items-center justify-center hover:border-zinc-600 transition-colors cursor-pointer bg-zinc-900/20 block relative">
                <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                {formData.image_url && (
                  <img src={formData.image_url} alt="Preview" className="absolute inset-0 w-full h-full object-cover rounded-2xl opacity-50 hover:opacity-20 transition-opacity" />
                )}
                <div className="w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center mb-4 relative z-10">
                  <Upload size={24} className="text-zinc-400" />
                </div>
                <p className="text-sm text-white font-medium mb-1 relative z-10">{formData.image_url ? 'Click to change image' : 'Click to upload image'}</p>
                <p className="text-xs text-zinc-500 relative z-10">PNG, JPG up to 5MB</p>
              </label>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div key="step4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <div>
                <h3 className="text-lg text-white mb-1">Voice Cloning</h3>
                <p className="text-sm text-zinc-400 mb-6">
                  Upload 1–2 minutes of clear speech to create a multilingual cloned voice.
                  The same voice will be used whether the twin speaks Hindi, Marathi, or English.
                </p>
              </div>

              {/* Voice Name field */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">Voice Name</label>
                <input
                  type="text"
                  value={voiceName}
                  onChange={e => setVoiceName(e.target.value)}
                  maxLength={100}
                  className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-zinc-500 transition-colors"
                  placeholder="e.g. Aryan Deep Voice"
                />
                <p className="text-xs text-zinc-600 mt-1.5">{voiceName.trim().length}/100 characters</p>
              </div>

              <label
                className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center gap-4 transition-all
                  ${ !voiceName.trim()
                      ? 'border-zinc-800/40 bg-zinc-900/10 opacity-50 cursor-not-allowed'
                      : voiceUploadState.status === 'done'
                      ? 'border-green-500/40 bg-green-500/5 cursor-pointer'
                      : voiceUploadState.status === 'error'
                      ? 'border-red-500/40 bg-red-500/5 cursor-pointer'
                      : 'border-zinc-800 hover:border-zinc-600 bg-zinc-900/20 cursor-pointer'
                  }`}
              >
                <input
                  type="file"
                  accept="audio/mp3,audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/m4a,audio/x-m4a"
                  onChange={handleVoiceUpload}
                  className="hidden"
                  disabled={voiceUploadState.status === 'uploading' || !voiceName.trim()}
                  multiple
                />

                {/* Icon */}
                <div className={`w-14 h-14 rounded-full flex items-center justify-center
                  ${ voiceUploadState.status === 'done' ? 'bg-green-500/10' : 'bg-zinc-900' }`}>
                  { voiceUploadState.status === 'uploading' ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : voiceUploadState.status === 'done' ? (
                    <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <Upload size={22} className="text-zinc-400" />
                  )}
                </div>

                {/* Status text */}
                { voiceUploadState.status === 'idle' && (
                  <>
                    <p className="text-sm text-white font-medium">Click to upload voice sample</p>
                    <p className="text-xs text-zinc-500">MP3, WAV, M4A · Recommended: 1–2 min clean speech</p>
                  </>
                )}
                { voiceUploadState.status === 'uploading' && (
                  <>
                    <p className="text-sm text-white font-medium">Cloning voice…</p>
                    <p className="text-xs text-zinc-500">{voiceUploadState.filename}</p>
                  </>
                )}
                { voiceUploadState.status === 'done' && (
                  <>
                    <p className="text-sm text-green-400 font-medium">Voice cloned successfully!</p>
                    <p className="text-xs text-zinc-500">{voiceUploadState.filename}</p>
                    <p className="text-xs text-zinc-600 font-mono">{voiceUploadState.voice_id}</p>
                    <p className="text-xs text-zinc-500 mt-1">Click to replace with a different sample</p>
                  </>
                )}
                { voiceUploadState.status === 'error' && (
                  <>
                    <p className="text-sm text-red-400 font-medium">Upload failed</p>
                    <p className="text-xs text-red-400/70">{voiceUploadState.error}</p>
                    <p className="text-xs text-zinc-500 mt-1">Click to try again</p>
                  </>
                )}
              </label>

              {/* Tips */}
              <div className="space-y-1.5 text-xs text-zinc-500">
                <p>• Use a quiet room with no background noise</p>
                <p>• Speak naturally — read a paragraph aloud, tell a story</p>
                <p>• Hindi, Marathi, and English all work natively — no selection needed</p>
                <p>• Skip this step to use the default AI voice</p>
              </div>
            </motion.div>
          )}

          {step === 5 && (
            <motion.div key="step5" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg text-white">Core Memories</h3>
                <button onClick={() => handleOpenMemoryPopup()} className="text-xs font-medium text-white bg-zinc-800 px-3 py-1.5 rounded-lg flex items-center gap-2 hover:bg-zinc-700">
                  <Plus size={14} /> Add Memory
                </button>
              </div>
              
              <div className="space-y-4">
                {localMemories.length === 0 ? (
                  <div className="text-zinc-500 text-sm">No memories added yet.</div>
                ) : (
                  localMemories.map((mem, idx) => (
                    <div key={idx} className="p-5 border border-zinc-800 rounded-xl bg-zinc-900/30 flex justify-between gap-4">
                      <div>
                        <h4 className="text-white font-medium mb-1">{mem.title}</h4>
                        {mem.content && <p className="text-sm text-zinc-400 mb-2">{mem.content}</p>}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => handleOpenMemoryPopup(idx)} className="p-2 text-zinc-500 hover:text-white transition-colors"><Edit2 size={14} /></button>
                        <button onClick={() => handleDeleteMemory(idx)} className="p-2 text-zinc-500 hover:text-red-400 transition-colors"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}

          <AnimatePresence>
            {isMemoryPopupOpen && (
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }} 
                className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
              >
                <motion.div 
                  initial={{ scale: 0.95, opacity: 0 }} 
                  animate={{ scale: 1, opacity: 1 }} 
                  exit={{ scale: 0.95, opacity: 0 }} 
                  className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-2xl p-6 shadow-2xl"
                >
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl text-white font-medium">{editingMemoryIndex !== null ? 'Edit Memory' : 'Add Memory'}</h3>
                    <button onClick={handleCloseMemoryPopup} className="text-zinc-500 hover:text-white"><X size={20} /></button>
                  </div>
                  
                  <div className="space-y-4 mb-6">
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">Title</label>
                      <input type="text" value={memoryFormData.title} onChange={(e) => setMemoryFormData({...memoryFormData, title: e.target.value})} className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-zinc-500 transition-colors" placeholder="e.g. User Preferences" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">Memory Content</label>
                      <textarea rows={4} value={memoryFormData.content} onChange={(e) => setMemoryFormData({...memoryFormData, content: e.target.value})} className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-zinc-500 transition-colors" placeholder="Write memory details here..."></textarea>
                    </div>
                  </div>
                  
                  <div className="flex gap-3 justify-end">
                    <button 
                      onClick={handleCloseMemoryPopup}
                      className="px-4 py-2 rounded-lg text-sm font-medium text-white hover:bg-zinc-800 transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleSaveMemory}
                      className="px-4 py-2 rounded-lg text-sm font-medium bg-white text-black hover:bg-zinc-200 transition-colors"
                    >
                      Save
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </AnimatePresence>
      </div>

      <div className="p-6 border-t border-zinc-800 flex justify-between items-center bg-zinc-900/20">
        <button 
          onClick={prevStep}
          disabled={step === 1}
          className="px-6 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-30 flex items-center gap-2 hover:bg-zinc-800 transition-colors"
        >
          <ArrowLeft size={16} /> Back
        </button>
        {step < totalSteps ? (
          <button 
            onClick={nextStep}
            className="px-6 py-2.5 rounded-xl text-sm font-medium bg-white text-black flex items-center gap-2 hover:bg-zinc-200 transition-colors"
          >
            Next <ArrowRight size={16} />
          </button>
        ) : (
          <button 
            onClick={() => {
              handleSubmit();
            }}
            className="px-6 py-2.5 rounded-xl text-sm font-medium bg-white text-black flex items-center gap-2 hover:bg-zinc-200 transition-colors"
          >
            {initialData ? 'Update Twin' : 'Create Twin'}
          </button>
        )}
      </div>
    </div>
  );
}
