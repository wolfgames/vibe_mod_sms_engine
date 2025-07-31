'use client';

import React, { useRef, useEffect, useState } from 'react';
import { Contact, Message } from '../parser/types';
import MessageBubble from './MessageBubble';
import ChoiceButtons from './ChoiceButtons';

interface ConversationProps {
  contactName: string;
  contact: Contact;
  messages: Message[];
  currentRound: number;
  threadState: 'active' | 'locked' | 'ended';
  onChoiceSelect: (choiceIndex: number) => void;
  onBack: () => void;
}

export default function Conversation({
  contactName,
  contact,
  messages,
  currentRound,
  threadState,
  onChoiceSelect,
  onBack
}: ConversationProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showChoices, setShowChoices] = useState(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const getCurrentChoices = () => {
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
             {/* Header */}
               <div className="bg-black px-4 py-4 flex items-center border-b border-gray-800">
          <button onClick={onBack} className="text-white text-lg flex-shrink-0 mr-3">
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </button>
          <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0 mr-3">
            {contactName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 ml-2">
            <h2 className="text-lg font-semibold text-white">{contactName}</h2>
            <p className="text-sm text-gray-400">
              {threadState === 'active' && 'online'}
              {threadState === 'locked' && 'conversation locked'}
              {threadState === 'ended' && 'conversation ended'}
            </p>
          </div>
        </div>

             {/* Messages */}
       <div className="flex-1 overflow-y-auto px-4 py-2 scrollbar-hide">
        {messageGroups.map((group, groupIndex) => (
          <div key={groupIndex}>
            {/* Date header */}
            <div className="flex justify-center my-4">
              <span className="bg-gray-800 text-gray-400 text-xs px-3 py-1 rounded-full">
                {formatDateHeader(group.date)}
              </span>
            </div>

            {/* Messages in this group */}
            {group.messages.map((message, messageIndex) => (
              <div key={message.id} className="mb-4">
                <MessageBubble
                  message={message}
                  timestamp={formatTimestamp(message.timestamp)}
                  isLastInGroup={messageIndex === group.messages.length - 1}
                />
              </div>
            ))}
          </div>
        ))}

        {/* Typing indicator - only show when there are choices available (contact is about to respond) */}
        {threadState === 'active' && currentChoices.length > 0 && (
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

        {/* Thread state message */}
        {threadState !== 'active' && (
          <div className="flex justify-center my-4">
            <div className="bg-gray-800 text-gray-400 text-sm px-4 py-2 rounded-full">
              {threadState === 'locked' && 'This conversation is locked until conditions are met'}
              {threadState === 'ended' && 'This conversation has ended'}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

                     {/* Choices - only show when toggled */}
        {threadState === 'active' && currentChoices.length > 0 && showChoices && (
          <div className="bg-gray-900 border-t border-gray-800 p-4">
            <ChoiceButtons
              choices={currentChoices}
              onChoiceSelect={handleChoiceSelect}
            />
          </div>
        )}

                    {/* Input bar - always show when thread is active */}
       {threadState === 'active' && (
         <div className="bg-gray-900 border-t border-gray-800 p-4">
           <div className="flex items-center space-x-3">
             <button className="w-8 h-8 bg-gray-700 rounded-lg flex items-center justify-center">
               <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                 <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
               </svg>
             </button>
             <div 
               className="flex-1 bg-gray-800 rounded-full px-4 py-2 cursor-pointer"
               onClick={handleInputClick}
             >
               <span className="text-gray-400 text-sm">iMessage</span>
             </div>
             <button className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
               <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                 <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
               </svg>
             </button>
           </div>
         </div>
       )}
    </div>
  );
} 