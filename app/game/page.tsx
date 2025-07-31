'use client';

import React, { useState, useEffect } from 'react';
import { TweeParser } from '../../src/parser/tweeParser';
import { GameEngine } from '../../src/engine/gameEngine';
import SMSInterface from '../../src/ui/SMSInterface';
import { GameData } from '../../src/parser/types';
import { testParser } from '../../src/utils/testParser';

export default function GamePage() {
  const [gameData, setGameData] = useState<GameData | null>(null);
  const [gameEngine, setGameEngine] = useState<GameEngine | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentScript, setCurrentScript] = useState<string>('SMS Branching40_New_test1.twee');

  useEffect(() => {
    loadGame();
  }, [currentScript]);

  const loadGame = async () => {
    setLoading(true);
    setError(null);

    try {
      // Load the Twee script
      const response = await fetch(`/scripts/${currentScript}`);
      if (!response.ok) {
        throw new Error(`Failed to load script: ${response.statusText}`);
      }
      
      const scriptContent = await response.text();
      
      // Parse the script
      const parser = new TweeParser();
      const parseResult = parser.parseTweeFile(scriptContent);
      
      if (parseResult.errors.length > 0) {
        console.warn('Parser errors:', parseResult.errors);
        console.warn('Error details:', parseResult.errors.map(err => ({
          message: err.message,
          type: err.type,
          lineNumber: err.lineNumber
        })));
      }
      
      if (parseResult.warnings.length > 0) {
        console.warn('Parser warnings:', parseResult.warnings);
      }

      // Create game engine with proper event handlers
      const engine = new GameEngine(parseResult.gameData, {
        onMessageAdded: (message) => {
          // This will be handled by the SMSInterface component
        },
        onContactUnlocked: (contactName) => {
          // This will be handled by the SMSInterface component
        },
        onThreadStateChanged: (contactName, state) => {
          // This will be handled by the SMSInterface component
        },
        onVariableChanged: (variableName, value) => {
          // This will be handled by the SMSInterface component
        },
        onActionExecuted: (action) => {
          // This will be handled by the SMSInterface component
        }
      });

      setGameData(parseResult.gameData);
      setGameEngine(engine);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load game');
      console.error('Error loading game:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleScriptReload = () => {
    loadGame();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600 mb-4">Loading SMS game...</p>
          <button
            onClick={() => testParser()}
            className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
          >
            Test Parser
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="text-center">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Error Loading Game</h1>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={loadGame}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!gameData || !gameEngine) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="text-center">
          <div className="text-red-500 text-6xl mb-4">❌</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Game Not Loaded</h1>
          <p className="text-gray-600">Failed to initialize game engine</p>
        </div>
      </div>
    );
  }

  return (
    <SMSInterface
      gameEngine={gameEngine}
      gameData={gameData}
      onScriptReload={handleScriptReload}
    />
  );
}
