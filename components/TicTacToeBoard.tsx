import React from 'react';
import type { Board, Player, WinnerInfo } from '../types';

interface TicTacToeBoardProps {
  board: Board;
  onCellClick: (row: number, col: number) => void;
  currentPlayer: Player | null;
  winnerInfo: WinnerInfo | 'draw' | null;
}

const TicTacToeBoard: React.FC<TicTacToeBoardProps> = ({ board, onCellClick, currentPlayer, winnerInfo }) => {
  const isGameOver = !!winnerInfo;

  const isWinningCell = (row: number, col: number): boolean => {
    if (winnerInfo && winnerInfo !== 'draw') {
        return winnerInfo.line.some(pos => pos[0] === row && pos[1] === col);
    }
    return false;
  };

  return (
    <div className="grid grid-cols-3 gap-2 bg-indigo-200 p-2 rounded-lg shadow-lg">
      {board.map((row, rowIndex) =>
        row.map((cell, colIndex) => {
          const canClick = !isGameOver && cell === '' && currentPlayer === 'X';
          return (
            <div
              key={`${rowIndex}-${colIndex}`}
              onClick={() => canClick && onCellClick(rowIndex, colIndex)}
              className={`w-20 h-20 rounded-md flex items-center justify-center text-5xl font-bold transition-colors duration-200
                ${isWinningCell(rowIndex, colIndex) ? 'bg-green-300' : 'bg-white'}
                ${canClick ? 'cursor-pointer hover:bg-indigo-100' : 'cursor-not-allowed'}
              `}
            >
              {cell === 'X' && <span className="text-blue-500">X</span>}
              {cell === 'O' && <span className="text-red-500">O</span>}
            </div>
          );
        })
      )}
    </div>
  );
};

export default TicTacToeBoard;
