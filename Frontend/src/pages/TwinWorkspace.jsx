import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, MessageSquare, History, User, Settings, Plus, Edit2, Trash2, Mic, Upload, X } from 'lucide-react';
import { ToggleButton } from '../components/ui/Buttons';
import LanguageSelect, { SARVAM_LANGUAGES } from '../Components/ui/LanguageSelect';
import MemoriesTab from './Memory';

const parseUTCDate = (dateStr) => {
  if (!dateStr) return new Date();
  const cleanStr = dateStr.includes('Z') || dateStr.includes('+') ? dateStr : `${dateStr.replace(' ', 'T')}Z`;
  return new Date(cleanStr);
};

export default function TwinWorkspace() {
  const { twinId } = useParams();
  const navigate = useNavigate();
  const [twin, setTwin] = useState(null);
  const [activeTab, setActiveTab] = useState('chat');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTwin = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;
        const res = await fetch(`http://localhost:8000/twins/${twinId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setTwin(data);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchTwin();
  }, [twinId]);

  if (loading) {
    return <div className="text-white text-center py-20">Loading workspace...</div>;
  }

  if (!twin) {
    return <div className="text-white text-center py-20">Twin not found.</div>;
  }

  const tabs = [
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'memories', label: 'Memories', icon: History },
    { id: 'profile', label: 'Twin Profile', icon: User },
    { id: 'settings', label: 'Settings', icon: Settings }
  ];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-5xl mx-auto space-y-8"
    >
      <button 
        onClick={() => navigate('/twins')}
        className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors text-sm font-medium mb-4"
      >
        <ArrowLeft size={16} /> Back to Twins
      </button>

      <header className="flex flex-col md:flex-row gap-6 md:items-end justify-between bg-zinc-950/50 p-6 rounded-2xl border border-zinc-800">
        <div className="flex gap-6 items-center">
          <div className="w-20 h-20 rounded-xl overflow-hidden border border-zinc-800 shrink-0">
            <img 
              src={twin.image_url || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop'} 
              alt={twin.name} 
              className="w-full h-full object-cover" 
            />
          </div>
          <div>
            <h1 className="text-3xl font-medium text-white mb-2">{twin.name}</h1>
            <p className="text-sm text-zinc-400">{twin.profession} • Created recently</p>
          </div>
        </div>
      </header>

      <div className="flex gap-2 border-b border-zinc-800 pb-px overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id 
                ? 'border-white text-white' 
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="py-6">
        {activeTab === 'chat' && <ChatTab twin={twin} />}
        {activeTab === 'memories' && <MemoriesTab twin={twin} />}
        {activeTab === 'profile' && <ProfileTab twin={twin} setTwin={setTwin} />}
        {activeTab === 'settings' && <SettingsTab twin={twin} />}
      </div>
    </motion.div>
  );
}

function ChatTab({ twin }) {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [selectedConv, setSelectedConv] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchConversations = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`http://localhost:8000/conversations/twin/${twin.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setConversations(data);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchConversations();
  }, [twin.id]);

  const handleDelete = async (e, convId) => {
    e.stopPropagation();
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`http://localhost:8000/conversations/${convId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setConversations(prev => prev.filter(c => c.id !== convId));
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl text-white font-medium">Conversations</h2>
        <button 
          onClick={() => navigate('/voice', { state: { twin } })}
          className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-lg text-sm font-medium hover:bg-zinc-200 transition-colors"
        >
          <Mic size={16} /> Start New Chat
        </button>
      </div>

      {loading ? (
        <div className="text-zinc-500 text-sm">Loading conversations...</div>
      ) : conversations.length === 0 ? (
        <div className="text-zinc-500 text-sm">No conversations found.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {conversations.map(conv => (
            <div 
              key={conv.id} 
              onClick={() => setSelectedConv(conv)}
              className="p-5 border border-zinc-800 rounded-xl bg-zinc-950/50 hover:border-zinc-600 transition-colors cursor-pointer flex flex-col group relative"
            >
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-white font-medium group-hover:text-emerald-400 transition-colors line-clamp-1">{conv.title || 'Conversation'}</h3>
                <button 
                  onClick={(e) => handleDelete(e, conv.id)}
                  className="text-zinc-600 hover:text-red-400 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <p className="text-xs text-zinc-500 mb-3">{parseUTCDate(conv.created_at).toLocaleString()} • {conv.messages?.length || 0} messages</p>
              
              <div className="space-y-2 mt-auto">
                {conv.messages?.slice(0, 2).map((msg, idx) => (
                  <p key={idx} className="text-xs text-zinc-400 line-clamp-1">
                    <span className="font-semibold text-zinc-300">{msg.role === 'user' ? 'You' : twin.name}:</span> {msg.message}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

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
                <h3 className="text-lg text-white font-medium">{selectedConv.title || 'Conversation'}</h3>
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
    </div>
  );
}





const ALLOWED_VOICE_TYPES = 'audio/mp3,audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/m4a,audio/x-m4a';

function ProfileTab({ twin, setTwin }) {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: twin.name || '',
    age: twin.age || '',
    gender: twin.gender || '',
    profession: twin.profession || '',
    description: twin.description || '',
    personality_traits: twin.personality_traits || '',
    interests: twin.interests || '',
    image_url: twin.image_url || '',
    voice_id: twin.voice_id || '',
    languages: twin.languages || '',
  });

  // Voice cloning state
  const [voiceName, setVoiceName] = useState(twin.name || '');
  const voiceIdRef = useRef(twin.voice_id || '');
  const [voiceUploadState, setVoiceUploadState] = useState(
    twin.voice_id
      ? { status: 'done', filename: 'Current cloned voice active', voice_id: twin.voice_id }
      : { status: 'idle', filename: '', voice_id: '', error: '' }
  );

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
      files.forEach(f => fd.append('files', f));
      fd.append('voice_name', trimmedName.slice(0, 100));

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
      voiceIdRef.current = voice_id;
      setFormData(prev => ({ ...prev, voice_id }));
      setVoiceUploadState({ status: 'done', filename: filenameStr, voice_id, error: '' });
    } catch (err) {
      setVoiceUploadState(prev => ({ ...prev, status: 'error', error: err.message }));
    }
  };

  const handleSave = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      
      const payload = {
        ...formData,
        voice_id: voiceIdRef.current || formData.voice_id || '',
        age: formData.age ? parseInt(formData.age) : null
      };

      const res = await fetch(`http://localhost:8000/twins/${twin.id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        const updatedTwin = await res.json();
        setTwin(updatedTwin);
        setIsEditing(false);
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (isEditing) {
    return (
      <div className="max-w-2xl space-y-8">
        <div className="flex justify-between items-center">
          <h3 className="text-xl text-white font-medium">Edit Twin Profile</h3>
          <div className="flex gap-2">
            <button onClick={() => setIsEditing(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-white hover:bg-zinc-800 transition-colors">Cancel</button>
            <button onClick={handleSave} className="px-4 py-2 rounded-lg text-sm font-medium bg-white text-black hover:bg-zinc-200 transition-colors">Save Changes</button>
          </div>
        </div>

        <section className="space-y-4">
          <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-4">Basic Identity</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">Name</label>
              <input type="text" name="name" value={formData.name} onChange={handleChange} className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-zinc-500 transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">Age</label>
              <input type="number" name="age" value={formData.age} onChange={handleChange} className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-zinc-500 transition-colors" />
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
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">Profession</label>
              <input type="text" name="profession" value={formData.profession} onChange={handleChange} className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-zinc-500 transition-colors" />
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">Languages</label>
            <LanguageSelect
              value={formData.languages}
              onChange={(val) => setFormData(prev => ({ ...prev, languages: val }))}
            />
            <p className="text-xs text-zinc-600 mt-1.5">
              {formData.languages
                ? `STT will recognise ${formData.languages.split(',').length} language(s) only.`
                : 'No languages selected — STT will auto-detect all supported languages.'}
            </p>
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-4">Persona</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">Biography / Description</label>
              <textarea rows={4} name="description" value={formData.description} onChange={handleChange} className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-zinc-500 transition-colors"></textarea>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">Personality Traits</label>
              <input type="text" name="personality_traits" value={formData.personality_traits} onChange={handleChange} className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-zinc-500 transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">Interests</label>
              <input type="text" name="interests" value={formData.interests} onChange={handleChange} className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-zinc-500 transition-colors" />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-4">Visual Identity</h3>
          <label className="border-2 border-dashed border-zinc-800 rounded-2xl p-12 flex flex-col items-center justify-center hover:border-zinc-600 transition-colors cursor-pointer bg-zinc-900/20 block relative overflow-hidden">
            <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
            {formData.image_url && (
              <img src={formData.image_url} alt="Preview" className="absolute inset-0 w-full h-full object-cover opacity-50 hover:opacity-20 transition-opacity" />
            )}
            <div className="w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center mb-4 relative z-10 border border-zinc-800">
              <Upload size={24} className="text-zinc-400" />
            </div>
            <p className="text-sm text-white font-medium mb-1 relative z-10">{formData.image_url ? 'Click to change image' : 'Click to upload image'}</p>
            <p className="text-xs text-zinc-500 relative z-10">PNG, JPG up to 5MB</p>
          </label>
        </section>

        <section className="space-y-4">
          <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-4">Voice Configuration</h3>

          {/* Active voice ID status */}
          {(voiceIdRef.current || formData.voice_id) && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-900/50 border border-zinc-800">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-zinc-400">Active Voice ID</p>
                <p className="text-xs text-zinc-300 font-mono truncate">{voiceIdRef.current || formData.voice_id}</p>
              </div>
            </div>
          )}

          {/* --- Option 1: Clone from audio --- */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
              <Mic size={14} className="text-zinc-500" />
              Clone from Audio
            </h4>
            <p className="text-sm text-zinc-500">
              {twin.voice_id ? 'Re-clone to replace the current voice. Upload 1–2 min of clear speech.' : 'Upload voice samples to create a multilingual cloned voice.'}
            </p>

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
              className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center gap-3 transition-all
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
                accept={ALLOWED_VOICE_TYPES}
                onChange={handleVoiceUpload}
                className="hidden"
                disabled={voiceUploadState.status === 'uploading' || !voiceName.trim()}
                multiple
              />
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${ voiceUploadState.status === 'done' ? 'bg-green-500/10' : 'bg-zinc-900' }`}>
                {voiceUploadState.status === 'uploading' ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : voiceUploadState.status === 'done' ? (
                  <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <Mic size={20} className="text-zinc-400" />
                )}
              </div>

              {voiceUploadState.status === 'idle' && (
                <>
                  <p className="text-sm text-white font-medium">Click to upload voice sample(s)</p>
                  <p className="text-xs text-zinc-500">MP3, WAV, M4A · Select multiple files · 1–2 min recommended</p>
                </>
              )}
              {voiceUploadState.status === 'uploading' && (
                <>
                  <p className="text-sm text-white font-medium">Cloning voice…</p>
                  <p className="text-xs text-zinc-500">{voiceUploadState.filename}</p>
                </>
              )}
              {voiceUploadState.status === 'done' && (
                <>
                  <p className="text-sm text-green-400 font-medium">
                    {twin.voice_id && voiceUploadState.voice_id && voiceUploadState.voice_id !== twin.voice_id
                      ? 'New voice cloned — will replace old one on save!'
                      : 'Voice cloned successfully!'}
                  </p>
                  <p className="text-xs text-zinc-500">{voiceUploadState.filename}</p>
                  <p className="text-xs text-zinc-600 font-mono">{voiceUploadState.voice_id}</p>
                  <p className="text-xs text-zinc-500">Click to upload different sample(s)</p>
                </>
              )}
              {voiceUploadState.status === 'error' && (
                <>
                  <p className="text-sm text-red-400 font-medium">Upload failed</p>
                  <p className="text-xs text-red-400/70">{voiceUploadState.error}</p>
                  <p className="text-xs text-zinc-500">Click to try again</p>
                </>
              )}
            </label>

            <div className="space-y-1 text-xs text-zinc-600">
              <p>• Use a quiet room — no background music or echo</p>
              <p>• Select multiple files to combine samples for better quality</p>
              <p>• Hindi, Marathi, and English all work — no language selection needed</p>
              {twin.voice_id && <p className="text-amber-500/70">• Saving will replace the current voice permanently</p>}
            </div>
          </div>

          {/* --- Divider --- */}
          <div className="flex items-center gap-4 py-2">
            <div className="flex-1 h-px bg-zinc-800" />
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">or</span>
            <div className="flex-1 h-px bg-zinc-800" />
          </div>

          {/* --- Option 2: Manual Voice ID --- */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
              <Edit2 size={14} className="text-zinc-500" />
              Use Existing Voice ID
            </h4>
            <p className="text-sm text-zinc-500">
              Already have an ElevenLabs voice ID? Paste it below to use it directly.
            </p>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">Voice ID</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={formData.voice_id}
                  onChange={e => {
                    const newId = e.target.value;
                    setFormData(prev => ({ ...prev, voice_id: newId }));
                    voiceIdRef.current = newId;
                    // If the user manually clears the voice_id, reset the upload state
                    if (!newId.trim()) {
                      setVoiceUploadState({ status: 'idle', filename: '', voice_id: '', error: '' });
                    } else {
                      // Mark as done with manual entry
                      setVoiceUploadState({ status: 'done', filename: 'Manual entry', voice_id: newId, error: '' });
                    }
                  }}
                  className="flex-1 bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-zinc-500 transition-colors"
                  placeholder="e.g. pNInz6obpgDQGcFmaJgB"
                />
                {formData.voice_id && (
                  <button
                    type="button"
                    onClick={() => {
                      setFormData(prev => ({ ...prev, voice_id: '' }));
                      voiceIdRef.current = '';
                      setVoiceUploadState({ status: 'idle', filename: '', voice_id: '', error: '' });
                    }}
                    className="px-3 py-3 rounded-xl border border-zinc-800 text-zinc-500 hover:text-red-400 hover:border-red-400/30 transition-colors"
                    title="Clear voice ID"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              <p className="text-xs text-zinc-600 mt-1.5">
                {formData.voice_id
                  ? formData.voice_id === twin.voice_id
                    ? 'This is the currently saved voice ID.'
                    : '⚠ Different from the saved voice — will update on save.'
                  : 'Paste an ElevenLabs voice ID to bypass audio cloning.'}
              </p>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Twin Information</h3>
        <button onClick={() => setIsEditing(true)} className="flex items-center gap-2 px-4 py-2 border border-zinc-800 rounded-lg text-sm font-medium text-white hover:bg-zinc-800 transition-colors">
          <Edit2 size={16} /> Edit Profile
        </button>
      </div>

      <section className="space-y-4">
        <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-4">Basic Identity</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 border border-zinc-800 rounded-xl bg-zinc-950/30">
            <span className="block text-xs text-zinc-500 mb-1">Name</span>
            <span className="text-white">{twin.name}</span>
          </div>
          <div className="p-4 border border-zinc-800 rounded-xl bg-zinc-950/30">
            <span className="block text-xs text-zinc-500 mb-1">Age</span>
            <span className="text-white">{twin.age || 'N/A'}</span>
          </div>
          <div className="p-4 border border-zinc-800 rounded-xl bg-zinc-950/30">
            <span className="block text-xs text-zinc-500 mb-1">Gender</span>
            <span className="text-white capitalize">{twin.gender || 'N/A'}</span>
          </div>
          <div className="p-4 border border-zinc-800 rounded-xl bg-zinc-950/30">
            <span className="block text-xs text-zinc-500 mb-1">Profession</span>
            <span className="text-white">{twin.profession || 'N/A'}</span>
          </div>
        </div>
        {twin.languages && (
          <div className="mt-4">
            <span className="block text-xs text-zinc-500 mb-2">Languages</span>
            <div className="flex flex-wrap gap-2">
              {twin.languages.split(',').map((code, i) => {
                const lang = SARVAM_LANGUAGES.find(l => l.code === code.trim());
                return (
                  <span key={i} className="px-3 py-1 bg-zinc-900 border border-zinc-800 rounded-full text-xs text-zinc-300">
                    {lang ? `${lang.name} (${lang.native})` : code.trim()}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-4">Persona</h3>
        <div className="p-5 border border-zinc-800 rounded-xl bg-zinc-950/30 space-y-4">
          <div>
            <span className="block text-xs text-zinc-500 mb-1">Biography</span>
            <p className="text-sm text-zinc-300 leading-relaxed">{twin.description || 'No biography provided.'}</p>
          </div>
          {twin.personality_traits && (
            <div>
              <span className="block text-xs text-zinc-500 mb-2">Personality Traits</span>
              <div className="flex flex-wrap gap-2">
                {twin.personality_traits.split(',').map((trait, i) => (
                  <span key={i} className="px-3 py-1 bg-zinc-900 border border-zinc-800 rounded-full text-xs text-zinc-300">
                    {trait.trim()}
                  </span>
                ))}
              </div>
            </div>
          )}
          {twin.interests && (
            <div>
              <span className="block text-xs text-zinc-500 mb-2">Interests</span>
              <div className="flex flex-wrap gap-2">
                {twin.interests.split(',').map((interest, i) => (
                  <span key={i} className="px-3 py-1 bg-zinc-900 border border-zinc-800 rounded-full text-xs text-zinc-300">
                    {interest.trim()}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function SettingsTab({ twin }) {
  const navigate = useNavigate();
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [clearConvoModalOpen, setClearConvoModalOpen] = useState(false);
  const [deleteTwinModalOpen, setDeleteTwinModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleResetMemories = async () => {
    setIsProcessing(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const getRes = await fetch(`http://localhost:8000/memories/twin/${twin.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (getRes.ok) {
        const memories = await getRes.json();
        await Promise.all(memories.map(mem => 
          fetch(`http://localhost:8000/memories/${mem.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
          })
        ));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
      setResetModalOpen(false);
    }
  };

  const handleClearConversations = async () => {
    setIsProcessing(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      await fetch(`http://localhost:8000/conversations/twin/${twin.id}/all`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
      setClearConvoModalOpen(false);
    }
  };

  const handleDeleteTwin = async () => {
    setIsProcessing(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const res = await fetch(`http://localhost:8000/twins/${twin.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        navigate('/twins');
      }
    } catch (e) {
      console.error(e);
      setIsProcessing(false);
      setDeleteTwinModalOpen(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-8">
      <div className="p-6 border border-zinc-800 rounded-2xl space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-white font-medium mb-1">Voice Responses</h3>
            <p className="text-sm text-zinc-500">Allow twin to respond using synthesized voice during chat.</p>
          </div>
          <ToggleButton active={true} />
        </div>
        
        <div className="pt-6 border-t border-zinc-800 flex justify-between items-center">
          <div>
            <h3 className="text-white font-medium mb-1">Export Twin</h3>
            <p className="text-sm text-zinc-500">Download twin data and memory logs.</p>
          </div>
          <button className="px-4 py-2 border border-zinc-700 text-zinc-300 rounded-lg text-sm font-medium hover:bg-zinc-800 hover:text-white transition-colors">
            Export JSON
          </button>
        </div>
      </div>

      <div className="p-6 border border-red-900/30 bg-red-500/5 rounded-2xl space-y-6">
        <div>
          <h3 className="text-red-400 font-medium mb-1">Danger Zone</h3>
          <p className="text-sm text-red-400/70">These actions are irreversible.</p>
        </div>
        
        <div className="flex justify-between items-center pt-4 border-t border-red-900/20">
          <span className="text-sm text-zinc-300">Reset all memories</span>
          <button onClick={() => setResetModalOpen(true)} className="px-4 py-2 border border-red-900/50 text-red-400 rounded-lg text-sm font-medium hover:bg-red-500/10 transition-colors">
            Reset Memories
          </button>
        </div>
        
        <div className="flex justify-between items-center pt-4 border-t border-red-900/20">
          <span className="text-sm text-zinc-300">Clear all conversations</span>
          <button onClick={() => setClearConvoModalOpen(true)} className="px-4 py-2 border border-red-900/50 text-red-400 rounded-lg text-sm font-medium hover:bg-red-500/10 transition-colors">
            Clear Conversations
          </button>
        </div>
        
        <div className="flex justify-between items-center pt-4 border-t border-red-900/20">
          <span className="text-sm text-zinc-300">Permanently delete twin</span>
          <button onClick={() => setDeleteTwinModalOpen(true)} className="px-4 py-2 bg-red-500/10 text-red-500 rounded-lg text-sm font-medium hover:bg-red-500 hover:text-white transition-colors">
            Delete Twin
          </button>
        </div>
      </div>

      <AnimatePresence>
        {clearConvoModalOpen && (
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
              <h3 className="text-xl text-white font-medium mb-2">Clear Conversations</h3>
              <p className="text-zinc-400 text-sm mb-8">Are you sure you want to permanently clear all conversation history associated with this twin? This action cannot be undone.</p>
              
              <div className="flex gap-3 justify-end">
                <button 
                  onClick={() => setClearConvoModalOpen(false)}
                  disabled={isProcessing}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white hover:bg-zinc-800 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleClearConversations}
                  disabled={isProcessing}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-colors disabled:opacity-50"
                >
                  {isProcessing ? 'Clearing...' : 'Clear'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {resetModalOpen && (
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
              <h3 className="text-xl text-white font-medium mb-2">Reset Memories</h3>
              <p className="text-zinc-400 text-sm mb-8">Are you sure you want to permanently delete all memories associated with this twin? This action cannot be undone.</p>
              
              <div className="flex gap-3 justify-end">
                <button 
                  onClick={() => setResetModalOpen(false)}
                  disabled={isProcessing}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white hover:bg-zinc-800 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleResetMemories}
                  disabled={isProcessing}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-colors disabled:opacity-50"
                >
                  {isProcessing ? 'Resetting...' : 'Reset'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {deleteTwinModalOpen && (
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
                  onClick={() => setDeleteTwinModalOpen(false)}
                  disabled={isProcessing}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white hover:bg-zinc-800 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleDeleteTwin}
                  disabled={isProcessing}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-colors disabled:opacity-50"
                >
                  {isProcessing ? 'Deleting...' : 'Delete Twin'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
