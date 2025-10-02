
import React, { useEffect, useRef } from 'react';
import type { AvatarConfig, Voice, Personality } from '../types';
import { AVATAR_STYLES, VOICES, PERSONALITIES } from '../constants';
import Avatar from './Avatar';
import { SparkleIcon } from './icons/SparkleIcon';

interface CustomizationScreenProps {
  avatar: AvatarConfig;
  voice: Voice;
  personality: Personality;
  onAvatarChange: (avatar: AvatarConfig) => void;
  onVoiceChange: (voice: Voice) => void;
  onPersonalityChange: (personality: Personality) => void;
  onStartChat: () => void;
}

const VOICE_PREVIEWS: Record<Voice, string> = {
  Zephyr: 'https://storage.googleapis.com/aistudio-samples/samantha-hi.mp3', // Warm female voice
  Puck: 'https://storage.googleapis.com/aistudio-samples/lily-hi.mp3', // Cheerful female voice
  Charon: 'https://storage.googleapis.com/aistudio-samples/alex-hi.mp3', // Deep male voice
  Kore: 'https://storage.googleapis.com/aistudio-samples/tom-hi.mp3', // Friendly male voice
  Fenrir: 'https://storage.googleapis.com/aistudio-samples/oliver-hi.mp3', // Energetic male voice
};


const CustomizationScreen: React.FC<CustomizationScreenProps> = ({
  avatar,
  voice,
  personality,
  onAvatarChange,
  onVoiceChange,
  onPersonalityChange,
  onStartChat,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  if (audioRef.current === null) {
      audioRef.current = new Audio();
  }

  useEffect(() => {
    const audio = audioRef.current;
    // Cleanup audio element on component unmount
    return () => {
      if (audio) {
        audio.pause();
        audio.src = '';
      }
    };
  }, []);

  const playVoicePreview = (voiceId: Voice) => {
    const audio = audioRef.current;
    if (!audio) return;

    const audioUrl = VOICE_PREVIEWS[voiceId];
    if (audioUrl) {
      audio.src = audioUrl;
      audio.play().catch(e => console.error("Error playing audio preview:", e));
    }
  };
  
  const handleVoiceSelection = (voiceId: Voice) => {
    onVoiceChange(voiceId);
    playVoicePreview(voiceId);
  };

  const handleStartClick = () => {
    // Stop any preview voice before transitioning to the chat screen
    if (audioRef.current) {
      audioRef.current.pause();
    }
    onStartChat();
  };

  return (
    <div className="flex flex-col h-full p-6 text-gray-800 overflow-y-auto">
      <header className="text-center mb-6">
        <h1 className="text-4xl font-bold text-indigo-700">Create Your AI Friend</h1>
        <p className="text-gray-600 mt-2">Design a companion who's just right for you!</p>
      </header>
      
      <div className="flex-grow space-y-6">
        {/* Avatar Section */}
        <section className="bg-white/60 p-4 rounded-2xl shadow-md">
          <h2 className="text-xl font-semibold mb-3 text-purple-700">1. Choose an Avatar</h2>
          <div className="flex flex-col md:flex-row items-center gap-6">
            <Avatar config={avatar} className="w-28 h-28 flex-shrink-0" />
            <div className="w-full">
              <label className="block text-sm font-medium text-gray-700">Style</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {AVATAR_STYLES.map(style => (
                  <button key={style.id} onClick={() => onAvatarChange({ ...avatar, style: style.id })} className={`px-3 py-1 text-sm rounded-full transition-colors ${avatar.style === style.id ? 'bg-purple-600 text-white' : 'bg-gray-200 hover:bg-purple-200'}`}>{style.name}</button>
                ))}
              </div>
              <label className="block text-sm font-medium text-gray-700 mt-3">Name or Keyword</label>
              <input type="text" value={avatar.seed} onChange={e => onAvatarChange({...avatar, seed: e.target.value})} className="w-full mt-1 p-2 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500 bg-gray-50 text-gray-900"/>
            </div>
          </div>
        </section>

        {/* Voice Section */}
        <section className="bg-white/60 p-4 rounded-2xl shadow-md">
          <h2 className="text-xl font-semibold mb-3 text-green-700">2. Select a Voice</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
            {VOICES.map(v => (
              <button key={v.id} onClick={() => handleVoiceSelection(v.id)} className={`p-3 text-center rounded-lg transition-colors ${voice === v.id ? 'bg-green-500 text-white shadow-lg' : 'bg-gray-200 hover:bg-green-200'}`}>{v.name}</button>
            ))}
          </div>
        </section>

        {/* Personality Section */}
        <section className="bg-white/60 p-4 rounded-2xl shadow-md">
          <h2 className="text-xl font-semibold mb-3 text-blue-700">3. Pick a Personality</h2>
          <div className="space-y-3">
            {PERSONALITIES.map(p => (
              <div key={p.id} onClick={() => onPersonalityChange(p)} className={`flex items-center gap-4 p-3 rounded-lg cursor-pointer transition-all ${personality.id === p.id ? 'bg-blue-500 text-white shadow-lg ring-2 ring-blue-300' : 'bg-gray-100 hover:bg-blue-100'}`}>
                <SparkleIcon className="w-8 h-8 flex-shrink-0" />
                <div>
                  <h3 className="font-bold">{p.name}</h3>
                  <p className="text-sm">{p.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <footer className="mt-6">
        <button onClick={handleStartClick} className="w-full bg-indigo-600 text-white font-bold py-4 rounded-xl text-xl hover:bg-indigo-700 transition-transform transform hover:scale-105 shadow-lg">
          Let's Chat!
        </button>
      </footer>
    </div>
  );
};

export default CustomizationScreen;
