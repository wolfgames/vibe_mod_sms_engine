'use client';

import React from 'react';
import { Contact, Message } from '../parser/types';
import { GameState } from '../engine/gameEngine';

interface ContactListProps {
  contacts: Record<string, Contact>;
  unlockedContacts: string[];
  selectedContact: string | null;
  onContactSelect: (contactName: string) => void;
  threadStates: Record<string, 'active' | 'locked' | 'ended'>;
  messageHistory: Record<string, Message[]>;
}

export default function ContactList({
  contacts,
  unlockedContacts,
  selectedContact,
  onContactSelect,
  threadStates,
  messageHistory
}: ContactListProps) {
  const getLastMessage = (contactName: string): string => {
    const messages = messageHistory[contactName] || [];
    const lastMessage = messages[messages.length - 1];
    
    if (!lastMessage) return '';
    
    if (lastMessage.type === 'photo') {
      return lastMessage.caption || '📷 Photo';
    } else if (lastMessage.type === 'video') {
      return lastMessage.caption || '🎥 Video';
    } else if (lastMessage.type === 'location') {
      return '📍 Location';
    } else if (lastMessage.type === 'typing') {
      return 'typing...';
    }
    
    return lastMessage.text;
  };

  const getUnreadCount = (contactName: string): number => {
    const messages = messageHistory[contactName] || [];
    return messages.filter(msg => !msg.isFromPlayer && !msg.read).length;
  };

  const getContactStatus = (contactName: string): 'active' | 'locked' | 'ended' => {
    return threadStates[contactName] || 'active';
  };

  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString();
  };

  const getLastMessageTime = (contactName: string): string => {
    const messages = messageHistory[contactName] || [];
    const lastMessage = messages[messages.length - 1];
    return lastMessage ? formatTimestamp(lastMessage.timestamp) : '';
  };

  return (
    <div className="h-full overflow-y-auto bg-black scrollbar-hide">
      {/* Search Bar */}
      <div className="px-4 py-2">
        <div className="bg-gray-800 rounded-lg px-4 py-2 flex items-center space-x-2">
          <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
          </svg>
          <span className="text-gray-400 text-sm">Search</span>
        </div>
      </div>

             {unlockedContacts.length === 0 ? (
         <div className="flex items-center justify-center h-full text-gray-400">
           <div className="text-center">
             <svg className="w-12 h-12 mb-2 mx-auto" fill="currentColor" viewBox="0 0 20 20">
               <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
             </svg>
             <p className="text-sm">No conversations unlocked yet</p>
           </div>
         </div>
       ) : (
        <div className="divide-y divide-gray-800">
          {unlockedContacts.map((contactName) => {
            const contact = contacts[contactName];
            const lastMessage = getLastMessage(contactName);
            const unreadCount = getUnreadCount(contactName);
            const status = getContactStatus(contactName);
            const lastMessageTime = getLastMessageTime(contactName);

            return (
              <div
                key={contactName}
                onClick={() => onContactSelect(contactName)}
                className={`px-4 py-3 cursor-pointer hover:bg-gray-900 transition-colors ${
                  selectedContact === contactName ? 'bg-blue-900' : ''
                }`}
              >
                <div className="flex items-center space-x-3">
                  {/* Avatar */}
                  <div className="flex-shrink-0 relative">
                    <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold">
                      {contactName.charAt(0).toUpperCase()}
                    </div>
                    {/* Blue status dot */}
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full border-2 border-black"></div>
                  </div>

                  {/* Contact Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium text-white truncate">
                        {contactName}
                      </h3>
                      <span className="text-xs text-gray-400">
                        {lastMessageTime}
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between mt-1">
                      <p className={`text-sm truncate ${
                        status === 'locked' || status === 'ended' 
                          ? 'text-gray-500 italic' 
                          : unreadCount > 0 
                            ? 'text-white font-medium' 
                            : 'text-gray-400'
                      }`}>
                        {status === 'locked' && 'Conversation has ended'}
                        {status === 'ended' && 'Conversation has ended'}
                        {status === 'active' && (lastMessage || 'Tap to start conversation')}
                      </p>
                      
                      {unreadCount > 0 && (
                        <span className="flex-shrink-0 ml-2 bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
                    </div>
                  </div>

                                     {/* Chevron */}
                   <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                     <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                   </svg>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
} 