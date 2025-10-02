export enum AppScreen {
  CUSTOMIZATION,
  CHAT,
}

export type AvatarStyle = 'adventurer' | 'bottts' | 'micah' | 'lorelei' | 'pixel-art';

export interface AvatarConfig {
  style: AvatarStyle;
  seed: string;
}

export type Voice = 'Zephyr' | 'Puck' | 'Charon' | 'Kore' | 'Fenrir';

export interface Personality {
  id: string;
  name: string;
  description: string;
  systemInstruction: string;
}

export interface Transcript {
  id: number;
  speaker: 'user' | 'ai';
  text: string;
}

// Types for Tic-Tac-Toe Game
export type Player = 'X' | 'O';
export type CellValue = Player | '';
export type Board = CellValue[][];
