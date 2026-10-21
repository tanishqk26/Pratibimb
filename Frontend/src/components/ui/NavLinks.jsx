import React from 'react';
import { NavLink as RouterNavLink } from 'react-router-dom';
import { Home, MessageSquare, History, User, Users, Sparkles } from 'lucide-react';

export default function NavLinks() {
  return (
    <nav className="space-y-2">
      <NavLink icon={Home} label="Home" to="/dashboard" />
      <NavLink icon={Sparkles} label="Your Twins" to="/twins" />
      <NavLink icon={User} label="Profile" to="/profile" />
    </nav>
  );
}

function NavLink({ icon: Icon, label, to, disabled }) {
  if (disabled) {
    return (
      <button 
        disabled
        className="w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all text-zinc-600 opacity-50 cursor-not-allowed"
      >
        <Icon size={18} />
        <span className="text-sm font-medium">{label}</span>
      </button>
    );
  }

  return (
    <RouterNavLink 
      to={to}
      className={({ isActive }) => 
        `w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all ${isActive ? 'bg-white/5 text-white' : 'text-zinc-600 hover:bg-white/[0.02] hover:text-white'}`
      }
    >
      <Icon size={18} />
      <span className="text-sm font-medium">{label}</span>
    </RouterNavLink>
  );
}

export function NavIcon({ icon: Icon, to }) {
  return (
    <RouterNavLink 
      to={to} 
      className={({ isActive }) => `p-4 ${isActive ? 'text-white' : 'text-zinc-600'}`}
    >
      <Icon size={20} />
    </RouterNavLink>
  );
}
