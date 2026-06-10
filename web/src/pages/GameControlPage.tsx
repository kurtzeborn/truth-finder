import { useParams } from 'react-router-dom';

export function GameControlPage() {
  const { gameId } = useParams();

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-4">Game {gameId}</h1>
        <p className="text-gray-400">Game control UI coming in Phase 2</p>
      </div>
    </div>
  );
}
