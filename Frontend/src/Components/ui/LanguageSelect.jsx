import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, X, Globe, Check } from 'lucide-react';

/**
 * All languages supported by Sarvam AI's Saaras STT.
 * BCP-47 code → Display name.
 */
export const SARVAM_LANGUAGES = [
  { code: 'hi-IN', name: 'Hindi',      native: 'हिन्दी' },
  { code: 'en-IN', name: 'English',    native: 'English' },
  { code: 'mr-IN', name: 'Marathi',    native: 'मराठी' },
  { code: 'ta-IN', name: 'Tamil',      native: 'தமிழ்' },
  { code: 'te-IN', name: 'Telugu',     native: 'తెలుగు' },
  { code: 'kn-IN', name: 'Kannada',    native: 'ಕನ್ನಡ' },
  { code: 'ml-IN', name: 'Malayalam',  native: 'മലയാളം' },
  { code: 'gu-IN', name: 'Gujarati',   native: 'ગુજરાતી' },
  { code: 'pa-IN', name: 'Punjabi',    native: 'ਪੰਜਾਬੀ' },
  { code: 'bn-IN', name: 'Bengali',    native: 'বাংলা' },
  { code: 'od-IN', name: 'Odia',       native: 'ଓଡ଼ିଆ' },
  { code: 'as-IN', name: 'Assamese',   native: 'অসমীয়া' },
  { code: 'ur-IN', name: 'Urdu',       native: 'اردو' },
  { code: 'ne-IN', name: 'Nepali',     native: 'नेपाली' },
  { code: 'kok-IN', name: 'Konkani',   native: 'कोंकणी' },
  { code: 'ks-IN', name: 'Kashmiri',   native: 'कॉशुर' },
  { code: 'sd-IN', name: 'Sindhi',     native: 'سنڌي' },
  { code: 'sa-IN', name: 'Sanskrit',   native: 'संस्कृतम्' },
  { code: 'sat-IN', name: 'Santali',   native: 'ᱥᱟᱱᱛᱟᱲᱤ' },
  { code: 'mni-IN', name: 'Manipuri',  native: 'মৈতৈলোন্' },
  { code: 'brx-IN', name: 'Bodo',      native: 'बड़ो' },
  { code: 'mai-IN', name: 'Maithili',  native: 'मैथिली' },
  { code: 'doi-IN', name: 'Dogri',     native: 'डोगरी' },
];

/**
 * Multi-select dropdown for Sarvam-supported languages.
 *
 * Props:
 *  - value: string — comma-separated BCP-47 codes (e.g. "hi-IN,mr-IN")
 *  - onChange: (newValue: string) => void
 */
export default function LanguageSelect({ value = '', onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);

  const selected = value ? value.split(',').filter(Boolean) : [];

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (code) => {
    let next;
    if (selected.includes(code)) {
      next = selected.filter(c => c !== code);
    } else {
      next = [...selected, code];
    }
    onChange(next.join(','));
  };

  const remove = (code, e) => {
    e.stopPropagation();
    onChange(selected.filter(c => c !== code).join(','));
  };

  const filtered = SARVAM_LANGUAGES.filter(lang =>
    lang.name.toLowerCase().includes(search.toLowerCase()) ||
    lang.native.toLowerCase().includes(search.toLowerCase()) ||
    lang.code.toLowerCase().includes(search.toLowerCase())
  );

  const getName = (code) => SARVAM_LANGUAGES.find(l => l.code === code)?.name || code;

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(o => !o)}
        className={`w-full bg-zinc-900/50 border rounded-xl px-4 py-3 text-left flex items-center gap-2 transition-colors
          ${isOpen ? 'border-zinc-500' : 'border-zinc-800 hover:border-zinc-600'}`}
      >
        <Globe size={16} className="text-zinc-500 shrink-0" />
        <div className="flex-1 flex flex-wrap gap-1.5 min-h-[24px]">
          {selected.length === 0 ? (
            <span className="text-zinc-500 text-sm">Select languages…</span>
          ) : (
            selected.map(code => (
              <span
                key={code}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded-md text-xs text-zinc-200"
              >
                {getName(code)}
                <button
                  type="button"
                  onClick={(e) => remove(code, e)}
                  className="text-zinc-500 hover:text-red-400 transition-colors"
                >
                  <X size={12} />
                </button>
              </span>
            ))
          )}
        </div>
        <ChevronDown size={16} className={`text-zinc-500 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 mt-2 w-full bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden"
          >
            {/* Search */}
            <div className="p-2 border-b border-zinc-800">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search languages…"
                className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600 transition-colors"
                autoFocus
              />
            </div>

            {/* Options list */}
            <div className="max-h-56 overflow-y-auto overscroll-contain py-1 custom-scrollbar">
              {filtered.length === 0 ? (
                <div className="px-4 py-3 text-sm text-zinc-500 text-center">No languages found</div>
              ) : (
                filtered.map(lang => {
                  const isSelected = selected.includes(lang.code);
                  return (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => toggle(lang.code)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors
                        ${isSelected
                          ? 'bg-zinc-800/50 text-white'
                          : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
                        }`}
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors
                        ${isSelected ? 'bg-white border-white' : 'border-zinc-700'}`}>
                        {isSelected && <Check size={12} className="text-black" />}
                      </div>
                      <span className="flex-1 text-left">{lang.name}</span>
                      <span className="text-xs text-zinc-600">{lang.native}</span>
                      <span className="text-[10px] font-mono text-zinc-700">{lang.code}</span>
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer */}
            {selected.length > 0 && (
              <div className="p-2 border-t border-zinc-800 flex justify-between items-center">
                <span className="text-xs text-zinc-500">{selected.length} selected</span>
                <button
                  type="button"
                  onClick={() => { onChange(''); setIsOpen(false); }}
                  className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
                >
                  Clear all
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
