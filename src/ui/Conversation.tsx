'use client';

import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Contact } from '../parser/types';
import { Message } from '../engine/gameEngine';
import MessageBubble from './MessageBubble';

interface ConversationProps {
  contactName: string;
  contact: Contact;
  messages: Message[];
  currentRound: string;
  threadState: 'active' | 'locked' | 'ended';
  onChoiceSelect: (choiceIndex: number) => void;
  onBack: () => void;
  typingDelay?: number;
  onUnlockContactClick?: (contactName: string) => void;
  gameEngine?: any; // Add gameEngine prop
}

export default function Conversation({
  contactName,
  contact,
  messages,
  currentRound,
  threadState,
  onChoiceSelect,
  onBack,
  typingDelay = 2000,
  onUnlockContactClick,
  gameEngine
}: ConversationProps) {

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showChoices, setShowChoices] = useState(false);
  const [showTypingIndicator, setShowTypingIndicator] = useState(false);

  // Memoize the current typing delay to ensure stable reference
  const currentTypingDelay = useMemo(() => {
    return gameEngine ? gameEngine.getGlobalTypingDelay() : typingDelay;
  }, [gameEngine, typingDelay]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Handle typing indicator timing
  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      
      // Show typing indicator when last message is from player
      if (lastMessage && lastMessage.isFromPlayer) {
        setShowTypingIndicator(true);
        
        // Hide typing indicator after the delay from debug slider
        const timer = setTimeout(() => {
          setShowTypingIndicator(false);
        }, currentTypingDelay);
        
        return () => clearTimeout(timer);
      } else {
        setShowTypingIndicator(false);
      }
    }
  }, [messages, currentRound, contact.rounds, currentTypingDelay, contactName]);

  const getCurrentChoices = () => {
    // Safety check: ensure contact exists and has rounds
    if (!contact || !contact.rounds) {
      console.warn(`Contact ${contactName} not found or missing rounds`);
      return [];
    }
    const round = contact.rounds[currentRound];
    return round?.choices || [];
  };

  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const groupMessagesByDate = (messages: Message[]) => {
    const groups: { date: string; messages: Message[] }[] = [];
    let currentGroup: { date: string; messages: Message[] } | null = null;

    messages.forEach(message => {
      const messageDate = new Date(message.timestamp).toDateString();
      
      if (!currentGroup || currentGroup.date !== messageDate) {
        currentGroup = { date: messageDate, messages: [] };
        groups.push(currentGroup);
      }
      
      currentGroup.messages.push(message);
    });

    return groups;
  };

  const formatDateHeader = (dateString: string): string => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString();
    }
  };

  const messageGroups = groupMessagesByDate(messages);
  const currentChoices = getCurrentChoices();

  const handleInputClick = () => {
    if (currentChoices.length > 0) {
      setShowChoices(!showChoices);
    }
  };

  const handleChoiceSelect = (choiceIndex: number) => {
    // Close choices after selection
    setShowChoices(false);
    // Call the parent's choice handler
    onChoiceSelect(choiceIndex);
  };

    return (
    <div className="flex flex-col h-full bg-black">
      {/* Grey divider box - from top to messages area */}
      <div className="w-full h-[82px] bg-gray-800 absolute top-0 left-0 z-0"></div>
      
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
        <div className="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center overflow-hidden mb-1">
          <div className="w-full h-full bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold">
            {contactName.charAt(0).toUpperCase()}
          </div>
        </div>
        <span className="text-white font-semibold text-sm">{contactName}</span>
      </div>

      {/* Messages area */}
          <div className="flex-1 w-full px-4 py-2 pb-16 flex flex-col gap-2 overflow-y-auto">
        {messageGroups.map((group, groupIndex) => (
          <div key={groupIndex}>
                                                   {/* Date header */}
              <div className="flex justify-center my-1">
                <span className="bg-gray-800 text-gray-400 text-xs px-3 py-1 rounded-full">
                  {formatDateHeader(group.date)}
                </span>
              </div>

                         {/* Messages in this group */}
             {group.messages.map((message, messageIndex) => (
               <div key={message.id} className="mb-2">
                 <MessageBubble
                   message={message}
                   timestamp={formatTimestamp(message.timestamp)}
                   isLastInGroup={messageIndex === group.messages.length - 1}
                   onUnlockContactClick={onUnlockContactClick}
                 />
               </div>
             ))}
          </div>
        ))}

        {/* Typing indicator - only show when waiting for contact response after player choice */}
        {showTypingIndicator && (
          <div className="flex justify-start mb-4">
            <div className="bg-gray-800 rounded-2xl px-4 py-2 shadow-sm border border-gray-700">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        )}

        {/* Thread state message - only show for ended conversations */}
        {threadState === 'ended' && (
          <div className="flex justify-center my-4">
            <div className="text-gray-500 text-sm">
              The Conversation has ended
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

                           {/* Choices overlay */}
      {threadState === 'active' && currentChoices.length > 0 && showChoices && (
        <div className="absolute inset-0 bg-black/50 flex items-end justify-center pb-20" onClick={() => setShowChoices(false)}>
          <div className="w-full px-4 pb-4" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="text-white text-sm mb-3 font-semibold">Choose your response:</div>
              <div className="space-y-2">
                {currentChoices.map((choice: any, index: number) => (
                  <button
                    key={index}
                    className="w-full text-left bg-blue-600 hover:bg-blue-700 rounded-lg px-4 py-2 text-white transition-colors"
                    onClick={() => handleChoiceSelect(index)}
                  >
                    {choice.text}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

                                         {/* Input bar */}
        <div className="w-full h-[56px] bg-black/90 flex items-center px-4 gap-2 absolute bottom-0 left-0">
          <button className="w-8 h-8 flex items-center justify-center">
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24">
              <rect x="3" y="5" width="18" height="14" rx="3" fill="#fff"/>
              <circle cx="8" cy="12" r="2" fill="#bbb"/>
            </svg>
          </button>
          <input 
            className="flex-1 bg-gray-800 text-white rounded-full px-4 py-2 outline-none border-none text-sm"
            placeholder="iMessage" 
            onClick={handleInputClick}
            readOnly
          />
          <button className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center ml-2">
            <svg width="16" height="16" fill="white" viewBox="0 0 16 16">
              <path d="M4 8h8M8 4l4 4-4 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
    </div>
  );
} 