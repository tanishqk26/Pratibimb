import React from 'react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Mic, ShieldCheck, RefreshCcw, Activity } from 'lucide-react';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/layout/Footer';

// Images
import hero1 from '../assets/images/hero1.png';
import hero2 from '../assets/images/hero2.png';
import neuralMap from '../assets/images/neural_map.png';
import heroFiber from '../assets/images/hero_fiber.png';

export default function Landing() {
  const navigate = useNavigate();
  const handleStart = () => navigate('/auth');

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="bg-background relative min-h-screen flex flex-col"
    >
      <Navbar />

      {/* Hero */}
      <section id="home" className="relative min-h-screen flex flex-col justify-center px-6 overflow-hidden pt-32 pb-20">
        <div className="absolute inset-0 z-0 opacity-20">
          <img src={heroFiber} className="w-full h-full object-cover scale-110" alt="Ethereal Fiber" />
        </div>
        
        <div className="relative z-10 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left: Text Content */}
          <div>
            <motion.h1 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="text-6xl md:text-8xl mb-6 leading-tight whitespace-pre-wrap text-white"
            >
              Meet Your{"\n"}AI Twin
            </motion.h1>
            <motion.p 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-lg md:text-xl text-zinc-400 mb-10 max-w-lg"
            >
              A clinical precision reflection of your digital existence. Engineered for intelligence, order, and effortless control.
            </motion.p>
            <motion.button 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.6 }}
              onClick={handleStart}
              className="px-12 py-4 border border-white text-xs text-white font-bold uppercase tracking-[0.3em] hover:bg-white hover:text-black transition-all"
            >
              Create Twin
            </motion.button>
          </div>

          {/* Right: Two Image Blocks */}
          <div className="flex flex-col gap-8 w-full">
            <motion.div 
              initial={{ x: 20, opacity: 1 }}
              animate={{ x: 0, opacity: 2 }}
              transition={{ delay: 0.4 }}
              className="group relative w-full h-64 md:h-72 rounded-2xl overflow-hidden border border-border-subtle transition-all bg-surface"
            >
              <img src={hero1} className="w-full h-full object-cover opacity-100 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700" alt="Neural interface visualization" />
              <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent opacity-60" />
            </motion.div>

            {/* <motion.div 
              initial={{ x: 20, opacity: 1 }}
              animate={{ x: 0, opacity: 2 }}
              transition={{ delay: 0.6 }}
              className="group relative w-full h-64 md:h-72 rounded-2xl overflow-hidden border border-border-subtle transition-all bg-surface"
            >
              <img src={hero2} className="w-full h-full object-cover opacity-100 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700" alt="Digital twin framework" />
            </motion.div> */}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-24 px-6 max-w-7xl mx-auto w-full">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          <div className="md:col-span-8 group relative h-[500px] border border-border-subtle p-12 overflow-hidden rounded-2xl">
            <img src={neuralMap} className="absolute inset-0 w-full h-full object-cover opacity-10 group-hover:opacity-20 transition-opacity duration-700" alt="Neural Map" />
            <div className="relative z-10 flex flex-col h-full">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-4 block">Intelligence</span>
              <h2 className="text-4xl mb-6 text-white">Memory Persistence</h2>
              <p className="text-zinc-400 max-w-md text-lg leading-relaxed mb-auto">
                Your twin archives every interaction, creating a semantic web of your knowledge and preferences that grows in fidelity over time.
              </p>
              <button className="flex items-center gap-2 text-white font-bold uppercase text-[10px] tracking-widest hover:gap-4 transition-all group">
                Explore Archive <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
          <div className="md:col-span-4 border border-border-subtle p-12 rounded-2xl bg-white/[0.02] flex flex-col justify-between h-[500px]">
             <div className="w-12 h-12 border border-border-subtle rounded-xl flex items-center justify-center mb-8">
               <Mic size={20} className="text-white" />
             </div>
             <div>
               <h3 className="text-2xl mb-4 text-white">Vocal Synthesis</h3>
               <p className="text-zinc-500 text-sm leading-relaxed">
                 Low-latency acoustic mirroring that captures the subtle nuances of your unique tonal signature.
               </p>
             </div>
             <div className="pt-12 flex items-end gap-1 h-12">
                {[4, 8, 5, 7, 3, 9, 4, 6].map((h, i) => (
                  <motion.div 
                    key={i} 
                    animate={{ height: [`${h * 4}px`, `${h * 6}px`, `${h * 4}px`] }}
                    transition={{ repeat: Infinity, duration: 1.5, delay: i * 0.1 }}
                    className="w-1 bg-white" 
                  />
                ))}
             </div>
          </div>
          
          <div className="md:col-span-4 border border-border-subtle p-10 rounded-2xl group hover:border-white transition-all">
             <ShieldCheck size={24} className="text-zinc-600 mb-6" />
             <h3 className="text-xl mb-3 text-white">Encrypted Core</h3>
             <p className="text-zinc-500 text-sm">Zero-knowledge architecture ensures your twin remains a private reflection of only you.</p>
          </div>
          <div className="md:col-span-4 border border-border-subtle p-10 rounded-2xl group hover:border-white transition-all">
             <RefreshCcw size={24} className="text-zinc-600 mb-6" />
             <h3 className="text-xl mb-3 text-white">Real-time Sync</h3>
             <p className="text-zinc-500 text-sm">Seamless integration across your digital ecosystem, updating your twin as you evolve.</p>
          </div>
          <div className="md:col-span-4 border border-border-subtle p-10 rounded-2xl group hover:border-white transition-all">
             <Activity size={24} className="text-zinc-600 mb-6" />
             <h3 className="text-xl mb-3 text-white">Adaptive Memory</h3>
             <p className="text-zinc-500 text-sm">Your twin evolves with every interaction, building a deeper understanding of you over time.</p>
          </div>
        </div>
      </section>

      {/* Voice Section */}
      <section id="how-it-works" className="py-24 px-6 max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-24 items-center w-full">
        <div className="relative aspect-square border border-border-subtle rounded-full p-4 group">
          <div className="absolute inset-0 border border-white/5 rounded-full animate-pulse-slow" />
          <div className="w-full h-full rounded-full border border-border-subtle overflow-hidden relative bg-surface">
            <img src={hero2} className="w-full h-full object-cover grayscale opacity-40 group-hover:opacity-60 transition-opacity duration-700" alt="Waveform" />
          </div>
        </div>
        <div className="space-y-8">
          <h2 className="text-5xl leading-tight text-white">Conversation with Depth.</h2>
          <p className="text-xl text-zinc-400 leading-relaxed">
            Pratibimb doesn't just listen; it understands context, emotion, and the unspoken weight between words. Your voice, synthesized with ethereal accuracy.
          </p>
          <div className="flex gap-4">
            <div className="px-6 py-2 border border-border-subtle rounded-full text-[10px] text-white font-bold tracking-widest uppercase flex items-center gap-2">
               <div className="w-1.5 h-1.5 bg-white rounded-full" /> Low Latency
            </div>
            <div className="px-6 py-2 border border-border-subtle rounded-full text-[10px] text-white font-bold tracking-widest uppercase flex items-center gap-2">
               <div className="w-1.5 h-1.5 bg-white rounded-full" /> Neural Clarity
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-32 border-t border-border-subtle mt-24 text-center w-full">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-5xl mb-8 text-white">Start Building Your Digital Self</h2>
          <p className="text-zinc-500 text-lg mb-12">Join the alpha phase of ethereal precision. Limited slots available for v1.0 deployment.</p>
          <div className="flex flex-col md:flex-row gap-4 justify-center">
            <button onClick={handleStart} className="px-10 py-5 bg-white text-black text-[10px] font-bold uppercase tracking-widest hover:bg-zinc-200 transition-all">
              Begin Initialization
            </button>
            <button className="px-10 py-5 border border-border-subtle text-white text-[10px] font-bold uppercase tracking-widest hover:bg-white/5 transition-all">
              Read Whitepaper
            </button>
          </div>
        </div>
      </section>

      <Footer />
    </motion.div>
  );
}
