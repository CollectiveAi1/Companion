import { GoogleGenAI, LiveSession, LiveServerMessage, Modality, FunctionDeclaration, Type, Blob } from '@google/genai';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { AvatarConfig, Voice, Personality, Transcript, Board, WinnerInfo, Player } from '../types';
import Avatar from './Avatar';
import TicTacToeBoard from './TicTacToeBoard';
import DrawingCanvas from './DrawingCanvas';
import { PencilIcon } from './icons/PencilIcon';

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
    // FIX: Corrected typo from Int116Array to Int16Array.
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

// --- Function Declarations for AI Tools ---
const playTicTacToeFunctionDeclaration: FunctionDeclaration = {
  name: 'playTicTacToe',
  description: 'Starts or restarts a game of Tic Tac Toe. Call this to show the board.',
  parameters: { type: Type.OBJECT, properties: {} },
};

const aiMakeMoveFunctionDeclaration: FunctionDeclaration = {
    name: 'aiMakeMove',
    description: "Makes the AI's move in Tic Tac Toe.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            row: { type: Type.NUMBER, description: 'The row index (0-2) of the move.' },
            col: { type: Type.NUMBER, description: 'The column index (0-2) of the move.' },
        },
        required: ['row', 'col'],
    },
};

const endGameFunctionDeclaration: FunctionDeclaration = {
    name: 'endGame',
    description: 'Hides the game board after a game is finished and the user wants to do something else.',
    parameters: { type: Type.OBJECT, properties: {} },
};

const startDrawingFunctionDeclaration: FunctionDeclaration = {
  name: 'startDrawing',
  description: 'Shows the drawing canvas to the user when you want to play a drawing game.',
  parameters: { type: Type.OBJECT, properties: {} },
};

const endDrawingFunctionDeclaration: FunctionDeclaration = {
  name: 'endDrawing',
  description: 'Hides the drawing canvas. Call this if the user decides not to draw.',
  parameters: { type: Type.OBJECT, properties: {} },
};

const generateAndShowImageFunctionDeclaration: FunctionDeclaration = {
    name: 'generateAndShowImage',
    description: 'Generates an image based on a descriptive prompt and shows it to the user in the chat.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            prompt: { type: Type.STRING, description: 'A detailed, family-friendly description of the image to generate.' },
        },
        required: ['prompt'],
    },
};

const ALL_TOOLS = [{ functionDeclarations: [
    playTicTacToeFunctionDeclaration,
    aiMakeMoveFunctionDeclaration,
    endGameFunctionDeclaration,
    startDrawingFunctionDeclaration,
    endDrawingFunctionDeclaration,
    generateAndShowImageFunctionDeclaration,
] }];


interface ChatScreenProps {
  avatar: AvatarConfig;
  voice: Voice;
  personality: Personality;
  onEndChat: () => void;
}

