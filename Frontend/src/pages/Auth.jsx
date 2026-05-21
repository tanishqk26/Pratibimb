import React, { useState } from 'react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import BrandLogo from '../components/ui/BrandLogo';

export default function Auth() {
  const navigate = useNavigate();
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAuth = async () => {
    setError('');
    setLoading(true);
    try {
      const endpoint = isRegistering ? '/auth/register' : '/auth/login';
      const res = await fetch(`http://localhost:8000${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isRegistering ? { name, email, password } : { email, password })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        let errorMessage = 'Authentication failed';
        if (typeof data.detail === 'string') {
          errorMessage = data.detail;
        } else if (Array.isArray(data.detail) && data.detail.length > 0) {
          errorMessage = data.detail[0].msg;
        }
        throw new Error(errorMessage);
      }

      if (isRegistering) {
        // Automatically login after register
        const loginRes = await fetch('http://localhost:8000/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const loginData = await loginRes.json();
        if (loginRes.ok) {
          localStorage.setItem('token', loginData.access_token);
          navigate('/dashboard');
        } else {
          throw new Error(loginData.detail || 'Login after registration failed');
        }
      } else {
        localStorage.setItem('token', data.access_token);
        navigate('/dashboard');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen flex items-center justify-center p-6 bg-background relative overflow-hidden"
    >
      <div className="absolute inset-0 bg-white/[0.02] blur-3xl rounded-full scale-150 pointer-events-none" />
      
      <div className="w-full max-w-md relative z-10 text-center">
         <BrandLogo className="mb-12 justify-center" />
         <div className="border border-border-subtle rounded-2xl p-10 bg-background/50 backdrop-blur-xl text-left">
           <h2 className="text-3xl mb-2 text-white">{isRegistering ? 'Create Identity' : 'Identity Access'}</h2>
           <p className="text-zinc-500 text-sm mb-8">Synchronize with your digital twin.</p>
           
           {error && <div className="mb-6 p-3 border border-red-900 bg-red-900/20 text-red-500 text-xs rounded-xl">{error}</div>}

           <div className="space-y-6">
             {isRegistering && (
               <div className="space-y-2">
                 <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Identity Name</label>
                 <input 
                   type="text" 
                   value={name}
                   onChange={(e) => setName(e.target.value)}
                   placeholder="Your Name" 
                   className="w-full bg-background border border-border-subtle p-3 rounded-xl focus:border-white outline-none transition-colors text-white" 
                 />
               </div>
             )}
             <div className="space-y-2">
               <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Email Address</label>
               <input 
                 type="email" 
                 value={email}
                 onChange={(e) => setEmail(e.target.value)}
                 placeholder="Email" 
                 className="w-full bg-background border border-border-subtle p-3 rounded-xl focus:border-white outline-none transition-colors text-white" 
               />
             </div>
             <div className="space-y-2">
               <div className="flex justify-between items-center">
                 <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Security Key</label>
               </div>
               <input 
                 type="password" 
                 value={password}
                 onChange={(e) => setPassword(e.target.value)}
                 placeholder="••••••••" 
                 className="w-full bg-background border border-border-subtle p-3 rounded-xl focus:border-white outline-none transition-colors text-white" 
               />
             </div>
             
             <button 
               onClick={handleAuth}
               disabled={loading}
               className="w-full py-4 border border-white text-[10px] text-white font-bold uppercase tracking-[0.3em] hover:bg-white hover:text-black transition-all mt-4 disabled:opacity-50"
             >
               {loading ? 'Processing...' : isRegistering ? 'Initialize Twin' : 'Login'}
             </button>
           </div>
           
           <div className="relative my-8 text-center">
             <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border-subtle"></div></div>
             <span className="relative px-4 bg-background text-[10px] text-zinc-600 uppercase">OR</span>
           </div>
           
           <button 
             onClick={() => { setIsRegistering(!isRegistering); setError(''); }}
             className="w-full text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-white transition-colors"
           >
              {isRegistering ? 'Access Existing Identity' : 'Create New Identity'}
           </button>
         </div>
         
         <div className="mt-12 flex justify-center items-center gap-4 text-[10px] uppercase tracking-widest text-zinc-600">
           <span className="flex items-center gap-2"><Lock size={10} /> Encryption Active</span>
           <div className="w-1 h-1 bg-border-subtle rounded-full" />
           <span>v1.0.4-LUNA</span>
         </div>
      </div>
    </motion.div>
  );
}
