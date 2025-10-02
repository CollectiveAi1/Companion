import React from 'react';
import type { GuessTheNumberState } from '../types';

interface GuessTheNumberGameProps {
  gameState: GuessTheNumberState;
}

const GuessTheNumberGame: React.FC<GuessTheNumberGameProps> = ({ gameState }) => {
  const { min, max, guesses } = gameState;

  return (
    <div className="bg-white/80 p-4 rounded-xl my-2 shadow-md border border-indigo-200 w-full max-w-sm">
      <h3 className="text-lg font-bold text-indigo-700 mb-2 text-center">Guess the Number!</h3>
      <p className="text-gray-700 mb-3 text-center">I'm thinking of a number between {min} and {max}.</p>
      
      {guesses.length > 0 && (
        <div className="mt-3 space-y-2 max-h-24 overflow-y-auto pr-2">
            {guesses.slice().reverse().map((guess, index) => (
                <div key={index} className={`text-sm p-2 rounded-lg flex justify-between ${
                    guess.hint === 'correct' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'
                }`}>
                   <span>Guess: <strong>{guess.value}</strong></span>
                   <span className="font-semibold capitalize">
                        {guess.hint === 'lower' ? 'Too Low!' : guess.hint === 'higher' ? 'Too High!' : 'You got it!'}
                   </span>
                </div>
            ))}
        </div>
      )}
    </div>
  );
};

export default GuessTheNumberGame;