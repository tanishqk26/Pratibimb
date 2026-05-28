import React from 'react';
import { Routes, Route, Outlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Home, User, Users } from 'lucide-react';

// Layouts
import Sidebar from '../components/layout/Sidebar';
import Topbar from '../components/layout/Topbar';
import { NavIcon } from '../components/ui/NavLinks';

// Pages
import Landing from '../pages/Landing';
import Auth from '../pages/Auth';
import Dashboard from '../pages/Dashboard';
import Twins from '../pages/Twins';
import TwinWorkspace from '../pages/TwinWorkspace'; 
import Profile from '../pages/Profile';
import Voice from '../pages/Voice';

function DashboardLayout() {
  return (
    <motion.div 
      key="app-shell"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex min-h-screen bg-background"
    >
      <Sidebar />
      <main className="flex-1 lg:ml-64 pb-20 lg:pb-0">
        <Topbar />
        <div className="p-6 lg:p-12 max-w-6xl mx-auto">
          <Outlet />
        </div>
      </main>
      
      {/* Mobile Bottom Nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-background border-t border-border-subtle flex justify-around items-center z-50">
        <NavIcon icon={Home} to="/dashboard" />
        <NavIcon icon={Users} to="/twins" />
        <NavIcon icon={User} to="/profile" />
      </nav>
    </motion.div>
  );
}

export default function AppRoutes() {
  return (
    <AnimatePresence mode="wait">
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/auth" element={<Auth />} />
        
        {/* Dashboard Routes wrapped in a Layout */}
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/twins" element={<Twins />} />
          <Route path="/twins/:twinId" element={<TwinWorkspace />} />
          <Route path="/profile" element={<Profile />} />
        </Route>
        
        {/* Voice takes up full screen, no dashboard layout needed usually, but user had it separate in the original. It overlays full screen anyway. */}
        <Route path="/voice" element={<Voice />} />
      </Routes>
    </AnimatePresence>
  );
}
