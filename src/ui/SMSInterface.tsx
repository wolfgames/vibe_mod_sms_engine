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
  currentScript?: string;
  onScriptLoad?: (scriptName: string) => void;
  availableScripts?: string[];
  onResetGame?: () => void;
}

export default function SMSInterface({ 
  gameEngine, 
  gameData, 
  onScriptReload, 
  currentScript = 'Unknown Script',
  onScriptLoad,
  availableScripts = [],
  onResetGame
}: SMSInterfaceProps) {
  const [selectedContact, setSelectedContact] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState>(gameEngine.getGameState());
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [showScriptPanel, setShowScriptPanel] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  // Initialize typing delay with the game engine's current value instead of 0
  const [typingDelay, setTypingDelay] = useState(() => gameEngine.getGlobalTypingDelay());
  const [notifications, setNotifications] = useState<GameState['notifications']>(gameEngine.getNotifications());

  // Sync typing delay with game engine on mount and when game engine changes
  useEffect(() => {
    const engineDelay = gameEngine.getGlobalTypingDelay();
    if (engineDelay !== typingDelay) {
      setTypingDelay(engineDelay);
    }
  }, [gameEngine]); // Remove typingDelay from dependencies to avoid infinite loop

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
      // Action executed
    };

    const handleCharacterUnlocked = (event: CustomEvent) => {
      setGameState(gameEngine.getGameState());
    };

    const handleNotificationAdded = (event: CustomEvent) => {
      setNotifications(gameEngine.getNotifications());
      
      // Auto-remove notification after 3 seconds
      setTimeout(() => {
        gameEngine.clearNotifications();
        setNotifications(gameEngine.getNotifications());
      }, 3000);
    };

    // Set up event listeners
    gameEngine.events.onMessageAdded = handleMessageAdded;
    gameEngine.events.onContactUnlocked = handleContactUnlocked;
    gameEngine.events.onThreadStateChanged = handleThreadStateChanged;
    gameEngine.events.onVariableChanged = handleVariableChanged;
    gameEngine.events.onActionExecuted = handleActionExecuted;

    // Set up window event listeners
    window.addEventListener('character-unlocked', handleCharacterUnlocked as EventListener);
    window.addEventListener('notification-added', handleNotificationAdded as EventListener);

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
      
      // Cleanup window event listeners
      window.removeEventListener('character-unlocked', handleCharacterUnlocked as EventListener);
      window.removeEventListener('notification-added', handleNotificationAdded as EventListener);
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
    
    // Get the current round for this contact
    gameEngine.getCurrentRound(contactName);
    
    // Add initial message if this is the first time selecting this contact
    const contact = gameEngine.getContactData(contactName);
    if (contact && contact.rounds) {
      // Try to find the initial round - check for "1.0" or the first available round
      let initialRound = contact.rounds['1.0'];
      
      // If no initial round found, try the first available round
      if (!initialRound && Object.keys(contact.rounds).length > 0) {
        const firstRoundKey = Object.keys(contact.rounds).sort()[0];
        initialRound = contact.rounds[firstRoundKey];
      }
      
      if (initialRound && initialRound.passage && initialRound.passage.trim()) {
        // Check if the initial message already exists to prevent duplicates
        const existingMessages = gameEngine.getContactMessages(contactName);
        const initialMessageExists = existingMessages.some(msg => 
          msg.text === initialRound.passage && !msg.isFromPlayer
        );
        
        // Only add initial message if it doesn't already exist
        if (!initialMessageExists) {
          gameEngine.addMessage(contactName, initialRound.passage, false);
        }
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

  const handleUnlockContactClick = (contactName: string) => {
    // Navigate to the unlocked contact
    handleContactSelect(contactName);
  };

  const handleResetGame = () => {
    // Reset the game engine
    gameEngine.resetGame();
    
    // Clear all UI state
    setGameState(gameEngine.getGameState());
    setSelectedContact(null);
    setNotifications([]);
    setShowDebugPanel(false);
    setShowScriptPanel(false);
    
    // Call the parent's reset handler to refresh scripts and reload
    if (onResetGame) {
      onResetGame();
    }
    
    // Force a re-render by updating the game state
    setTimeout(() => {
      setGameState({ ...gameEngine.getGameState() });
    }, 100);
  };

  const handleScriptLoad = (scriptName: string) => {
    if (onScriptLoad) {
      onScriptLoad(scriptName);
      setShowScriptPanel(false);
    }
  };

  const unlockedContacts = gameEngine.getUnlockedContacts();

  return (
    <div className="flex h-screen bg-gray-900">
      <style jsx>{`
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
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
         
        <button
          onClick={() => setShowScriptPanel(!showScriptPanel)}
          className="px-3 py-2 bg-green-500 rounded-lg text-sm text-white hover:bg-green-600 transition-colors shadow-lg"
        >
          Load Script
        </button>
      </div>

      {/* Script Loading Panel - Outside iPhone Frame */}
      {showScriptPanel && (
        <div className="absolute top-16 left-4 w-96 bg-gray-900 border border-gray-700 rounded-lg p-4 overflow-y-auto z-50 shadow-2xl">
          <h3 className="text-lg font-semibold mb-4 text-white">Script Manager</h3>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2 text-gray-300">Current Script</h4>
              <div className="bg-gray-800 text-gray-200 p-3 rounded text-sm">
                {currentScript}
              </div>
            </div>
            
            <div>
              <h4 className="font-medium mb-2 text-gray-300">Available Scripts</h4>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {availableScripts.map((script) => (
                  <button
                    key={script}
                    onClick={() => handleScriptLoad(script)}
                    className={`w-full text-left p-3 rounded transition-colors ${
                      script === currentScript
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm">{script}</span>
                      {script === currentScript && (
                        <span className="text-xs bg-green-500 text-white px-2 py-1 rounded">
                          Current
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-gray-700">
              <button
                onClick={() => setShowScriptPanel(false)}
                className="w-full px-3 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

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
             <div>
               <h4 className="font-medium mb-2 text-gray-300">Typing Delay (ms)</h4>
               <div className="flex items-center space-x-2">
                 <input
                   type="range"
                   min="0"
                   max="5000"
                   step="100"
                   value={typingDelay}
                   onChange={(e) => {
                     const newDelay = Number(e.target.value);
                     setTypingDelay(newDelay);
                     gameEngine.setGlobalTypingDelay(newDelay);
                   }}
                   className="flex-1"
                 />
                 <span className="text-white text-sm w-16">{typingDelay}</span>
                 <button 
                   onClick={() => {
                     setTypingDelay(0);
                     gameEngine.setGlobalTypingDelay(0);
                     gameEngine.forceSetTypingDelay(0);
                   }}
                   className="ml-2 px-2 py-1 bg-blue-600 text-white text-xs rounded"
                 >
                   Test
                 </button>
               </div>
             </div>
                           <div>
                <h4 className="font-medium mb-2 text-gray-300">Test Actions</h4>
                <div className="space-y-2">
                                     <button 
                     onClick={() => {
                       gameEngine.setVariable('eli_thread_1_complete', true);
                     }}
                     className="w-full px-3 py-2 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                   >
                     Set eli_thread_1_complete = true
                   </button>
                   <button 
                     onClick={() => {
                       gameEngine.setVariable('eli_thread_1_complete', false);
                     }}
                     className="w-full px-3 py-2 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                   >
                     Set eli_thread_1_complete = false
                   </button>
                                                             <button 
                        onClick={() => {
                          gameEngine.setVariable('eli_thread_1_complete', true);
                          gameEngine.triggerConditionalThreadUnlock();
                        }}
                      className="w-full px-3 py-2 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                    >
                      Set True + Trigger Unlock
                    </button>
                                                                <button 
                         onClick={() => {
                           gameEngine.setVariable('eli_thread_1_complete', false);
                           // Manually lock the threads
                           gameEngine.state.threadStates['Jamie'] = 'locked';
                           gameEngine.state.threadStates['Maya'] = 'locked';
                           gameEngine.events.onThreadStateChanged('Jamie', 'locked');
                           gameEngine.events.onThreadStateChanged('Maya', 'locked');
                         }}
                       className="w-full px-3 py-2 bg-yellow-600 text-white text-xs rounded hover:bg-yellow-700"
                     >
                       Lock Threads for Testing
                     </button>
                     <button 
                       onClick={() => {
                         gameEngine.unlockContact('Eli Mercer');
                       }}
                       className="w-full px-3 py-2 bg-purple-600 text-white text-xs rounded hover:bg-purple-700"
                     >
                       Unlock Eli
                     </button>
                </div>
              </div>
              <div>
                <h4 className="font-medium mb-2 text-gray-300">Notifications</h4>
                <pre className="text-xs bg-gray-800 text-gray-200 p-2 rounded">
                  {JSON.stringify(notifications, null, 2)}
                </pre>
              </div>

           </div>
         </div>
       )}



             {/* iPhone Frame - Centered */}
       <div className="flex-1 flex items-center justify-center">
                   <div className="relative w-80 h-[660px] bg-gray-900 rounded-[3rem] p-2 shadow-2xl border-4 border-gray-800">
           {/* iPhone Screen */}
           <div className="w-full h-full bg-black rounded-[2.5rem] overflow-hidden relative">
                           {/* Status Bar */}
              <div className="absolute top-2 left-4 z-20 text-white text-sm font-medium">
                {currentTime.toLocaleTimeString('en-US', { 
                  hour: 'numeric', 
                  minute: '2-digit',
                  hour12: true 
                })}
              </div>
              
              {/* Status bar icons in upper right */}
              <div className="absolute top-2 right-4 z-20 flex items-center space-x-1">
                {/* Cellular signal */}
                <div className="flex items-end space-x-0.5">
                  <div className="w-1 h-1 bg-white rounded-sm"></div>
                  <div className="w-1 h-2 bg-white rounded-sm"></div>
                  <div className="w-1 h-3 bg-white rounded-sm"></div>
                  <div className="w-1 h-4 bg-white rounded-sm"></div>
                </div>
                
                {/* Battery */}
                <div className="ml-2 flex items-center">
                  <div className="w-6 h-3 border border-white rounded-sm relative">
                    <div className="absolute left-0.5 top-0.5 bottom-0.5 w-4 bg-white rounded-sm"></div>
                    <div className="absolute -right-1 top-0.5 bottom-0.5 w-0.5 bg-white rounded-r-sm"></div>
                  </div>
                  <span className="ml-1 text-white text-xs font-medium">67%</span>
                </div>
              </div>

                           {/* Main SMS Interface */}
              <div className="flex flex-col h-full bg-black">
                                 {/* Top bar */}
                                   <div className="relative flex items-center justify-center h-14 border-b border-neutral-800 bg-black">
                    <span className="text-lg font-semibold text-white" style={{ marginTop: '20px' }}>Messages</span>
                                       <button className="absolute right-4 top-1/2 -translate-y-1/2 p-1" style={{ marginTop: '10px' }}>
                     {/* Compose icon */}
                     <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                       <path d="M12 20h9" stroke="#007AFF" strokeWidth="2" strokeLinecap="round"/>
                       <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L8.5 17.5l-4 1 1-4L16.5 3.5Z" stroke="#007AFF" strokeWidth="2" strokeLinejoin="round"/>
                     </svg>
                   </button>
                 </div>
                
                {/* Search bar */}
                <div className="px-3 py-2 bg-black">
                  <div className="flex items-center bg-neutral-900 rounded-xl px-3 py-2 text-neutral-400">
                    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" className="mr-2">
                      <circle cx="11" cy="11" r="7" stroke="#888" strokeWidth="2"/>
                      <path d="M20 20l-3-3" stroke="#888" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                    <span className="text-sm">Search</span>
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
                     viewedContacts={gameState.viewedContacts}
                   />
                 </div>

                                 {/* Conversation */}
                 {selectedContact && (
                   <div className="absolute inset-0 bg-black">
                     {(() => {
                       const contact = gameEngine.getContactData(selectedContact);
                       const currentRound = gameEngine.getCurrentRoundData(selectedContact);
                       const contactRounds = contact?.rounds || {};
                       
                                               const currentRoundNumber = gameEngine.getCurrentRound(selectedContact);
                
                        
                        return (
                          <Conversation
                            key={`${selectedContact}-${currentRound?.passage || 'no-passage'}`}
                            contactName={selectedContact}
                            roundNumber={currentRoundNumber}
                            currentRound={currentRound}
                            contactRounds={contactRounds}
                            choices={currentRound?.choices || []}
                            messages={gameEngine.getContactMessages(selectedContact)}
                            onChoiceSelect={handleChoiceSelect}
                            onUnlockContactClick={handleUnlockContactClick}
                            onBack={handleBackToMessages}
                          />
                        );
                     })()}
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