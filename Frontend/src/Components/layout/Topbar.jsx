import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import BrandLogo from '../ui/BrandLogo';

export default function Topbar() {
  const navigate = useNavigate();
  const [userName, setUserName] = useState('');

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
          setUserName(data.full_name || data.name || data.email?.split('@')[0] || 'User');
        } 
      } catch (e) {
        console.error(e);
      }
    };
    fetchUser();
  }, []);

  const getInitials = (name) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  return (
    <header className="h-20 px-8 lg:px-12 flex justify-between lg:justify-end items-center border-b border-border-subtle lg:border-none sticky top-0 bg-background/80 backdrop-blur-md z-40">
      <div className="lg:hidden">
        <BrandLogo />
      </div>
      <div className="flex items-center gap-6">
         <button 
           onClick={() => navigate('/profile')}
           className="w-10 h-10 rounded-full border border-border-subtle hover:border-white transition-all bg-zinc-900 flex items-center justify-center"
         >
           <span className="text-sm text-white font-medium tracking-widest">{getInitials(userName)}</span>
         </button>
      </div>
    </header>
  );
}
