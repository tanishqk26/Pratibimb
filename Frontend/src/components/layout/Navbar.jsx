import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import BrandLogo from '../ui/BrandLogo';

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const handleStart = () => navigate('/auth');

  return (
    <header className="fixed top-0 w-full z-50 border-b border-white/5 bg-black/90 backdrop-blur-md px-8 py-4 flex justify-between items-center ">
      <BrandLogo />
      
      {/* Desktop Links */}
      <div className="hidden md:flex gap-8 text-xs font-medium uppercase tracking-widest">
        <a href="#home" className="text-zinc-500 hover:text-white transition-colors">Home</a>
        <a href="#features" className="text-zinc-500 hover:text-white transition-colors">Features</a>
        <a href="#how-it-works" className="text-zinc-500 hover:text-white transition-colors">How it works</a>
      </div>
      
      {/* Desktop Buttons */}
      <div className="hidden md:flex items-center gap-4">
        <button  onClick={handleStart} className="px-6 py-2 border border-border-subtle text-white text-xs font-bold uppercase tracking-widest hover:bg-white hover:text-black transition-all">
          Launch Twin →
        </button>
      </div>

      {/* Mobile Menu Button */}
      <button
        className="md:hidden text-white"
        onClick={() => setOpen(!open)}
      >
        {open ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Mobile Menu Content */}
      {open && (
        <div className="fixed top-16 left-0 w-full bg-background border-b border-border-subtle z-40 md:hidden">
          <div className="px-8 py-6 flex flex-col gap-6 text-xs font-medium uppercase tracking-widest">
            <a href="#home" onClick={() => setOpen(false)} className="text-zinc-500 hover:text-white transition-colors">Home</a>
            <a href="#features" onClick={() => setOpen(false)} className="text-zinc-500 hover:text-white transition-colors">Features</a>
            <a href="#how-it-works" onClick={() => setOpen(false)} className="text-zinc-500 hover:text-white transition-colors">How it works</a>

            <div className="flex flex-col gap-4 pt-4 border-t border-border-subtle">
              <button onClick={handleStart} className="px-6 py-3 border border-border-subtle text-white text-xs font-bold uppercase tracking-widest hover:bg-white hover:text-black transition-all">
                Launch Twin →
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
