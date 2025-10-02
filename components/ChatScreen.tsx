import { GoogleGenAI, LiveSession, LiveServerMessage, Modality, FunctionDeclaration, Type, Blob } from '@google/genai';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { AvatarConfig, Voice, Personality, ChatMessage } from '../types';
import { MicrophoneIcon } from './icons/MicrophoneIcon';
import Avatar from './Avatar';
import TicTacToeBoard from './TicTacToeBoard';
import GuessTheNumberGame from './GuessTheNumberGame';
import type { Board, WinnerInfo, Player } from '../types';

// FIX: Implement encode/decode functions manually as per Gemini API guidelines.
// Encoding/Decoding functions as per guidelines
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


const playTicTacToeFunctionDeclaration: FunctionDeclaration = {
  name: 'playTicTacToe',
  description: 'Starts a game of Tic Tac Toe with the user. The AI is player "O" and goes second.',
  parameters: { type: Type.OBJECT, properties: {} },
};

const playGuessTheNumberFunctionDeclaration: FunctionDeclaration = {
    name: 'playGuessTheNumber',
    description: 'Starts a game of Guess the Number. The AI thinks of a number and the user has to guess it.',
    parameters: { type: Type.OBJECT, properties: {} },
};


interface ChatScreenProps {
  avatar: AvatarConfig;
  voice: Voice;
  personality: Personality;
  onEndChat: () => void;
}

