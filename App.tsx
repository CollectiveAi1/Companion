
import React, { useState, useCallback, useEffect } from 'react';
import type { AvatarConfig, Voice, Personality } from './types';
import { AppScreen } from './types';
import { PERSONALITIES, VOICES, AVATAR_STYLES } from './constants';
import CustomizationScreen from './components/CustomizationScreen';
import ChatScreen from './components/ChatScreen';

const App: React.FC = () => {
  const [screen, setScreen] = useState<AppScreen>(AppScreen.CUSTOMIZATION);

  const [avatar, setAvatar] = useState<AvatarConfig>(() => {
    try {
      const savedAvatar = localStorage.getItem('ai-friend-avatar');
      return savedAvatar ? JSON.parse(savedAvatar) : { style: AVATAR_STYLES[0].id, seed: 'Sparky' };
    } catch {
      return { style: AVATAR_STYLES[0].id, seed: 'Sparky' };
    }
  });

  const [voice, setVoice] = useState<Voice>(() => {
    const savedVoice = localStorage.getItem('ai-friend-voice');
    return (savedVoice && VOICES.some(v => v.id === savedVoice))
      ? savedVoice as Voice
      : VOICES[0].id;
  });

  const [personality, setPersonality] = useState<Personality>(() => {
    try {
      const savedPersonality = localStorage.getItem('ai-friend-personality');
      const parsedPersonality = savedPersonality ? JSON.parse(savedPersonality) : null;
      return (parsedPersonality && PERSONALITIES.some(p => p.id === parsedPersonality.id))
        ? parsedPersonality
        : PERSONALITIES[0];
    } catch {
      return PERSONALITIES[0];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('ai-friend-avatar', JSON.stringify(avatar));
    } catch (e) {
      console.error("Failed to save avatar to localStorage", e);
    }
  }, [avatar]);

  useEffect(() => {
    try {
      localStorage.setItem('ai-friend-voice', voice);
    } catch (e) {
      console.error("Failed to save voice to localStorage", e);
    }
  }, [voice]);

  useEffect(() => {
    try {
      localStorage.setItem('ai-friend-personality', JSON.stringify(personality));
    } catch (e) {
      console.error("Failed to save personality to localStorage", e);
    }
  }, [personality]);

  const handleStartChat = useCallback(() => {
    setScreen(AppScreen.CHAT);
  }, []);

  const handleEndChat = useCallback(() => {
    setScreen(AppScreen.CUSTOMIZATION);
  }, []);

  return (
    <main className="bg-gradient-to-br from-purple-200 via-indigo-200 to-blue-200 min-h-screen w-full flex flex-col items-center justify-center font-sans p-4">
      <div className="w-full max-w-2xl h-[90vh] max-h-[800px] bg-white/70 backdrop-blur-xl rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {screen === AppScreen.CUSTOMIZATION ? (
          <CustomizationScreen
            avatar={avatar}
            voice={voice}
            personality={personality}
            onAvatarChange={setAvatar}
            onVoiceChange={setVoice}
            onPersonalityChange={setPersonality}
            onStartChat={handleStartChat}
          />
        ) : (
          <ChatScreen
            avatar={avatar}
            voice={voice}
            personality={personality}
            onEndChat={handleEndChat}
          />
        )}
      </div>
       <footer className="text-center mt-4 text-xs text-gray-500">
          <p>Built with React & Gemini API. Avatars by DiceBear.</p>
        </footer>
    </main>
  );
};

export default App;
