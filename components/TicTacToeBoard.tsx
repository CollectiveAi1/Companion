import React from 'react';
import type { Board } from '../types';

interface TicTacToeBoardProps {
  board: Board;
}

const TicTacToeBoard: React.FC<TicTacToeBoardProps> = ({ board }) => {
  return (
    <div className="grid grid-cols-3 gap-2 bg-indigo-200 p-2 rounded-lg shadow-lg">
      {board.map((row, rowIndex) =>
        row.map((cell, colIndex) => (
          <div
            key={`${rowIndex}-${colIndex}`}
            className="w-20 h-20 bg-white rounded-md flex items-center justify-center text-5xl font-bold cursor-not-allowed"
          >
            {cell === 'X' && <span className="text-blue-500">X</span>}
            {cell === 'O' && <span className="text-red-500">O</span>}
          </div>
        ))
      )}
    </div>
  );
};

export default TicTacToeBoard;
