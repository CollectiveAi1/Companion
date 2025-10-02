import React from 'react';

export enum AppScreen {
  CUSTOMIZATION = 'CUSTOMIZATION',
  CHAT = 'CHAT',
}

export interface AvatarConfig {
  style: string;
  seed: string;
}

// As defined in the Gemini API documentation and used in the app
export type Voice = 'Zephyr' | 'Puck' | 'Kore' | 'Charon';

export interface Personality {
  id: string;
  name: string;
  description: string;
  systemInstruction: string;
}

// For Chat
export interface Transcript {
  id: string;
  role: 'user' | 'model' | 'system';
  parts: { text?: string; component?: React.ReactNode, imageUrl?: string }[];
  timestamp: number;
}


// For Tic-Tac-Toe Game
export type Player = 'X' | 'O';
export type Cell = Player | '';
export type Board = [
  [Cell, Cell, Cell],
  [Cell, Cell, Cell],
  [Cell, Cell, Cell]
];
export type WinnerInfo = {
  winner: Player;
  line: [[number, number], [number, number], [number, number]];
};
