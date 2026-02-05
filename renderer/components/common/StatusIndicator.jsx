import React from 'react';
import { Circle } from 'lucide-react';

export default function StatusIndicator({ status, statusText, showText = true }) {
  const getStatusClasses = () => {
    switch (status) {
      case 'connected':
      case 'listening':
        return {
          bg: 'bg-emerald-500/15',
          circle: 'fill-emerald-400 text-emerald-400',
          text: 'text-emerald-400'
        };
      case 'connecting':
        return {
          bg: 'bg-amber-500/15',
          circle: 'fill-amber-400 text-amber-400 animate-pulse',
          text: 'text-amber-400'
        };
      case 'error':
        return {
          bg: 'bg-red-500/15',
          circle: 'fill-red-400 text-red-400',
          text: 'text-red-400'
        };
      default:
        return {
          bg: '',
          circle: 'fill-codex-muted text-codex-muted',
          text: 'text-codex-text-secondary'
        };
    }
  };

  const classes = getStatusClasses();

  if (!showText) {
    return (
      <Circle size={8} className={`transition-colors ${classes.circle}`} />
    );
  }

  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-colors ${classes.bg}`}>
      <Circle size={6} className={`transition-colors ${classes.circle}`} />
      <span className={`text-xs transition-colors ${classes.text}`}>
        {statusText}
      </span>
    </div>
  );
}
