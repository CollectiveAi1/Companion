import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { AvatarConfig, Voice, Personality } from './types';
import { AppScreen } from './types';
import { PERSONALITIES, VOICES, AVATAR_STYLES } from './constants';
import CustomizationScreen from './components/CustomizationScreen';
import ChatScreen from './components/ChatScreen';

const App: React.FC = () => {
  const [screen, setScreen] = useState<AppScreen>(AppScreen.CUSTOMIZATION);
  const [apiKeyExists, setApiKeyExists] = useState(true);
  const outputAudioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    // In a browser environment, `process` might not be defined.
    // This check prevents the app from crashing and provides a clear error message.
    try {
      if (!process.env.API_KEY) {
        setApiKeyExists(false);
      }
    } catch (e) {
       // If process is not defined, it will throw an error.
      setApiKeyExists(false);
    }
  }, []);

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
      : 'Zephyr'; // Set a specific, friendly default
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
    // Create and resume the AudioContext here, as it's a direct user action.
    // This is crucial for browsers' autoplay policies.
    if (!outputAudioContextRef.current) {
      try {
        outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      } catch (e) {
        console.error("Failed to create AudioContext", e);
        // Let the render logic handle showing an error.
      }
    }
    // Resume in case it was suspended from a previous session or browser state.
    if (outputAudioContextRef.current && outputAudioContextRef.current.state === 'suspended') {
        outputAudioContextRef.current.resume();
    }
    setScreen(AppScreen.CHAT);
  }, []);

  const handleEndChat = useCallback(() => {
    setScreen(AppScreen.CUSTOMIZATION);
  }, []);

  const renderContent = () => {
    if (!apiKeyExists) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center p-8 text-gray-800">
            <h1 className="text-3xl font-bold text-red-600 mb-4">Configuration Error</h1>
            <p className="text-lg">The Gemini API key is missing from the environment.</p>
            <p className="text-gray-600 mt-2">Please ensure the <code>API_KEY</code> environment variable is set correctly in your development environment to use this application.</p>
        </div>
      );
    }
    
    if (screen === AppScreen.CUSTOMIZATION) {
      return (
        <CustomizationScreen
          avatar={avatar}
          voice={voice}
          personality={personality}
          onAvatarChange={setAvatar}
          onVoiceChange={setVoice}
          onPersonalityChange={setPersonality}
          onStartChat={handleStartChat}
        />
      );
    }

    if (screen === AppScreen.CHAT) {
        if (!outputAudioContextRef.current) {
            // This can happen if AudioContext is not supported or failed to initialize.
            return (
              <div className="flex flex-col items-center justify-center h-full text-center p-8 text-gray-800">
                <h1 className="text-3xl font-bold text-red-600 mb-4">Audio Error</h1>
                <p className="text-lg">Could not initialize audio for the chat.</p>
                <p className="text-sm text-gray-500 mt-1">Your browser may not support the required Web Audio API.</p>
                <button onClick={handleEndChat} className="mt-6 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                    Go Back
                </button>
              </div>
            );
        }
        return (
           <ChatScreen
              outputAudioContext={outputAudioContextRef.current}
              avatar={avatar}
              voice={voice}
              personality={personality}
              onEndChat={handleEndChat}
            />
        );
    }
  }

  return (
    <main className="bg-gradient-to-br from-purple-200 via-indigo-200 to-blue-200 min-h-screen w-full flex flex-col items-center justify-center font-sans p-4">
      <div className="w-full max-w-2xl h-[90vh] max-h-[800px] bg-white/70 backdrop-blur-xl rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {renderContent()}
      </div>
       <footer className="text-center mt-4 text-xs text-gray-500">
          <p>Built with React & Gemini API. Avatars by DiceBear.</p>
        </footer>
    </main>
  );
};

export default App;