const ChatScreen: React.FC<ChatScreenProps> = ({ avatar, voice, personality, onEndChat }) => {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);

  const aiRef = useRef<GoogleGenAI | null>(null);
  const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
  
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const outputSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef(0);

  const currentInputTranscriptionRef = useRef('');
  const currentOutputTranscriptionRef = useRef('');

  useEffect(() => {
    setMessages([{
        id: crypto.randomUUID(),
        role: 'model',
        parts: [{ text: `Hello! I'm ${avatar.seed}, your AI friend. Press the microphone button and let's talk!` }],
        timestamp: Date.now(),
    }]);
    
    // Initialize AudioContexts. This might require a user gesture on some browsers.
    if (!outputAudioContextRef.current) {
        try {
            outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        } catch (e) {
            console.error("Error creating output AudioContext:", e);
            setError("Could not initialize audio playback. Please allow audio playback in your browser settings.");
        }
    }
  }, [avatar.seed]);

  const addMessage = useCallback((message: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    setMessages(prev => [...prev, { ...message, id: crypto.randomUUID(), timestamp: Date.now() }]);
  }, []);

  const updateLastMessage = useCallback((updateFn: (prev: ChatMessage) => ChatMessage) => {
      setMessages(prev => {
          if (prev.length === 0) return prev;
          const newMessages = [...prev];
          newMessages[newMessages.length - 1] = updateFn(newMessages[newMessages.length - 1]);
          return newMessages;
      });
  }, []);

  const handleGameEnd = useCallback((gameId: string, result: string, functionName: string) => {
      console.log(`Game ended: ${result}`);
      sessionPromiseRef.current?.then(session => {
        session.sendToolResponse({
          functionResponses: {
            id: gameId,
            name: functionName,
            response: { result: `The game is over. The result is: ${result}` },
          }
        });
      });
  }, []);

  const stopListening = useCallback(async () => {
      setIsListening(false);
      
      // Stop microphone processing
      if (mediaStreamSourceRef.current && scriptProcessorRef.current) {
          mediaStreamSourceRef.current.disconnect();
          scriptProcessorRef.current.disconnect();
          scriptProcessorRef.current.onaudioprocess = null;
      }
      
      // Stop microphone stream tracks
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      
      // Close input audio context
      if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
          await inputAudioContextRef.current.close();
          inputAudioContextRef.current = null;
      }
      
      // Close Gemini session
      try {
        const session = await sessionPromiseRef.current;
        session?.close();
      } catch (e) {
        console.error("Error closing session:", e);
      }
      sessionPromiseRef.current = null;
  }, []);


  const startListening = useCallback(async () => {
    setError(null);
    setIsConnecting(true);
    
    // Resume output audio context if it was suspended
    if (outputAudioContextRef.current?.state === 'suspended') {
      await outputAudioContextRef.current.resume();
    }
    
    // Initialize input audio context
    if (!inputAudioContextRef.current || inputAudioContextRef.current.state === 'closed') {
        try {
            inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        } catch (e) {
            console.error("Error creating input AudioContext:", e);
            setError("Could not initialize microphone. Please allow microphone access.");
            setIsConnecting(false);
            return;
        }
    }
    
    if (!aiRef.current) {
        aiRef.current = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;

        sessionPromiseRef.current = aiRef.current.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-09-2025',
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } }
                },
                systemInstruction: personality.systemInstruction,
                outputAudioTranscription: {},
                inputAudioTranscription: {},
                tools: [{ functionDeclarations: [playTicTacToeFunctionDeclaration, playGuessTheNumberFunctionDeclaration] }],
            },
            callbacks: {
                onopen: () => {
                    setIsConnecting(false);
                    setIsListening(true);
                    
                    const source = inputAudioContextRef.current!.createMediaStreamSource(stream);
                    mediaStreamSourceRef.current = source;
                    const scriptProcessor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
                    scriptProcessorRef.current = scriptProcessor;

                    scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                        const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                        const l = inputData.length;
                        const int16 = new Int16Array(l);
                        for (let i = 0; i < l; i++) {
                            int16[i] = inputData[i] * 32768;
                        }
                        const pcmBlob: Blob = {
                            data: encode(new Uint8Array(int16.buffer)),
                            mimeType: 'audio/pcm;rate=16000',
                        };
                        
                        sessionPromiseRef.current?.then((session) => {
                            session.sendRealtimeInput({ media: pcmBlob });
                        });
                    };
                    source.connect(scriptProcessor);
                    scriptProcessor.connect(inputAudioContextRef.current!.destination);
                },
                onmessage: async (message: LiveServerMessage) => {
                    if (message.serverContent) {
                        // Handle transcription
                        if (message.serverContent.inputTranscription) {
                            const text = message.serverContent.inputTranscription.text;
                            const fullText = currentInputTranscriptionRef.current + text;
                            if (messages[messages.length - 1]?.role !== 'user') {
                                addMessage({ role: 'user', parts: [{ text: fullText }] });
                            } else {
                                updateLastMessage(prev => ({ ...prev, parts: [{ text: fullText }] }));
                            }
                            currentInputTranscriptionRef.current = fullText;
                        }
                        if (message.serverContent.outputTranscription) {
                            const text = message.serverContent.outputTranscription.text;
                            const fullText = currentOutputTranscriptionRef.current + text;
                            if (messages[messages.length - 1]?.role !== 'model') {
                                addMessage({ role: 'model', parts: [{ text: fullText }] });
                            } else {
                                updateLastMessage(prev => ({ ...prev, parts: [{ text: fullText }] }));
                            }
                            currentOutputTranscriptionRef.current = fullText;
                        }
                        if (message.serverContent.turnComplete) {
                            currentInputTranscriptionRef.current = '';
                            currentOutputTranscriptionRef.current = '';
                        }
                        
                        // Handle audio playback
                        const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData.data;
                        if (audioData) {
                            setIsSpeaking(true);
                            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputAudioContextRef.current!.currentTime);
                            const audioBuffer = await decodeAudioData(decode(audioData), outputAudioContextRef.current!, 24000, 1);
                            const source = outputAudioContextRef.current!.createBufferSource();
                            source.buffer = audioBuffer;
                            source.connect(outputAudioContextRef.current!.destination);
                            
                            source.addEventListener('ended', () => {
                                outputSourcesRef.current.delete(source);
                                if (outputSourcesRef.current.size === 0) {
                                    setIsSpeaking(false);
                                }
                            });

                            source.start(nextStartTimeRef.current);
                            nextStartTimeRef.current += audioBuffer.duration;
                            outputSourcesRef.current.add(source);
                        }
                        
                        if (message.serverContent.interrupted) {
                            for (const source of outputSourcesRef.current.values()) {
                                source.stop();
                            }
                            outputSourcesRef.current.clear();
                            nextStartTimeRef.current = 0;
                            setIsSpeaking(false);
                        }
                    }

                    if (message.toolCall) {
                        for (const fc of message.toolCall.functionCalls) {
                            if (fc.name === 'playTicTacToe') {
                                addMessage({
                                    role: 'system',
                                    parts: [{
                                        text: "Let's play Tic-Tac-Toe! You are X.",
                                        component: (
                                            <TicTacToeGameWrapper 
                                                onGameEnd={(result) => handleGameEnd(fc.id, result, fc.name)}
                                            />
                                        )
                                    }]
                                });
                            } else if (fc.name === 'playGuessTheNumber') {
                                addMessage({
                                    role: 'system',
                                    parts: [{
                                        text: "Let's play Guess the Number!",
                                        component: (
                                            <GuessTheNumberGame 
                                                onGameEnd={(result) => handleGameEnd(fc.id, result, fc.name)}
                                            />
                                        )
                                    }]
                                });
                            }
                        }
                    }
                },
                onerror: (e: ErrorEvent) => {
                    console.error("Session error:", e);
                    setError("A connection error occurred. Please try again.");
                    stopListening();
                },
                onclose: (e: CloseEvent) => {
                    console.log("Session closed");
                    stopListening();
                },
            }
        });
    } catch (err) {
        console.error("Failed to start microphone:", err);
        setError("Failed to access microphone. Please check your browser permissions.");
        setIsConnecting(false);
    }
  }, [voice, personality.systemInstruction, addMessage, updateLastMessage, messages, handleGameEnd, stopListening]);


  const handleMicClick = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between p-4 bg-white/80 border-b">
        <div className="flex items-center gap-4">
          <Avatar config={avatar} className="w-14 h-14" isSpeaking={isSpeaking} isListening={isListening} />
          <div>
            <h1 className="text-xl font-bold text-gray-800">{avatar.seed}</h1>
            <p className="text-gray-500">{personality.name}</p>
          </div>
        </div>
        <button onClick={onEndChat} className="px-4 py-2 text-sm bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-semibold">End Chat</button>
      </header>

      <div className="flex-grow p-4 overflow-y-auto bg-indigo-50/50">
        <div className="space-y-4">
            {messages.map((msg) => (
                <div key={msg.id} className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.role !== 'user' && <div className="w-8 h-8 rounded-full bg-gray-300 flex-shrink-0"><Avatar config={avatar} className="w-8 h-8" /></div>}
                    <div className={`max-w-md p-3 rounded-2xl ${msg.role === 'user' ? 'bg-blue-500 text-white rounded-br-none' : msg.role === 'system' ? 'bg-transparent w-full max-w-full' : 'bg-white text-gray-800 rounded-bl-none shadow-sm'}`}>
                        {msg.parts.map((part, index) => (
                            <div key={index}>
                                <p>{part.text}</p>
                                {part.component}
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
        <div ref={messagesEndRef} />
      </div>

      <footer className="p-4 bg-white/80 border-t">
        {error && <p className="text-center text-red-500 mb-2">{error}</p>}
        <div className="flex flex-col items-center justify-center">
            <button onClick={handleMicClick} disabled={isConnecting} className={`w-20 h-20 rounded-full flex items-center justify-center transition-colors text-white ${isConnecting ? 'bg-gray-400' : isListening ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'}`}>
                <MicrophoneIcon className="w-10 h-10" />
            </button>
            <p className="text-sm text-gray-500 mt-2 h-5">
                {isConnecting ? 'Connecting...' : isListening ? 'Listening... Press to stop' : 'Press to talk'}
            </p>
        </div>
      </footer>
    </div>
  );
};

// Wrapper for TicTacToe to manage its state and interact with ChatScreen
const TicTacToeGameWrapper: React.FC<{onGameEnd: (result: string) => void}> = ({ onGameEnd }) => {
    const [board, setBoard] = useState<Board>([['', '', ''], ['', '', ''], ['', '', '']]);
    const [currentPlayer, setCurrentPlayer] = useState<Player>('X');
    const [winnerInfo, setWinnerInfo] = useState<WinnerInfo | 'draw' | null>(null);
    const aiPlayer = 'O';

    const checkWinner = useCallback((currentBoard: Board): WinnerInfo | 'draw' | null => {
        const lines: [[number, number], [number, number], [number, number]][] = [
            [[0, 0], [0, 1], [0, 2]], [[1, 0], [1, 1], [1, 2]], [[2, 0], [2, 1], [2, 2]],
            [[0, 0], [1, 0], [2, 0]], [[0, 1], [1, 1], [2, 1]], [[0, 2], [1, 2], [2, 2]],
            [[0, 0], [1, 1], [2, 2]], [[0, 2], [1, 1], [2, 0]],
        ];
        for (const line of lines) {
            const [a, b, c] = line;
            if (currentBoard[a[0]][a[1]] && currentBoard[a[0]][a[1]] === currentBoard[b[0]][b[1]] && currentBoard[a[0]][a[1]] === currentBoard[c[0]][c[1]]) {
                return { winner: currentBoard[a[0]][a[1]] as Player, line };
            }
        }
        if (currentBoard.flat().every(cell => cell !== '')) return 'draw';
        return null;
    }, []);

    const handleAITurn = useCallback((newBoard: Board) => {
        const availableCells: [number, number][] = [];
        newBoard.forEach((row, rIdx) => row.forEach((cell, cIdx) => {
            if (cell === '') availableCells.push([rIdx, cIdx]);
        }));

        if (availableCells.length > 0) {
            const move = availableCells[Math.floor(Math.random() * availableCells.length)];
            const updatedBoard = newBoard.map((r, rI) => r.map((c, cI) => (rI === move[0] && cI === move[1] ? aiPlayer : c))) as Board;
            setBoard(updatedBoard);
            const gameResult = checkWinner(updatedBoard);
            if (gameResult) {
                setWinnerInfo(gameResult);
                onGameEnd(gameResult === 'draw' ? 'Draw' : `Winner is ${gameResult.winner}`);
            } else {
                setCurrentPlayer('X');
            }
        }
    }, [aiPlayer, checkWinner, onGameEnd]);

    const handleCellClick = useCallback((row: number, col: number) => {
        if (board[row][col] || winnerInfo || currentPlayer !== 'X') return;

        const newBoard = board.map((r, rI) => r.map((c, cI) => (rI === row && cI === col ? 'X' : c))) as Board;
        setBoard(newBoard);

        const gameResult = checkWinner(newBoard);
        if (gameResult) {
            setWinnerInfo(gameResult);
            onGameEnd(gameResult === 'draw' ? 'Draw' : `Winner is ${gameResult.winner}`);
        } else {
            setCurrentPlayer('O');
            setTimeout(() => handleAITurn(newBoard), 500);
        }
    }, [board, winnerInfo, currentPlayer, checkWinner, onGameEnd, handleAITurn]);
    
    return <TicTacToeBoard board={board} onCellClick={handleCellClick} currentPlayer={currentPlayer} winnerInfo={winnerInfo} />;
};


export default ChatScreen;
