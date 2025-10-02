import React from 'react';
import type { AvatarConfig } from '../types';

interface AvatarProps {
  config: AvatarConfig;
  className?: string;
  isListening?: boolean;
  isSpeaking?: boolean;
}

const Avatar: React.FC<AvatarProps> = ({ config, className, isListening = false, isSpeaking = false }) => {
  const { style, seed } = config;
  const avatarUrl = `https://api.dicebear.com/8.x/${style}/svg?seed=${seed}&backgroundColor=b6e3f4,c0aede,d1d4f9`;
  
  const ringColor = isListening ? 'ring-blue-500' : isSpeaking ? 'ring-purple-500' : 'ring-transparent';
  
  // Determine the animation for the image itself
  let avatarAnimationClass = 'animate-breathing'; // Default idle animation
  if (isSpeaking) {
    avatarAnimationClass = 'animate-talking';
  }
  
  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      <div className={`absolute inset-0 rounded-full ring-4 ${ringColor} transition-all duration-300 ${isListening ? 'animate-pulse' : ''}`}></div>
      <img
        src={avatarUrl}
        alt="AI Friend Avatar"
        className={`w-full h-full rounded-full bg-white/50 transition-transform duration-300 ${avatarAnimationClass}`}
      />
    </div>
  );
};

export default Avatar;