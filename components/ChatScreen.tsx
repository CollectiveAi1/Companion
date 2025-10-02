import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { AvatarConfig, Voice, Personality, Transcript, Board, Player, WinnerInfo } from '../types';
import type { LiveSession, LiveServerMessage } from '@google/genai';
import { GoogleGenAI, Modality, FunctionDeclaration, Type } from '@google/genai';
import Avatar from './Avatar';
import TicTacToeBoard from './TicTacToeBoard';
import DrawingCanvas from './DrawingCanvas';
import { PencilIcon } from './icons/PencilIcon';

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

// --- Tool Declarations for Gemini ---
const tools: FunctionDeclaration[] = [
    {
        name: 'startGame',
        description: 'Starts a new game of Tic-Tac-Toe. Displays the board on the screen.',
        parameters: { type: Type.OBJECT, properties: {} },
    },
    {
        name: 'aiMakeMove',
        description: "Places the AI's 'O' mark on the Tic-Tac-Toe board.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                row: { type: Type.INTEGER, description: 'The row index (0, 1, or 2) of the move.' },
                col: { type: Type.INTEGER, description: 'The column index (0, 1, or 2) of the move.' },
            },
            required: ['row', 'col'],
        },
    },
    {
        name: 'resetGame',
        description: 'Resets the Tic-Tac-Toe board for a new game.',
        parameters: { type: Type.OBJECT, properties: {} },
    },
    {
        name: 'startDrawingGame',
        description: 'Starts a new drawing game. This will display a drawing canvas for the user.',
        parameters: { type: Type.OBJECT, properties: {} },
    },
    {
        name: 'endDrawingGame',
        description: 'Ends the drawing game and hides the drawing canvas.',
        parameters: { type: Type.OBJECT, properties: {} },
    }
];

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
  const [isListening, setIsListening] = useState(false);
  const [drawingCanvasVisible, setDrawingCanvasVisible] = useState(false);

  // Tic-Tac-Toe State
  const [gameBoard, setGameBoard] = useState<Board | null>(null);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [winnerInfo, setWinnerInfo] = useState<WinnerInfo | 'draw' | null>(null);

  const gameStateRef = useRef({ board: gameBoard, player: currentPlayer });
  useEffect(() => {
    gameStateRef.current = { board: gameBoard, player: currentPlayer };
  }, [gameBoard, currentPlayer]);

  const isListeningRef = useRef(false);
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

  const checkWinner = useCallback((board: Board): WinnerInfo | 'draw' | null => {
    const lines = [
      // Rows
      [[0, 0], [0, 1], [0, 2]],
      [[1, 0], [1, 1], [1, 2]],
      [[2, 0], [2, 1], [2, 2]],
      // Columns
      [[0, 0], [1, 0], [2, 0]],
      [[0, 1], [1, 1], [2, 1]],
      [[0, 2], [1, 2], [2, 2]],
      // Diagonals
      [[0, 0], [1, 1], [2, 2]],
      [[0, 2], [1, 1], [2, 0]],
    ];

    for (const line of lines) {
      const [a, b, c] = line;
      if (board[a[0]][a[1]] && board[a[0]][a[1]] === board[b[0]][b[1]] && board[a[0]][a[1]] === board[c[0]][c[1]]) {
        return { winner: board[a[0]][a[1]] as Player, line };
      }
    }

    if (board.flat().every(cell => cell !== '')) {
      return 'draw';
    }

    return null;
  }, []);

  const handleCellClick = useCallback(async (row: number, col: number) => {
    if (!gameBoard || currentPlayer !== 'X' || winnerInfo || gameBoard[row][col] !== '') {
        return;
    }

    // User's move
    const newBoard = gameBoard.map(r => [...r]);
    newBoard[row][col] = 'X';
    setGameBoard(newBoard);

    const result = checkWinner(newBoard);
    if (result) {
        setWinnerInfo(result);
        setCurrentPlayer(null);
        return;
    }

    // AI's turn
    setCurrentPlayer('O');

    // Notify AI
    const boardString = JSON.stringify(newBoard);
    const prompt = `The user placed their 'X' at row ${row}, column ${col}. The current board is ${boardString}. It is now your turn to place 'O'. Call the aiMakeMove function with your chosen coordinates.`;

    const session = await sessionPromiseRef.current;
    if (session) {
        session.sendRealtimeInput({ text: prompt });
    }
  }, [gameBoard, currentPlayer, winnerInfo, checkWinner]);

   const handleSubmitDrawing = useCallback((imageDataUrl: string) => {
    const base64Data = imageDataUrl.split(',')[1];
    if (!base64Data) return;

    const imageBlob = {
        data: base64Data,
        mimeType: 'image/jpeg',
    };
    
    sessionPromiseRef.current?.then((session) => {
        session.sendRealtimeInput({ media: imageBlob });
    });
    
    setTranscripts(prev => [
        ...prev,
        { 
            id: Date.now(), 
            speaker: 'user', 
            text: `(Sent a drawing to ${avatar.seed})` 
        },
    ]);

    setDrawingCanvasVisible(false);
  }, [avatar.seed]);

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
            setStatus('Connected! Tap the avatar to speak.');
            
            // Proactively greet the user to start the conversation
            sessionPromise.then(session => {
                session.sendRealtimeInput({ text: 'Give a short, warm, and friendly greeting based on your personality to start the conversation.' });
            });

             try {
              streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
              inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
              mediaStreamSourceRef.current = inputAudioContextRef.current.createMediaStreamSource(streamRef.current);
              scriptProcessorRef.current = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
              
              scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
                if (!isListeningRef.current) return;
                
                const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                const int16Data = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
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
             // If AI starts responding, the user's turn is over.
            if (isListeningRef.current && (message.serverContent?.outputTranscription || message.serverContent?.modelTurn?.parts[0]?.inlineData?.data)) {
                isListeningRef.current = false;
                setIsListening(false);
            }

            if (message.toolCall) {
                const results = [];
                for (const call of message.toolCall.functionCalls) {
                    let functionResult: any = { success: true };

                    switch (call.name) {
                        // Drawing Game
                        case 'startDrawingGame':
                            setDrawingCanvasVisible(true);
                            break;
                        case 'endDrawingGame':
                            setDrawingCanvasVisible(false);
                            break;

                        // Tic Tac Toe
                        case 'startGame':
                            setGameBoard(Array(3).fill(null).map(() => Array(3).fill('')));
                            setCurrentPlayer('X');
                            setWinnerInfo(null);
                            break;
                        case 'resetGame':
                             setGameBoard(Array(3).fill(null).map(() => Array(3).fill('')));
                            setCurrentPlayer('X');
                            setWinnerInfo(null);
                            break;
                        case 'aiMakeMove': {
                            const { row, col } = call.args as { row: number; col: number };
                            const { board, player } = gameStateRef.current;

                            if (!board || player !== 'O' || row < 0 || row > 2 || col < 0 || col > 2 || board[row][col] !== '') {
                                functionResult = { success: false, error: 'Invalid move.' };
                            } else {
                                const newBoard = board.map(r => [...r]);
                                newBoard[row][col] = 'O';
                                setGameBoard(newBoard);

                                const result = checkWinner(newBoard);
                                if (result) {
                                    setWinnerInfo(result);
                                    setCurrentPlayer(null); // Game over
                                } else {
                                    setCurrentPlayer('X'); // User's turn
                                }
                            }
                            break;
                        }
                    }
                    results.push({ id: call.id, name: call.name, response: { result: functionResult } });
                }

                if (results.length > 0) {
                    sessionPromiseRef.current?.then((session) => {
                        session.sendToolResponse({ functionResponses: results });
                    });
                }
            }


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
                if (audioContext.state === 'suspended') { await audioContext.resume(); }

                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, audioContext.currentTime);
                const audioBuffer = await decodeAudioData(decode(base64Audio), audioContext, 24000, 1);
                const source = audioContext.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(outputNode);
                
                source.onended = () => {
                    audioSourcesRef.current.delete(source);
                    if(audioSourcesRef.current.size === 0) { setIsSpeaking(false); }
                };
                
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += audioBuffer.duration;
                audioSourcesRef.current.add(source);
            }
            
            if (message.serverContent?.interrupted) {
              for (const source of audioSourcesRef.current.values()) { source.stop(); }
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
          tools: [{functionDeclarations: tools}],
        },
      });

      sessionPromiseRef.current = sessionPromise;

    } catch (error) {
      console.error('Failed to initialize Gemini AI:', error);
      setStatus('Failed to initialize. Check console for details.');
    }
  }, [voice, personality.systemInstruction, checkWinner]);

  useEffect(() => {
    connectToGemini();

    return () => {
        sessionPromiseRef.current?.then((session) => session.close());
        streamRef.current?.getTracks().forEach(track => track.stop());
        if(scriptProcessorRef.current) { scriptProcessorRef.current.disconnect(); }
        if (mediaStreamSourceRef.current) { mediaStreamSourceRef.current.disconnect(); }
        inputAudioContextRef.current?.close().catch(console.error);
        outputAudioContextRef.current?.close().catch(console.error);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleListening = useCallback(() => {
    if (isSpeaking || !status.includes('Connected')) return;
    
    // This toggles the listening state
    const newIsListening = !isListeningRef.current;
    isListeningRef.current = newIsListening;
    setIsListening(newIsListening);
  }, [isSpeaking, status]);


  const getStatusText = () => {
    if (status.includes('Connecting') || status.includes('Error') || status.includes('closed') || status.includes('access')) {
        return status;
    }
    if (isSpeaking) {
        return `${avatar.seed} is talking...`;
    }
    if (isListening) {
        return 'Listening... Tap avatar to stop';
    }
    return 'Tap the avatar to speak';
  };

  return (
    <div className="flex flex-col h-full bg-blue-50/50 relative">
      {drawingCanvasVisible && (
        <DrawingCanvas 
            onClose={() => setDrawingCanvasVisible(false)} 
            onSubmit={handleSubmitDrawing}
        />
      )}
      
      <header className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <Avatar config={avatar} className="w-12 h-12" />
          <div>
            <h2 className="font-bold text-lg text-gray-800">{avatar.seed}</h2>
            <p className="text-sm text-gray-500">{personality.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
            <button 
                onClick={() => setDrawingCanvasVisible(true)} 
                className="p-2 bg-yellow-400 text-white rounded-lg hover:bg-yellow-500 transition"
                aria-label="Draw something"
            >
                <PencilIcon className="w-6 h-6" />
            </button>
            <button onClick={onEndChat} className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition">End Chat</button>
        </div>
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

       {gameBoard && (
        <div className="p-4 border-t border-gray-200 flex justify-center items-center bg-indigo-100/50">
          <TicTacToeBoard 
            board={gameBoard} 
            onCellClick={handleCellClick}
            currentPlayer={currentPlayer}
            winnerInfo={winnerInfo}
          />
        </div>
      )}

      <footer className="flex flex-col items-center justify-center p-4 border-t border-gray-200">
        <div 
          className={`relative select-none transition-transform duration-200 ${isSpeaking ? 'cursor-not-allowed' : 'cursor-pointer active:scale-110'}`}
          onClick={handleToggleListening}
        >
          <Avatar 
            config={avatar} 
            className="w-24 h-24 mb-2" 
            isListening={isListening} 
            isSpeaking={isSpeaking}
          />
        </div>
        <p className="text-gray-600 font-medium text-center h-6">{getStatusText()}</p>
      </footer>
    </div>
  );
};

export default ChatScreen;