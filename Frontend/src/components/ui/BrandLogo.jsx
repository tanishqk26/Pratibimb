import React from 'react';
import assets from '../../assets/assets';

export default function BrandLogo({ className = "", justify = "start" }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <img src={assets.logo} alt="Pratibimb" className="w-8 h-8 opacity-80 rounded-lg " />
      <div className="flex flex-col items-start translate-y-[-1px]">
        <span className="text-xl font-bold tracking-[0.1em] text-white uppercase font-display leading-none">Pratibimb</span>
        <span className="text-[6px] font-bold tracking-[0.4em] text-zinc-500 uppercase mt-1">Ethereal Precision</span>
      </div>
    </div>
  );
}
