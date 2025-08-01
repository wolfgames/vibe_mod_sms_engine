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
  const [currentScript, setCurrentScript] = useState<string>('');
  const [availableScripts, setAvailableScripts] = useState<string[]>([]);

  // Load saved script from localStorage
  const getSavedScript = (): string => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('selectedScript') || '';
    }
    return '';
  };

  // Save script to localStorage
  const saveScript = (scriptName: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('selectedScript', scriptName);
    }
  };

  // Clear saved script from localStorage
  const clearSavedScript = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('selectedScript');
    }
  };

  // Function to scan scripts directory
  const scanScriptsDirectory = async (): Promise<string[]> => {
    try {
      // Fetch a list of scripts from the server
      const response = await fetch('/api/scripts');
      if (response.ok) {
        const scripts = await response.json();
        return scripts;
      }
    } catch (error) {
      console.warn('Could not fetch scripts from server:', error);
    }
    
    // Return empty array if no scripts found
    return [];
  };

  // Function to refresh scripts and reload current script
  const refreshScriptsAndReload = async () => {
    try {
      // Scan for available scripts
      const scripts = await scanScriptsDirectory();
      setAvailableScripts(scripts);
      
      // Preserve current script if it's still available, otherwise use first script
      const currentScriptName = currentScript || getSavedScript();
      if (currentScriptName && scripts.includes(currentScriptName)) {
        setCurrentScript(currentScriptName);
      } else if (scripts.length > 0) {
        setCurrentScript(scripts[0]);
        saveScript(scripts[0]);
      }
      
      // Reload the current script
      await loadGame();
    } catch (error) {
      console.error('Error refreshing scripts:', error);
    }
  };

  // Initialize scripts on mount
  useEffect(() => {
    const initializeScripts = async () => {
      const scripts = await scanScriptsDirectory();
      setAvailableScripts(scripts);
      
      // Get the saved script or default to first available script
      const savedScript = getSavedScript();
      
      if (savedScript && scripts.includes(savedScript)) {
        setCurrentScript(savedScript);
      } else if (scripts.length > 0) {
        setCurrentScript(scripts[0]);
        saveScript(scripts[0]); // Save the default script
      }
    };
    
    initializeScripts();
  }, []);

  useEffect(() => {
    if (currentScript && currentScript.trim()) {
      loadGame();
    }
  }, [currentScript]);

  const loadGame = async () => {
    if (!currentScript || !currentScript.trim()) {
      console.warn('No script selected, skipping game load');
      return;
    }

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

  const handleScriptLoad = (scriptName: string) => {
    setCurrentScript(scriptName);
    saveScript(scriptName); // Save the selected script
  };

  const handleScriptReload = () => {
    loadGame();
  };

  const handleResetGame = () => {
    // Refresh scripts and reload current script
    refreshScriptsAndReload();
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

  // Check if no scripts are available
  if (availableScripts.length === 0 && !loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="text-center">
          <div className="text-yellow-500 text-6xl mb-4">📁</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">No Scripts Found</h1>
          <p className="text-gray-600 mb-4">No .twee files found in the scripts directory.</p>
          <p className="text-sm text-gray-500 mb-4">Please add .twee files to the public/scripts folder.</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            Refresh
          </button>
        </div>
      </div>
    );
  }

  // Check if no script is selected yet
  if (!currentScript && !loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="text-center">
          <div className="text-blue-500 text-6xl mb-4">⏳</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Initializing...</h1>
          <p className="text-gray-600 mb-4">Loading available scripts...</p>
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
      currentScript={currentScript}
      onScriptLoad={handleScriptLoad}
      availableScripts={availableScripts}
      onResetGame={handleResetGame}
    />
  );
}
