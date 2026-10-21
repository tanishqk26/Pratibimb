import React from 'react';
import BrandLogo from '../ui/BrandLogo';
import NavLinks from '../ui/NavLinks';
import { useNavigate } from 'react-router-dom';

export default function Sidebar() {
  const navigate = useNavigate();
  
  const handleSignOut = () => {
    // Perform sign out logic here
    navigate('/');
  };

  return (
    <aside className="hidden lg:flex flex-col w-64 border-r border-border-subtle p-6 fixed h-screen bg-background">
      <BrandLogo className="mb-12" />
      <NavLinks />
      
      <div className="mt-auto">
        <button 
          onClick={handleSignOut}
          className="w-full py-3 border border-border-subtle rounded-lg text-xs font-bold tracking-widest hover:bg-white hover:text-black transition-all mb-4 uppercase text-white"
        >
          Sign Out
        </button>
      </div>
    </aside>
  );
}
