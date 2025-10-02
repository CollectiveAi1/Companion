import React, { useState, useEffect } from 'react';

interface GuessTheNumberGameProps {
  onGameEnd: (result: string) => void;
}

const GuessTheNumberGame: React.FC<GuessTheNumberGameProps> = ({ onGameEnd }) => {
  const [targetNumber, setTargetNumber] = useState(0);
  const [guess, setGuess] = useState('');
  const [message, setMessage] = useState('I\'m thinking of a number between 1 and 100. Can you guess it?');
  const [guesses, setGuesses] = useState(0);
  const [gameOver, setGameOver] = useState(false);

  useEffect(() => {
    // Generate a random number when the component mounts
    setTargetNumber(Math.floor(Math.random() * 100) + 1);
  }, []);

  const handleGuess = (e: React.FormEvent) => {
    e.preventDefault();
    if (gameOver) return;

    const numGuess = parseInt(guess, 10);
    if (isNaN(numGuess)) {
      setMessage('Please enter a valid number.');
      return;
    }

    const newGuessesCount = guesses + 1;
    setGuesses(newGuessesCount);

    if (numGuess === targetNumber) {
      const successMessage = `You got it! The number was ${targetNumber}. It took you ${newGuessesCount} guesses.`;
      setMessage(successMessage);
      setGameOver(true);
      onGameEnd(`User won the game in ${newGuessesCount} guesses.`);
    } else if (numGuess < targetNumber) {
      setMessage('Too low! Try again.');
    } else {
      setMessage('Too high! Try again.');
    }
    setGuess('');
  };

  return (
    <div className="bg-white/80 p-4 rounded-xl my-2 shadow-md border border-indigo-200">
      <h3 className="text-lg font-bold text-indigo-700 mb-2">Guess the Number!</h3>
      <p className="text-gray-700 mb-3">{message}</p>
      
      {!gameOver && (
        <form onSubmit={handleGuess} className="flex gap-2">
          <input
            type="number"
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 bg-gray-50 text-gray-900"
            placeholder="Your guess..."
            min="1"
            max="100"
            autoFocus
          />
          <button type="submit" className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors">
            Guess
          </button>
        </form>
      )}

      {guesses > 0 && <p className="text-sm text-gray-500 mt-2">Guesses: {guesses}</p>}
    </div>
  );
};

export default GuessTheNumberGame;
