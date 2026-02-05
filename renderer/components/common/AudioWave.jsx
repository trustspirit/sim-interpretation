import React from 'react';

export default function AudioWave({ isActive, audioLevel }) {
  const bars = 4;
  return (
    <div className="flex items-center gap-[2px] h-3">
      {[...Array(bars)].map((_, i) => {
        const scale = isActive 
          ? 0.3 + audioLevel * 0.7 + Math.sin(Date.now() / 120 + i * 0.8) * 0.2 
          : 0.15;
        return (
          <div
            key={i}
            className="w-[2px] bg-codex-live rounded-full transition-all duration-75"
            style={{ height: `${Math.max(3, scale * 12)}px` }}
          />
        );
      })}
    </div>
  );
}
