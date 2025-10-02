
import React, { useState, useCallback } from 'react';
import type { AvatarConfig, Voice, Personality } from './types';
import { AppScreen } from './types';
import { PERSONALITIES, VOICES, AVATAR_STYLES } from './constants';
import CustomizationScreen from './components/CustomizationScreen';
import ChatScreen from './components/ChatScreen';

const App: React.FC = () => {
  const [screen, setScreen] = useState<AppScreen>(AppScreen.CUSTOMIZATION);
  const [avatar, setAvatar] = useState<AvatarConfig>({
    style: AVATAR_STYLES[0].id,
    seed: 'Sparky',
  });
  const [voice, setVoice] = useState<Voice>(VOICES[0].id);
  const [personality, setPersonality] = useState<Personality>(PERSONALITIES[0]);

  const handleStartChat = useCallback((
    newAvatar: AvatarConfig,
    newVoice: Voice,
    newPersonality: Personality
  ) => {
    setAvatar(newAvatar);
    setVoice(newVoice);
    setPersonality(newPersonality);
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
            initialAvatar={avatar}
            initialVoice={voice}
            initialPersonality={personality}
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
