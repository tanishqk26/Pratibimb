import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { User, Mail, Calendar, Edit2, Users, History, MessageSquare } from 'lucide-react';
import { ProfileField } from '../components/ui/Cards';

export default function Profile() {
  const [user, setUser] = useState({ name: 'Loading...', email: 'Loading...', joined: 'Loading...' });
  const [stats, setStats] = useState([
    { label: 'Twins Created', value: '...', icon: Users },
    { label: 'Memories Stored', value: '...', icon: History },
    { label: 'Conversations', value: '0', icon: MessageSquare }
  ]);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    const fetchProfileData = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;

        // Fetch User Data
        const userRes = await fetch('http://localhost:8000/auth/me', {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (userRes.ok) {
          const data = await userRes.json();
          setUser({ 
            name: data.full_name || data.name || data.email.split('@')[0], 
            email: data.email,
            joined: data.created_at ? new Date(data.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'Unknown'
          });
        }

        // Fetch Twins & Memories
        const twinsRes = await fetch('http://localhost:8000/twins', {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (twinsRes.ok) {
          const twinsData = await twinsRes.json();
          let memCount = 0;
          
          await Promise.all(twinsData.map(async (twin) => {
            try {
              const memRes = await fetch(`http://localhost:8000/memories/twin/${twin.id}`, {
                headers: { Authorization: `Bearer ${token}` }
              });
              if (memRes.ok) {
                const memData = await memRes.json();
                memCount += memData.length;
              }
            } catch (e) {
              console.error('Failed to fetch memory for twin', twin.id);
            }
          }));

          setStats([
            { label: 'Twins Created', value: twinsData.length.toString(), icon: Users },
            { label: 'Memories Stored', value: memCount.toString(), icon: History },
            { label: 'Conversations', value: '0', icon: MessageSquare }
          ]);
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchProfileData();
  }, []);

  const getInitials = (name) => {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'U';
  };

  const handleUpdateUser = async (payload) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const res = await fetch('http://localhost:8000/auth/me', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        setUser(prev => ({ ...prev, name: data.name || data.full_name || prev.name }));
        return true;
      }
    } catch (e) {
      console.error(e);
    }
    return false;
  };

  const handleSaveName = async () => {
    if (!editNameValue.trim()) return;
    const success = await handleUpdateUser({ name: editNameValue });
    if (success) setIsEditingName(false);
  };

  const handleSavePassword = async () => {
    if (!newPassword.trim()) return;
    const success = await handleUpdateUser({ password: newPassword });
    if (success) {
      setIsUpdatingPassword(false);
      setNewPassword('');
      alert('Password updated successfully!');
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-4xl mx-auto space-y-10"
    >
      <header>
        <h1 className="text-4xl mb-2 text-white font-medium">Account Settings</h1>
        <p className="text-zinc-500 text-sm">Manage your personal profile and platform preferences.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat, i) => (
          <div key={i} className="p-6 border border-zinc-800 rounded-2xl bg-zinc-950/50 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-zinc-900 flex items-center justify-center border border-zinc-800">
              <stat.icon size={20} className="text-zinc-400" />
            </div>
            <div>
              <p className="text-2xl text-white font-medium mb-0.5">{stat.value}</p>
              <p className="text-xs text-zinc-500 uppercase tracking-wider font-bold">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4">
          <div className="border border-zinc-800 p-8 rounded-2xl bg-zinc-950/50 text-center flex flex-col items-center">
            <div className="w-24 h-24 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-6">
               <span className="text-2xl text-white font-medium tracking-widest">{getInitials(user.name)}</span>
            </div>
            <h2 className="text-2xl mb-1 text-white font-medium">{user.name}</h2>
            <p className="text-sm text-zinc-500 mb-6">{user.email}</p>
            
            {isEditingName ? (
              <div className="w-full space-y-3">
                <input 
                  type="text" 
                  value={editNameValue} 
                  onChange={e => setEditNameValue(e.target.value)} 
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-zinc-500" 
                  placeholder="New name"
                />
                <div className="flex gap-2">
                  <button onClick={() => setIsEditingName(false)} className="flex-1 py-2 text-xs font-medium text-zinc-400 hover:text-white transition-colors">Cancel</button>
                  <button onClick={handleSaveName} className="flex-1 py-2 bg-white text-black rounded-lg text-xs font-medium hover:bg-zinc-200 transition-colors">Save</button>
                </div>
              </div>
            ) : (
              <button 
                onClick={() => {
                  setEditNameValue(user.name);
                  setIsEditingName(true);
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 border border-zinc-800 rounded-xl text-sm font-medium text-white hover:bg-zinc-900 transition-colors"
              >
                <Edit2 size={16} /> Edit Name
              </button>
            )}
          </div>
        </div>

        <div className="lg:col-span-8 space-y-6">
          <section className="border border-zinc-800 p-8 rounded-2xl bg-zinc-950/50 space-y-6">
            <h3 className="text-lg text-white font-medium border-b border-zinc-800 pb-4 mb-6">Personal Information</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <User size={14} /> Full Name
                </label>
                <p className="text-white text-sm">{user.name}</p>
              </div>
              
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Mail size={14} /> Email Address
                </label>
                <p className="text-white text-sm">{user.email}</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Calendar size={14} /> Joined Date
                </label>
                <p className="text-white text-sm">{user.joined}</p>
              </div>
            </div>
          </section>

          <section className="border border-zinc-800 p-8 rounded-2xl bg-zinc-950/50 space-y-6">
            <h3 className="text-lg text-white font-medium border-b border-zinc-800 pb-4 mb-6">Security Preferences</h3>
            
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white text-sm font-medium mb-1">Password</p>
                <p className="text-xs text-zinc-500">Update your account password</p>
              </div>
              {!isUpdatingPassword && (
                <button onClick={() => setIsUpdatingPassword(true)} className="px-4 py-2 border border-zinc-800 rounded-lg text-sm text-white hover:bg-zinc-900 transition-colors">
                  Update
                </button>
              )}
            </div>
            
            {isUpdatingPassword && (
              <div className="mt-4 p-4 border border-zinc-800 rounded-xl bg-zinc-900/30 flex gap-4 items-center">
                <input 
                  type="password" 
                  value={newPassword} 
                  onChange={e => setNewPassword(e.target.value)} 
                  className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-zinc-500" 
                  placeholder="New Password"
                />
                <button onClick={() => setIsUpdatingPassword(false)} className="px-4 py-2 text-sm text-zinc-400 hover:text-white">Cancel</button>
                <button onClick={handleSavePassword} className="px-4 py-2 bg-white text-black rounded-lg text-sm font-medium hover:bg-zinc-200">Save</button>
              </div>
            )}
          </section>
        </div>
      </div>
    </motion.div>
  );
}
