'use client';

import React, { useState, useEffect, useRef } from 'react';
import { GameEngine, Message, GameState } from '../engine/gameEngine';
import ContactList from './ContactList';
import Conversation from './Conversation';
import { GameData } from '../parser/types';

interface SMSInterfaceProps {
  gameEngine: GameEngine;
  gameData: GameData;
  onScriptReload?: () => void;
}

export default function SMSInterface({ gameEngine, gameData, onScriptReload }: SMSInterfaceProps) {
  const [selectedContact, setSelectedContact] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState>(gameEngine.getGameState());
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const handleMessageAdded = (message: Message) => {
      setGameState(gameEngine.getGameState());
    };

    const handleContactUnlocked = (contactName: string) => {
      setGameState(gameEngine.getGameState());
    };

    const handleThreadStateChanged = (contactName: string, state: 'active' | 'locked' | 'ended') => {
      setGameState(gameEngine.getGameState());
    };

    const handleVariableChanged = (variableName: string, value: any) => {
      setGameState(gameEngine.getGameState());
    };

    const handleActionExecuted = (action: any) => {
      console.log('Action executed:', action);
    };

    // Set up event listeners
    gameEngine.events.onMessageAdded = handleMessageAdded;
    gameEngine.events.onContactUnlocked = handleContactUnlocked;
    gameEngine.events.onThreadStateChanged = handleThreadStateChanged;
    gameEngine.events.onVariableChanged = handleVariableChanged;
    gameEngine.events.onActionExecuted = handleActionExecuted;

    // Don't auto-select first contact - start on Messages list
    // const unlockedContacts = gameEngine.getUnlockedContacts();
    // if (unlockedContacts.length > 0 && !selectedContact) {
    //   setSelectedContact(unlockedContacts[0]);
    // }

    return () => {
      // Cleanup event listeners
      gameEngine.events.onMessageAdded = () => {};
      gameEngine.events.onContactUnlocked = () => {};
      gameEngine.events.onThreadStateChanged = () => {};
      gameEngine.events.onVariableChanged = () => {};
      gameEngine.events.onActionExecuted = () => {};
    };
  }, [gameEngine, selectedContact]);

  // Update time every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(timer);
  }, []);

  const handleContactSelect = (contactName: string) => {
    setSelectedContact(contactName);
    
    // Initialize conversation if no messages exist yet
    const messages = gameEngine.getContactMessages(contactName);
    if (messages.length === 0) {
      const contact = gameData.contacts[contactName];
      const round1 = contact.rounds[1];
      if (round1) {
        // Add the initial message from the Twee script
        gameEngine.addMessage(contactName, round1.passage, false);
      }
    }
  };

  const handleBackToMessages = () => {
    setSelectedContact(null);
  };

  const handleChoiceSelect = (choiceIndex: number) => {
    if (selectedContact) {
      gameEngine.processChoice(selectedContact, choiceIndex);
    }
  };

  const handleResetGame = () => {
    gameEngine.resetGame();
    setGameState(gameEngine.getGameState());
    setSelectedContact(null);
  };

  const unlockedContacts = gameEngine.getUnlockedContacts();

  return (
    <div className="flex h-screen bg-gray-900">
      {/* Debug Controls - Outside iPhone Frame */}
      <div className="absolute top-4 left-4 z-50 flex space-x-2">
        <button
          onClick={() => setShowDebugPanel(!showDebugPanel)}
          className="px-3 py-2 bg-blue-500 rounded-lg text-sm text-white hover:bg-blue-600 transition-colors shadow-lg"
        >
          {showDebugPanel ? 'Hide' : 'Show'} Debug
        </button>
        <button
          onClick={handleResetGame}
          className="px-3 py-2 bg-red-500 rounded-lg text-sm text-white hover:bg-red-600 transition-colors shadow-lg"
        >
          Reset
        </button>
        {onScriptReload && (
          <button
            onClick={onScriptReload}
            className="px-3 py-2 bg-green-500 rounded-lg text-sm text-white hover:bg-green-600 transition-colors shadow-lg"
          >
            Reload Script
          </button>
        )}
      </div>

      {/* Debug Panel - Outside iPhone Frame */}
      {showDebugPanel && (
        <div className="absolute top-16 left-4 w-80 bg-gray-900 border border-gray-700 rounded-lg p-4 overflow-y-auto z-50 shadow-2xl">
          <h3 className="text-lg font-semibold mb-4 text-white">Debug Panel</h3>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2 text-gray-300">Variables</h4>
              <pre className="text-xs bg-gray-800 text-gray-200 p-2 rounded">
                {JSON.stringify(gameState.variables, null, 2)}
              </pre>
            </div>
            <div>
              <h4 className="font-medium mb-2 text-gray-300">Current Rounds</h4>
              <pre className="text-xs bg-gray-800 text-gray-200 p-2 rounded">
                {JSON.stringify(gameState.currentRounds, null, 2)}
              </pre>
            </div>
            <div>
              <h4 className="font-medium mb-2 text-gray-300">Thread States</h4>
              <pre className="text-xs bg-gray-800 text-gray-200 p-2 rounded">
                {JSON.stringify(gameState.threadStates, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}

             {/* iPhone Frame - Centered */}
       <div className="flex-1 flex items-center justify-center">
         <div className="relative w-80 h-[600px] bg-gray-900 rounded-[3rem] p-2 shadow-2xl border-4 border-gray-800">
           {/* iPhone Screen */}
           <div className="w-full h-full bg-black rounded-[2.5rem] overflow-hidden relative">
                           {/* Status Bar */}
              <div className="absolute top-0 left-0 right-0 h-7 bg-black z-10 flex items-center justify-between px-6 text-white text-xs font-medium">
                <span>{currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <div className="flex items-center space-x-1">
                  <div className="w-5 h-2 bg-white rounded-sm"></div>
                  <div className="w-1 h-1 bg-white rounded-full"></div>
                  <div className="w-1 h-1 bg-white rounded-full"></div>
                  <div className="w-1 h-1 bg-white rounded-full"></div>
                </div>
              </div>

             {/* Main SMS Interface */}
             <div className="flex flex-col h-full bg-black pt-7">
               {/* Header */}
               <div className="bg-black px-4 py-3 flex items-center justify-between border-b border-gray-800">
                 <div className="flex items-center space-x-3">
                   <h1 className="text-lg font-semibold text-white">Messages</h1>
                   <span className="text-sm text-gray-400">
                     {unlockedContacts.length} conversation{unlockedContacts.length !== 1 ? 's' : ''}
                   </span>
                 </div>
                 <div className="flex items-center space-x-2">
                   <button className="text-white text-lg">
                     <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                       <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                     </svg>
                   </button>
                 </div>
               </div>

              {/* Content */}
              <div className="flex-1 flex">
                {/* Contact List */}
                <div className="w-full">
                  <ContactList
                    contacts={gameData.contacts}
                    unlockedContacts={unlockedContacts}
                    selectedContact={selectedContact}
                    onContactSelect={handleContactSelect}
                    threadStates={gameState.threadStates}
                    messageHistory={gameState.messageHistory}
                  />
                </div>

                                 {/* Conversation */}
                 {selectedContact && (
                   <div className="absolute inset-0 bg-black">
                     <Conversation
                       contactName={selectedContact}
                       contact={gameData.contacts[selectedContact]}
                       messages={gameEngine.getContactMessages(selectedContact)}
                       currentRound={gameEngine.getCurrentRound(selectedContact)}
                       threadState={gameEngine.getContactState(selectedContact)}
                       onChoiceSelect={handleChoiceSelect}
                       onBack={handleBackToMessages}
                     />
                   </div>
                 )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 