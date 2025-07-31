'use client';

import React, { useState } from 'react';
import { Message } from '../engine/gameEngine';

interface MessageBubbleProps {
  message: Message;
  timestamp: string;
  isLastInGroup: boolean;
}

export default function MessageBubble({ message, timestamp, isLastInGroup }: MessageBubbleProps) {
  const [showMedia, setShowMedia] = useState(false);

  const isFromPlayer = message.isFromPlayer;

  const renderMessageContent = () => {
    switch (message.type) {
      case 'photo':
        return (
          <div className="space-y-2">
            <div 
              className="cursor-pointer rounded-lg overflow-hidden max-w-xs"
              onClick={() => setShowMedia(!showMedia)}
            >
              <img
                src={message.mediaUrl || '/assets/images/placeholder.png'}
                alt={message.caption || 'Photo'}
                className="w-full h-auto"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.src = '/assets/images/placeholder.png';
                }}
              />
            </div>
            {message.caption && (
              <p className="text-sm">{message.caption}</p>
            )}
          </div>
        );

      case 'video':
        return (
          <div className="space-y-2">
            <div 
              className="cursor-pointer rounded-lg overflow-hidden max-w-xs"
              onClick={() => setShowMedia(!showMedia)}
            >
              <video
                src={message.mediaUrl}
                controls
                className="w-full h-auto"
                onError={(e) => {
                  const target = e.target as HTMLVideoElement;
                  target.src = '/assets/videos/placeholder.mp4';
                }}
              />
            </div>
            {message.caption && (
              <p className="text-sm">{message.caption}</p>
            )}
          </div>
        );

      case 'location':
        return (
          <div className="space-y-2">
            <div className="bg-gray-600 border border-gray-500 rounded-lg p-3 max-w-xs">
              <div className="flex items-center space-x-2 mb-2">
                <svg className="w-5 h-5 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                </svg>
                <span className="font-medium text-white">{message.location?.name}</span>
              </div>
              {message.location?.description && (
                <p className="text-sm text-gray-300">{message.location.description}</p>
              )}
              {message.location?.mapFile && (
                <div 
                  className="mt-2 cursor-pointer rounded overflow-hidden"
                  onClick={() => setShowMedia(!showMedia)}
                >
                  <img
                    src={message.location.mapFile}
                    alt="Location map"
                    className="w-full h-auto"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = '/assets/images/placeholder.png';
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        );

      case 'typing':
        return (
          <div className="flex space-x-1">
            <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce"></div>
            <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
            <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
          </div>
        );

      default:
        return <p className="text-sm">{message.text}</p>;
    }
  };

  return (
    <div className={`flex ${isFromPlayer ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-xs lg:max-w-md ${isFromPlayer ? 'order-2' : 'order-1'}`}>
        <div
          className={`rounded-2xl px-4 py-2 shadow-sm ${
            isFromPlayer
              ? 'bg-blue-500 text-white'
              : 'bg-gray-700 text-white'
          }`}
        >
          {renderMessageContent()}
        </div>
        
        {/* Timestamp */}
        {isLastInGroup && (
          <div className={`text-xs text-gray-400 mt-1 ${isFromPlayer ? 'text-right' : 'text-left'}`}>
            {timestamp}
            {isFromPlayer && (
              <span className="ml-2">✓✓</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Media viewer modal component
export function MediaViewer({ 
  isOpen, 
  onClose, 
  mediaUrl, 
  mediaType, 
  caption 
}: {
  isOpen: boolean;
  onClose: () => void;
  mediaUrl?: string;
  mediaType: 'photo' | 'video';
  caption?: string;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="relative max-w-4xl max-h-full p-4">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white text-2xl hover:text-gray-300 z-10"
        >
          ×
        </button>
        
        <div className="bg-white rounded-lg overflow-hidden">
          {mediaType === 'photo' ? (
            <img
              src={mediaUrl}
              alt={caption || 'Photo'}
              className="w-full h-auto max-h-96 object-contain"
            />
          ) : (
            <video
              src={mediaUrl}
              controls
              className="w-full h-auto max-h-96"
            />
          )}
          
          {caption && (
            <div className="p-4 border-t border-gray-200">
              <p className="text-sm text-gray-600">{caption}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 