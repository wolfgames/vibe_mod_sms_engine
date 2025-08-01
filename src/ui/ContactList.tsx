'use client';

import React from 'react';
import { Contact } from '../parser/types';
import { Message } from '../engine/gameEngine';
import { GameState } from '../engine/gameEngine';

interface ContactListProps {
  contacts: Record<string, Contact>;
  unlockedContacts: string[];
  selectedContact: string | null;
  onContactSelect: (contactName: string) => void;
  threadStates: Record<string, 'active' | 'locked' | 'ended'>;
  messageHistory: Record<string, Message[]>;
  viewedContacts: Set<string>; // Track which contacts have been viewed
}

export default function ContactList({
  contacts,
  unlockedContacts,
  selectedContact,
  onContactSelect,
  threadStates,
  messageHistory,
  viewedContacts
}: ContactListProps) {
  const getLastMessage = (contactName: string): string => {
    const messages = messageHistory[contactName] || [];
    const lastMessage = messages[messages.length - 1];
    
    if (!lastMessage) return '';
    

    
    // Don't show end_thread messages in preview when thread is active
    if (lastMessage.type === 'end_thread' && threadStates[contactName] === 'active') {
      // Find the last non-end_thread message
      for (let i = messages.length - 2; i >= 0; i--) {
        const message = messages[i];
        if (message.type !== 'end_thread') {
          if (message.type === 'photo') {
            return message.caption || '📷 Photo';
          } else if (message.type === 'video') {
            return message.caption || '🎥 Video';
          } else if (message.type === 'location') {
            return '📍 Location';
          } else if (message.type === 'typing') {
            return 'typing...';
          }
          return message.text;
        }
      }
      return ''; // No previous messages found
    }
    
    // Also handle unlock_contact messages - don't show them in preview
    if (lastMessage.type === 'unlock_contact') {
      // Find the last non-unlock_contact message
      for (let i = messages.length - 2; i >= 0; i--) {
        const message = messages[i];
        if (message.type !== 'unlock_contact') {
          if (message.type === 'photo') {
            return message.caption || '📷 Photo';
          } else if (message.type === 'video') {
            return message.caption || '🎥 Video';
          } else if (message.type === 'location') {
            return '📍 Location';
          } else if (message.type === 'typing') {
            return 'typing...';
          }
          return message.text;
        }
      }
      return ''; // No previous messages found
    }
    
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

  const hasStartedConversation = (contactName: string): boolean => {
    const messages = messageHistory[contactName] || [];
    // Check if contact has sent any messages (not just player messages)
    return messages.some(msg => !msg.isFromPlayer);
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
    
    if (!lastMessage) return '';
    
    // Don't show end_thread message time in preview when thread is active
    if (lastMessage.type === 'end_thread' && threadStates[contactName] === 'active') {
      // Find the last non-end_thread message
      for (let i = messages.length - 2; i >= 0; i--) {
        const message = messages[i];
        if (message.type !== 'end_thread') {
          return formatTimestamp(message.timestamp);
        }
      }
      return ''; // No previous messages found
    }
    
    return formatTimestamp(lastMessage.timestamp);
  };

  return (
    <div className="flex-1 overflow-y-auto">
      {unlockedContacts.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center px-6">
            <div className="w-16 h-16 bg-neutral-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" className="text-neutral-400">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">No Messages</h3>
          </div>
        </div>
      ) : (
        unlockedContacts.map((contactName) => {
          const contact = contacts[contactName];
          const lastMessage = getLastMessage(contactName);
          const unreadCount = getUnreadCount(contactName);
          const status = getContactStatus(contactName);
          const lastMessageTime = getLastMessageTime(contactName);

          return (
            <div key={contactName} className="block">
              <div 
                className={`flex items-center px-4 py-3 border-b border-neutral-800 hover:bg-neutral-900 transition-colors cursor-pointer ${
                  selectedContact === contactName ? 'bg-neutral-900' : ''
                }`}
                onClick={() => onContactSelect(contactName)}
              >
                <div className="relative">
                  <div className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center mr-3 overflow-hidden">
                    <div className="w-full h-full bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                      {contactName.charAt(0).toUpperCase()}
                    </div>
                  </div>
                  {/* Blue dot indicator for unread messages from contacts who have started conversations */}
                  {hasStartedConversation(contactName) && unreadCount > 0 && !viewedContacts.has(contactName) && (
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full border-2 border-black"></div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-white truncate">{contactName}</span>
                    <span className="text-xs text-gray-400 ml-2">
                      {lastMessageTime}
                    </span>
                  </div>
                                     <div className="text-sm text-gray-400 truncate">
                    {status === 'locked' || status === 'ended' 
                      ? 'Conversation has ended'
                      : lastMessage || 'Tap to start conversation'}
                  </div>
                </div>
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" className="text-gray-400">
                  <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
} 