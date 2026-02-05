import React, { useState } from 'react';

export default function WindowControls() {
  const [isHovered, setIsHovered] = useState(false);

  const handleClose = () => window.electronAPI?.closeWindow?.();
  const handleMinimize = () => window.electronAPI?.minimizeWindow?.();
  const handleMaximize = () => window.electronAPI?.maximizeWindow?.();

  return (
    <div
      className="flex items-center gap-2 mr-4"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <button
        onClick={handleClose}
        className={`w-3 h-3 rounded-full transition-all duration-150 ${
          isHovered ? 'bg-[#ff5f57]' : 'bg-codex-muted/50'
        }`}
      />
      <button
        onClick={handleMinimize}
        className={`w-3 h-3 rounded-full transition-all duration-150 ${
          isHovered ? 'bg-[#febc2e]' : 'bg-codex-muted/50'
        }`}
      />
      <button
        onClick={handleMaximize}
        className={`w-3 h-3 rounded-full transition-all duration-150 ${
          isHovered ? 'bg-[#28c840]' : 'bg-codex-muted/50'
        }`}
      />
    </div>
  );
}
