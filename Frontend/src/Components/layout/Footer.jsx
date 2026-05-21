import React from 'react';

export default function Footer() {
  return (
    <footer className="w-full py-16 px-12 mt-24 border-t border-border-subtle flex flex-col md:flex-row justify-between items-center gap-8 relative z-10 text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-600 bg-background">
      <div>© 2026 PRATIBIMB. Ethereal Precision.</div>
      <nav className="flex gap-12">
        <a href="#" className="hover:text-white transition-colors">Privacy</a>
        <a href="#" className="hover:text-white transition-colors">Terms</a>
        <a href="#" className="hover:text-white transition-colors">API</a>
      </nav>
    </footer>
  );
}