const ChatScreen: React.FC<ChatScreenProps> = ({ avatar, voice, personality, onEndChat }) => {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [transcript, setTranscript] = useState<Transcript[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // Game States
  const [isGameActive, setIsGameActive] = useState(false);
  const [board, setBoard] = useState<Board>([['', '', ''], ['', '', ''], ['', '', '']]);
  const [currentPlayer, setCurrentPlayer] = useState<Player>('X');
  const [winnerInfo, setWinnerInfo] = useState<WinnerInfo | 'draw' | null>(null);
  const [isDrawingCanvasVisible, setIsDrawingCanvasVisible] = useState(false);

  const aiRef = useRef<GoogleGenAI | null>(null);
  const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
  const gameStateRef = useRef({ board, currentPlayer, isGameActive });
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const outputSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef(0);

  const currentInputTranscriptionRef = useRef('');
  const currentOutputTranscriptionRef = useRef('');
  const isAiSpeakingRef = useRef(false);
  const isUserTurnRef = useRef(false);

  // Update game state ref whenever state changes
  useEffect(() => {
    gameStateRef.current = { board, currentPlayer, isGameActive };
  }, [board, currentPlayer, isGameActive]);

  const addTranscript = useCallback((message: Omit<Transcript, 'id' | 'timestamp'>) => {
    setTranscript(prev => [...prev, { ...message, id: crypto.randomUUID(), timestamp: Date.now() }]);
  }, []);

  const updateLastTranscript = useCallback((updateFn: (prev: Transcript) => Transcript) => {
      setTranscript(prev => {
          if (prev.length === 0) return prev;
          const newTranscript = [...prev];
          newTranscript[newTranscript.length - 1] = updateFn(newTranscript[newTranscript.length - 1]);
          return newTranscript;
      });
  }, []);
  
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
  
  const stopAudioProcessing = useCallback(() => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    mediaStreamSourceRef.current?.disconnect();
    scriptProcessorRef.current?.disconnect();
    scriptProcessorRef.current = null;
  }, []);
  
  const closeSession = useCallback(() => {
    stopAudioProcessing();
    sessionPromiseRef.current?.then(session => session.close()).catch(e => console.error("Error closing session:", e));
    sessionPromiseRef.current = null;
    setIsListening(false);
    setIsConnecting(false);
  }, [stopAudioProcessing]);

  useEffect(() => {
    if (!process.env.API_KEY) {
      setError('API key is not set.');
      setIsConnecting(false);
      return;
    }
    aiRef.current = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    try {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    } catch (e) {
        console.error("Error creating AudioContext:", e);
        setError("Could not initialize audio. Please check browser permissions.");
        setIsConnecting(false);
        return;
    }

    sessionPromiseRef.current = aiRef.current.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice }}},
            systemInstruction: personality.systemInstruction,
            outputAudioTranscription: {},
            inputAudioTranscription: {},
            tools: ALL_TOOLS,
        },
        callbacks: {
            onopen: () => {
                setIsConnecting(false);
                addTranscript({ role: 'system', parts: [{ text: `Connecting to ${avatar.seed}...` }]});
                // Send an initial prompt to get a greeting
                 sessionPromiseRef.current?.then(session => {
                    session.sendText("Hi, introduce yourself with a friendly greeting based on your personality.");
                });
            },
            onmessage: async (message: LiveServerMessage) => {
                 if (message.serverContent?.modelTurn?.parts[0]?.inlineData?.data) {
                    isAiSpeakingRef.current = true;
                    setIsSpeaking(true);
                    if(isUserTurnRef.current) {
                        isUserTurnRef.current = false;
                        stopAudioProcessing();
                    }
                 }

                if (message.serverContent) {
                    // Handle transcription
                    if (message.serverContent.inputTranscription) {
                        const text = message.serverContent.inputTranscription.text;
                        const fullText = currentInputTranscriptionRef.current + text;
                        if (transcript[transcript.length - 1]?.role !== 'user') {
                            addTranscript({ role: 'user', parts: [{ text: fullText }] });
                        } else {
                            updateLastTranscript(prev => ({ ...prev, parts: [{ text: fullText }] }));
                        }
                        currentInputTranscriptionRef.current = fullText;
                    }
                    if (message.serverContent.outputTranscription) {
                        const text = message.serverContent.outputTranscription.text;
                        const fullText = currentOutputTranscriptionRef.current + text;
                        if (transcript[transcript.length - 1]?.role !== 'model') {
                            addTranscript({ role: 'model', parts: [{ text: fullText }] });
                        } else {
                            updateLastTranscript(prev => ({ ...prev, parts: [{ text: fullText }] }));
                        }
                        currentOutputTranscriptionRef.current = fullText;
                    }
                    if (message.serverContent.turnComplete) {
                        currentInputTranscriptionRef.current = '';
                        currentOutputTranscriptionRef.current = '';
                    }
                    
                    const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData.data;
                    if (audioData) {
                        const ctx = audioContextRef.current;
                        if (!ctx) return;
                        nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                        const audioBuffer = await decodeAudioData(decode(audioData), ctx, 24000, 1);
                        const source = ctx.createBufferSource();
                        source.buffer = audioBuffer;
                        source.connect(ctx.destination);
                        
                        source.addEventListener('ended', () => {
                            outputSourcesRef.current.delete(source);
                            if (outputSourcesRef.current.size === 0) {
                                isAiSpeakingRef.current = false;
                                setIsSpeaking(false);
                            }
                        });

                        source.start(nextStartTimeRef.current);
                        nextStartTimeRef.current += audioBuffer.duration;
                        outputSourcesRef.current.add(source);
                    }
                }

                if (message.toolCall) {
                    for (const fc of message.toolCall.functionCalls) {
                        if (fc.name === 'playTicTacToe') {
                            setBoard([['', '', ''], ['', '', ''], ['', '', '']]);
                            setCurrentPlayer('X');
                            setWinnerInfo(null);
                            setIsGameActive(true);
                        } else if (fc.name === 'aiMakeMove') {
                            const { row, col } = fc.args;
                            if (gameStateRef.current.board[row][col] === '') {
                                const newBoard = gameStateRef.current.board.map((r, rI) => r.map((c, cI) => (rI === row && cI === col ? 'O' : c))) as Board;
                                setBoard(newBoard);
                                const gameResult = checkWinner(newBoard);
                                if(gameResult) {
                                    setWinnerInfo(gameResult);
                                    setIsGameActive(false);
                                    sessionPromiseRef.current?.then(session => session.sendText(`The game is over. The result is ${gameResult === 'draw' ? 'a draw' : `the winner is ${gameResult.winner}`}.`));
                                } else {
                                    setCurrentPlayer('X');
                                }
                            }
                        } else if (fc.name === 'endGame') {
                            setIsGameActive(false);
                        } else if (fc.name === 'startDrawing') {
                            setIsDrawingCanvasVisible(true);
                        } else if (fc.name === 'endDrawing') {
                            setIsDrawingCanvasVisible(false);
                        } else if (fc.name === 'generateAndShowImage') {
                             const prompt = fc.args.prompt;
                             addTranscript({role: 'model', parts: [{ text: `Generating an image of: ${prompt}`}]});
                             try {
                                const response = await aiRef.current!.models.generateImages({
                                    model: 'imagen-4.0-generate-001',
                                    prompt: prompt,
                                    config: { numberOfImages: 1, outputMimeType: 'image/jpeg' },
                                });
                                const base64ImageBytes = response.generatedImages[0].image.imageBytes;
                                const imageUrl = `data:image/jpeg;base64,${base64ImageBytes}`;
                                addTranscript({ role: 'model', parts: [{ imageUrl }] });
                             } catch (e) {
                                console.error("Image generation failed:", e);
                                addTranscript({role: 'model', parts: [{ text: "Sorry, I couldn't create that image."}]});
                             }
                        }
                    }
                }
            },
            onerror: (e: ErrorEvent) => {
                console.error("Session error:", e);
                const reason = (e as any).reason || 'Please check your API key and network connection.';
                setError(`Connection failed. ${reason}`);
                setIsConnecting(false);
            },
            onclose: (e: CloseEvent) => {
                if (e.code > 1000) { // Abnormal closure
                    setError(`Connection closed: ${e.reason || 'Please check your API key.'} (Code: ${e.code})`);
                }
                setIsListening(false);
                setIsConnecting(false);
            },
        }
    }).catch(e => {
        console.error("Connection promise rejected:", e);
        setError("Failed to connect. Please check your API key and permissions.");
        setIsConnecting(false);
    });

    return () => closeSession();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMicClick = async () => {
    if (isAiSpeakingRef.current || isConnecting) return;

    // Resume audio context on first user interaction
    if (audioContextRef.current?.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    if (isUserTurnRef.current) {
        isUserTurnRef.current = false;
        stopAudioProcessing();
        setIsListening(false);
    } else {
        isUserTurnRef.current = true;
        setIsListening(true);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            const source = audioContextRef.current!.createMediaStreamSource(stream);
            mediaStreamSourceRef.current = source;
            const scriptProcessor = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
            scriptProcessorRef.current = scriptProcessor;

            scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                const l = inputData.length;
                const int16 = new Int16Array(l);
                for (let i = 0; i < l; i++) {
                    int16[i] = inputData[i] * 32768;
                }
                const pcmBlob: Blob = { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };
                sessionPromiseRef.current?.then((session) => session.sendRealtimeInput({ media: pcmBlob }));
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(audioContextRef.current!.destination);
        } catch (err) {
            console.error("Mic access failed:", err);
            setError("Microphone access denied.");
            setIsListening(false);
            isUserTurnRef.current = false;
        }
    }
  };
  
  const handleCellClick = useCallback((row: number, col: number) => {
      if (board[row][col] || winnerInfo || currentPlayer !== 'X' || !isGameActive) return;

      const newBoard = board.map((r, rI) => r.map((c, cI) => (rI === row && cI === col ? 'X' : c))) as Board;
      setBoard(newBoard);

      const gameResult = checkWinner(newBoard);
      if (gameResult) {
          setWinnerInfo(gameResult);
          setIsGameActive(false);
          sessionPromiseRef.current?.then(session => session.sendText(`I made my move. The game is over. The result is ${gameResult === 'draw' ? 'a draw' : `the winner is ${gameResult.winner}`}.`));
      } else {
          setCurrentPlayer('O');
          sessionPromiseRef.current?.then(session => session.sendText(`I made my move to row ${row}, column ${col}. Now it is your turn to make a move.`));
      }
  }, [board, winnerInfo, currentPlayer, isGameActive, checkWinner]);
  
  const handleDrawingSubmit = useCallback(async (imageDataUrl: string) => {
    setIsDrawingCanvasVisible(false);
    const base64Data = imageDataUrl.split(',')[1];
    addTranscript({ role: 'user', parts: [{ text: 'I drew something!', imageUrl: imageDataUrl }] });
    
    const imagePart = { inlineData: { mimeType: 'image/jpeg', data: base64Data } };
    const textPart = { text: "Here is the drawing I made. What do you think?" };
    
    sessionPromiseRef.current?.then(session => {
        session.sendInput({ contents: { parts: [imagePart, textPart] } });
    });
  }, [addTranscript]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);
  
  return (
    <div className="flex flex-col h-full">
      {isDrawingCanvasVisible && <DrawingCanvas onClose={() => setIsDrawingCanvasVisible(false)} onSubmit={handleDrawingSubmit} />}
      <header className="flex items-center justify-between p-4 bg-white/80 border-b">
        <div className="flex items-center gap-4">
          <Avatar config={avatar} className="w-14 h-14" />
          <div>
            <h1 className="text-xl font-bold text-gray-800">{avatar.seed}</h1>
            <p className="text-gray-500">{personality.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
            <button onClick={() => setIsDrawingCanvasVisible(true)} className="p-2 bg-yellow-400 text-gray-800 rounded-lg hover:bg-yellow-500 font-semibold"><PencilIcon className="w-6 h-6" /></button>
            <button onClick={onEndChat} className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 font-semibold">End Chat</button>
        </div>
      </header>

      <div className="flex-grow p-4 overflow-y-auto bg-indigo-50/50">
        <div className="space-y-4">
            {transcript.map((msg) => (
                <div key={msg.id} className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.role === 'model' && <Avatar config={avatar} className="w-8 h-8 flex-shrink-0" />}
                    <div className={`max-w-md p-3 rounded-2xl ${msg.role === 'user' ? 'bg-blue-500 text-white rounded-br-none' : msg.role === 'system' ? 'bg-transparent w-full max-w-full text-center text-gray-500 text-sm' : 'bg-white text-gray-800 rounded-bl-none shadow-sm'}`}>
                        {msg.parts.map((part, index) => (
                            <div key={index}>
                                {part.text && <p>{part.text}</p>}
                                {part.imageUrl && <img src={part.imageUrl} alt="User drawing or AI generated content" className="mt-2 rounded-lg" />}
                                {part.component}
                            </div>
                        ))}
                    </div>
                </div>
            ))}
             {isGameActive && (
                <div className="flex justify-center">
                    <TicTacToeBoard board={board} onCellClick={handleCellClick} currentPlayer={currentPlayer} winnerInfo={winnerInfo} />
                </div>
            )}
        </div>
        <div ref={messagesEndRef} />
      </div>

      <footer className="p-4 bg-white/80 border-t">
        {error && <p className="text-center text-red-500 mb-2">{error}</p>}
        <div className="flex flex-col items-center justify-center">
            <button onClick={handleMicClick} disabled={isConnecting || isSpeaking} className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 transform text-white disabled:bg-gray-400 ${isListening ? 'bg-red-500 scale-110' : 'bg-blue-500 hover:bg-blue-600'}`}>
                <Avatar config={avatar} className="w-20 h-20" isListening={isListening} isSpeaking={isSpeaking}/>
            </button>
            <p className="text-sm text-gray-500 mt-2 h-5">
                {isConnecting ? 'Connecting...' : isSpeaking ? `${avatar.seed} is speaking...` : isListening ? 'Listening... Tap to stop' : 'Tap the avatar to speak'}
            </p>
        </div>
      </footer>
    </div>
  );
};

export default ChatScreen;