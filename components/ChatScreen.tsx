import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { AvatarConfig, Voice, Personality, Transcript } from '../types';
import type { LiveSession, LiveServerMessage } from '@google/genai';
import { GoogleGenAI, Modality } from '@google/genai';
import Avatar from './Avatar';
import { MicrophoneIcon } from './icons/MicrophoneIcon';

// --- Audio Utility Functions ---
function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}


// --- Component ---

interface ChatScreenProps {
  avatar: AvatarConfig;
  voice: Voice;
  personality: Personality;
  onEndChat: () => void;
}

const ChatScreen: React.FC<ChatScreenProps> = ({
  avatar,
  voice,
  personality,
  onEndChat,
}) => {
  const [status, setStatus] = useState('Connecting...');
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [currentInput, setCurrentInput] = useState('');
  const [currentOutput, setCurrentOutput] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);

  const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const nextStartTimeRef = useRef(0);
  const audioSourcesRef = useRef(new Set<AudioBufferSourceNode>());
  const currentInputRef = useRef('');
  const currentOutputRef = useRef('');


  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts, currentInput, currentOutput]);

  const connectToGemini = useCallback(async () => {
    setStatus('Getting ready...');
    if (!process.env.API_KEY) {
      setStatus('Error: API Key not found.');
      return;
    }

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const outputNode = outputAudioContextRef.current.createGain();
      outputNode.connect(outputAudioContextRef.current.destination);

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: async () => {
            setStatus('Connected! Speak whenever you like.');
             try {
              streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
              inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
              mediaStreamSourceRef.current = inputAudioContextRef.current.createMediaStreamSource(streamRef.current);
              scriptProcessorRef.current = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
              
              scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
                const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                const int16Data = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                  // Convert float32 to int16, clamping to avoid clipping
                  int16Data[i] = Math.max(-1, Math.min(1, inputData[i])) * 32767;
                }
                const pcmBlob = {
                  data: encode(new Uint8Array(int16Data.buffer)),
                  mimeType: 'audio/pcm;rate=16000',
                };
                sessionPromiseRef.current?.then((session) => {
                  session.sendRealtimeInput({ media: pcmBlob });
                });
              };
              mediaStreamSourceRef.current.connect(scriptProcessorRef.current);
              scriptProcessorRef.current.connect(inputAudioContextRef.current.destination);
             } catch (err) {
                console.error("Microphone access denied:", err);
                setStatus('Please allow microphone access.');
             }
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.outputTranscription) {
              const text = message.serverContent.outputTranscription.text;
              currentOutputRef.current += text;
              setCurrentOutput(currentOutputRef.current);
            } else if (message.serverContent?.inputTranscription) {
              const text = message.serverContent.inputTranscription.text;
              currentInputRef.current += text;
              setCurrentInput(currentInputRef.current);
            }

            if (message.serverContent?.turnComplete) {
                const finalInput = currentInputRef.current;
                const finalOutput = currentOutputRef.current;
                setTranscripts(prev => [
                    ...prev,
                    ...(finalInput ? [{ id: Date.now(), speaker: 'user' as const, text: finalInput }] : []),
                    ...(finalOutput ? [{ id: Date.now() + 1, speaker: 'ai' as const, text: finalOutput }] : [])
                ]);
                currentInputRef.current = '';
                currentOutputRef.current = '';
                setCurrentInput('');
                setCurrentOutput('');
            }
            
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && outputAudioContextRef.current) {
                setIsSpeaking(true);
                const audioContext = outputAudioContextRef.current;

                // Resume AudioContext if it's suspended (e.g., by browser auto-play policies)
                if (audioContext.state === 'suspended') {
                    await audioContext.resume();
                }

                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, audioContext.currentTime);
                const audioBuffer = await decodeAudioData(decode(base64Audio), audioContext, 24000, 1);
                const source = audioContext.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(outputNode);
                
                source.onended = () => {
                    audioSourcesRef.current.delete(source);
                    if(audioSourcesRef.current.size === 0) {
                      setIsSpeaking(false);
                    }
                };
                
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += audioBuffer.duration;
                audioSourcesRef.current.add(source);
            }
            
            if (message.serverContent?.interrupted) {
              for (const source of audioSourcesRef.current.values()) {
                  source.stop();
              }
              audioSourcesRef.current.clear();
              setIsSpeaking(false);
              nextStartTimeRef.current = 0;
            }
          },
          onerror: (e: ErrorEvent) => {
            console.error('Gemini session error:', e);
            setStatus('Connection error. Please try again.');
          },
          onclose: (e: CloseEvent) => {
            setStatus('Connection closed.');
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
          },
          systemInstruction: personality.systemInstruction,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
      });

      sessionPromiseRef.current = sessionPromise;

    } catch (error) {
      console.error('Failed to initialize Gemini AI:', error);
      setStatus('Failed to initialize. Check console for details.');
    }
  }, [voice, personality.systemInstruction]);

  useEffect(() => {
    connectToGemini();

    return () => {
        sessionPromiseRef.current?.then((session) => session.close());
        streamRef.current?.getTracks().forEach(track => track.stop());
        if(scriptProcessorRef.current) {
            scriptProcessorRef.current.disconnect();
        }
        if (mediaStreamSourceRef.current) {
            mediaStreamSourceRef.current.disconnect();
        }
        inputAudioContextRef.current?.close().catch(console.error);
        outputAudioContextRef.current?.close().catch(console.error);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col h-full bg-blue-50/50">
      <header className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <Avatar config={avatar} className="w-12 h-12" />
          <div>
            <h2 className="font-bold text-lg text-gray-800">{avatar.seed}</h2>
            <p className="text-sm text-gray-500">{personality.name}</p>
          </div>
        </div>
        <button onClick={onEndChat} className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition">End Chat</button>
      </header>

      <div className="flex-grow p-4 overflow-y-auto space-y-4">
        {transcripts.map((t) => (
          <div key={t.id} className={`flex items-end gap-2 ${t.speaker === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[75%] px-4 py-2 rounded-2xl ${t.speaker === 'user' ? 'bg-blue-500 text-white rounded-br-none' : 'bg-gray-200 text-gray-800 rounded-bl-none'}`}>
              <p>{t.text}</p>
            </div>
          </div>
        ))}
         {currentInput && (
            <div className="flex items-end gap-2 justify-end">
                <div className="max-w-[75%] px-4 py-2 rounded-2xl bg-blue-300 text-white rounded-br-none opacity-70">
                    <p>{currentInput}</p>
                </div>
            </div>
        )}
        {currentOutput && (
            <div className="flex items-end gap-2 justify-start">
                <div className="max-w-[75%] px-4 py-2 rounded-2xl bg-gray-100 text-gray-600 rounded-bl-none opacity-70">
                    <p>{currentOutput}</p>
                </div>
            </div>
        )}
        <div ref={transcriptEndRef} />
      </div>

      <footer className="flex flex-col items-center justify-center p-4 border-t border-gray-200">
        <div className="relative">
          <Avatar config={avatar} className="w-24 h-24 mb-2" isListening={status.includes('Speak')} isSpeaking={isSpeaking}/>
        </div>
        <p className="text-gray-600 font-medium text-center h-6">{status}</p>
      </footer>
    </div>
  );
};

export default ChatScreen;