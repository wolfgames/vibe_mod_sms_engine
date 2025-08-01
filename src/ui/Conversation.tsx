'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Contact } from '../parser/types';
import { Message } from '../engine/gameEngine';
import ChoiceButtons from './ChoiceButtons';
import Call911Animation from './Call911Animation';

interface ConversationProps {
  contactName: string;
  roundNumber: string;
  currentRound: any;
  contactRounds: Record<string, any>;
  choices: any[];
  messages: Message[];
  onChoiceSelect: (choiceIndex: number) => void;
  onUnlockContactClick: (contactName: string) => void;
  onBack?: () => void;
}

export default function Conversation({
  contactName,
  roundNumber,
  currentRound,
  contactRounds,
  choices,
  messages,
  onChoiceSelect,
  onUnlockContactClick,
  onBack
}: ConversationProps) {
  

  const [showMap, setShowMap] = useState(false);
  const [show911Animation, setShow911Animation] = useState(false);
  const [showEnlargedImage, setShowEnlargedImage] = useState(false);
  const [enlargedImageSrc, setEnlargedImageSrc] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showChoices, setShowChoices] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Update time every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    // Scroll to bottom whenever messages change
    scrollToBottom();
  }, [messages]);

  // Additional scroll effect for when new messages are added
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollToBottom();
    }, 100); // Small delay to ensure DOM is updated
    
    return () => clearTimeout(timer);
  }, [messages.length]);

  // Listen for 911 call animation event
  useEffect(() => {
    const handle911Call = (event: CustomEvent) => {
      setShow911Animation(true);
    };

    window.addEventListener('call-911-animation', handle911Call as EventListener);
    
    return () => {
      window.removeEventListener('call-911-animation', handle911Call as EventListener);
    };
  }, []);

  // Initial scroll to bottom when component mounts
  useEffect(() => {
    scrollToBottom();
  }, []);

  // Scroll to bottom when contact changes
  useEffect(() => {
    scrollToBottom();
  }, [contactName]);

  const handleInputClick = () => {
    // Check if thread has ended by looking for thread ended message
    const threadEnded = messages.some(msg => msg.isThreadEnded);
    

    
    // Show choices if available and thread hasn't ended
    if (currentRound?.choices && currentRound.choices.length > 0 && !threadEnded) {
      setShowChoices(!showChoices);
      // Scroll to bottom when choices appear
      setTimeout(() => {
        scrollToBottom();
      }, 50);
    }
  };

  const handleChoiceSelect = (choiceIndex: number) => {
    onChoiceSelect(choiceIndex);
    setShowChoices(false);
  };

  const handleBackdropClick = () => {
    setShowChoices(false);
  };

  const handleLocationPinClick = () => {
    setShowMap(!showMap);
  };

  const handleMapClose = () => {
    setShowMap(false);
  };

  const handleImageClick = (imageSrc: string) => {
    setEnlargedImageSrc(imageSrc);
    setShowEnlargedImage(true);
  };

  const handleEnlargedImageClose = () => {
    setShowEnlargedImage(false);
    setEnlargedImageSrc('');
  };

  const getAvatar = (name: string) => {
    // Simple avatar generation based on name
    const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-pink-500', 'bg-yellow-500'];
    const colorIndex = name.charCodeAt(0) % colors.length;
    return colors[colorIndex];
  };

  return (
    <div className="w-full h-full bg-black flex flex-col">
      {/* 911 Call Animation */}
      <Call911Animation
        isVisible={show911Animation}
        onComplete={() => setShow911Animation(false)}
        duration={5000}
      />
      
      {/* Grey divider box - from top to messages area */}
      <div className="w-full h-[82px] bg-gray-800 absolute top-0 left-0 z-0"></div>
      
      {/* Clock in upper left */}
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
      
      {/* Back arrow */}
      <button 
        onClick={onBack}
        className="absolute top-9 left-4 z-30 w-8 h-8 flex items-center justify-center bg-black/60 rounded-full hover:bg-black/80 transition cursor-pointer"
        style={{ pointerEvents: 'auto' }}
      >
        <svg width="24" height="24" fill="none" viewBox="0 0 24 24">
          <path d="M15 19l-7-7 7-7" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Top bar with avatar */}
      <div className="h-[80px] flex flex-col items-center justify-center w-full bg-transparent relative z-10 pt-4">
        <div className={`w-10 h-10 ${getAvatar(contactName)} rounded-full flex items-center justify-center overflow-hidden mb-1`}>
          <span className="text-white font-bold text-lg">
            {contactName.charAt(0).toUpperCase()}
          </span>
        </div>
        <span className="text-white font-semibold text-sm">{contactName}</span>
      </div>

      {/* Messages area */}
      <div className="flex-1 w-full px-4 py-2 pb-16 flex flex-col gap-2 overflow-y-auto">
        {messages.map((msg, i) => (
          <div key={msg.id} className={`flex flex-col ${msg.isFromPlayer ? "items-end" : "items-start"}`}>
            {/* Typing indicator */}
            {msg.type === 'typing' && (
              <div className="flex items-end gap-2">
                <div className={`w-8 h-8 ${getAvatar(contactName)} rounded-full flex items-center justify-center`}>
                  <span className="text-white font-bold text-sm">
                    {contactName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="bg-gray-200 text-black rounded-2xl rounded-bl-none px-4 py-2 max-w-[200px] text-sm shadow">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-gray-600 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-600 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 bg-gray-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Regular contact messages */}
            {!msg.isFromPlayer && !msg.isLocationPin && !msg.isThreadEnded && msg.type !== 'typing' && msg.type !== 'unlock_contact' && (
              <div className="flex items-end gap-2">
                <div className={`w-8 h-8 ${getAvatar(contactName)} rounded-full flex items-center justify-center`}>
                  <span className="text-white font-bold text-sm">
                    {contactName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="bg-gray-200 text-black rounded-2xl rounded-bl-none px-4 py-2 max-w-[200px] text-sm shadow">
                  {msg.text}
                  {msg.image && (
                    <button
                      className="mt-1 w-24 h-24 rounded-lg overflow-hidden border border-gray-400 bg-black/20 block"
                      onClick={() => handleImageClick(msg.image!)}
                    >
                      <img
                        src={msg.image.startsWith('/') ? msg.image : `/${msg.image}`}
                        alt="attachment"
                        className="object-cover w-full h-full"
                      />
                      {msg.mediaType === 'location' && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                          <span className="text-white text-2xl">📍</span>
                        </div>
                      )}
                    </button>
                  )}
                </div>
              </div>
            )}
            
            {/* New contact unlock messages - green styling */}
            {!msg.isFromPlayer && msg.type === 'unlock_contact' && (
              <div className="flex items-end gap-2">
                <div className={`w-8 h-8 ${getAvatar(contactName)} rounded-full flex items-center justify-center`}>
                  <span className="text-white font-bold text-sm">
                    {contactName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <button
                  className="bg-green-600 text-white rounded-2xl rounded-bl-none px-4 py-2 max-w-[200px] text-sm shadow hover:bg-green-700 transition-colors relative"
                  onClick={() => msg.unlockedContactName && onUnlockContactClick(msg.unlockedContactName)}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{msg.text}</span>
                    <div className="flex items-center ml-2">
                      <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center overflow-hidden border border-gray-300">
                        <div className={`w-full h-full ${getAvatar(msg.unlockedContactName || '')} flex items-center justify-center`}>
                          <span className="text-black font-bold text-xs">
                            {msg.unlockedContactName?.charAt(0).toUpperCase() || '?'}
                          </span>
                        </div>
                      </div>
                      <span className="text-white text-xs ml-1">&gt;</span>
                    </div>
                  </div>
                  <div className="text-xs mt-1 opacity-80">Tap to open chat</div>
                </button>
              </div>
            )}
            
            {/* Location pin messages */}
            {!msg.isFromPlayer && msg.isLocationPin && (
              <div className="flex items-end gap-2">
                <div className={`w-8 h-8 ${getAvatar(contactName)} rounded-full flex items-center justify-center`}>
                  <span className="text-white font-bold text-sm">
                    {contactName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <button
                  className="bg-green-600 text-white rounded-2xl rounded-bl-none px-4 py-2 max-w-[200px] text-sm shadow hover:bg-green-700 transition-colors"
                  onClick={() => handleImageClick(msg.image || 'assets/images/map.png')}
                >
                  <div className="flex items-center">
                    <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-sm font-semibold">{msg.locationPin?.location}</span>
                  </div>
                  <div className="mt-2 w-full">
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        handleImageClick(msg.image || 'assets/images/map.png');
                      }}
                      className="w-full cursor-pointer"
                    >
                      <img
                        src={msg.image && msg.image.startsWith('/') ? msg.image : `/${msg.image || 'assets/images/map.png'}`}
                        alt="location"
                        className="w-full h-16 rounded-lg object-cover border border-white/20 hover:opacity-80 transition-opacity"
                      />
                    </div>
                  </div>
                  <div className="text-xs mt-1 opacity-60">Tap to view map</div>
                </button>
              </div>
            )}
            
            {/* Thread ended messages - iOS style notification */}
            {msg.isThreadEnded && (
              <div className="flex justify-center items-center mb-3 w-full">
                <div className="text-gray-400 text-xs text-center">
                  {msg.text}
                </div>
              </div>
            )}
            
            {/* Player messages */}
            {msg.isFromPlayer && !msg.isLocationPin && (
              <div className="bg-blue-500 text-white rounded-2xl rounded-br-none px-4 py-2 max-w-[200px] text-sm shadow">
                {msg.text}
              </div>
            )}
            
            {/* Player location messages */}
            {msg.isFromPlayer && msg.isLocationPin && (
              <button
                className="bg-green-600 text-white rounded-2xl rounded-br-none px-4 py-2 max-w-[200px] text-sm shadow hover:bg-green-700 transition-colors"
                onClick={() => handleImageClick(msg.image || 'assets/images/map.png')}
              >
                <div className="flex items-center">
                  <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm font-semibold">{msg.locationPin?.location}</span>
                </div>
                <div className="mt-2 w-full">
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      handleImageClick(msg.image || 'assets/images/map.png');
                    }}
                    className="w-full cursor-pointer"
                  >
                    <img
                      src={msg.image && msg.image.startsWith('/') ? msg.image : `/${msg.image || 'assets/images/map.png'}`}
                      alt="location"
                      className="w-full h-16 rounded-lg object-cover border border-white/20 hover:opacity-80 transition-opacity"
                    />
                  </div>
                </div>
                <div className="text-xs mt-1 opacity-60">Tap to view map</div>
              </button>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="absolute bottom-0 left-0 right-0 bg-black p-4">
        <div className="flex items-center space-x-2">
          <div 
            className="flex-1 bg-gray-800 text-white rounded-full px-4 py-2 text-sm cursor-pointer"
            onClick={handleInputClick}
          >
            <span className="opacity-60">iMessage</span>
          </div>
        </div>
      </div>

      {/* Choice buttons overlay */}
      {showChoices && choices && choices.length > 0 && (
        <div className="absolute bottom-16 left-0 right-0 bg-black bg-opacity-50 flex items-end justify-center p-4">
          <div className="w-full max-w-sm">
            <ChoiceButtons
              choices={choices}
              onChoiceSelect={handleChoiceSelect}
            />
          </div>
        </div>
      )}

      {/* Enlarged image modal */}
      {showEnlargedImage && (
        <div className="absolute inset-0 z-50 bg-black bg-opacity-95 flex items-center justify-center p-4">
          <div className="relative w-full h-full flex items-center justify-center">
            <button
              onClick={handleEnlargedImageClose}
              className="absolute top-4 right-4 w-10 h-10 bg-black bg-opacity-50 text-white rounded-full flex items-center justify-center hover:bg-opacity-70 transition-colors z-10"
            >
              ×
            </button>
            <img
              src={enlargedImageSrc.startsWith('/') ? enlargedImageSrc : `/${enlargedImageSrc}`}
              alt="enlarged"
              className="max-w-full max-h-full object-contain"
              onClick={handleEnlargedImageClose}
            />
          </div>
        </div>
      )}

      {/* Map modal */}
      {showMap && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-90 flex items-center justify-center p-4">
          <div className="relative w-full max-w-md bg-white rounded-lg overflow-hidden">
            <div className="p-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Location</h3>
                <button
                  onClick={handleMapClose}
                  className="w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center hover:bg-gray-300 transition-colors"
                >
                  ×
                </button>
              </div>
              <div className="bg-gray-200 h-48 rounded-lg flex items-center justify-center">
                <span className="text-gray-500">Map View</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 