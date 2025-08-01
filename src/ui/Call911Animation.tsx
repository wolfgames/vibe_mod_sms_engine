'use client';

import React, { useState, useEffect } from 'react';

interface Call911AnimationProps {
  isVisible: boolean;
  onComplete: () => void;
  duration?: number;
}

const Call911Animation: React.FC<Call911AnimationProps> = ({ 
  isVisible, 
  onComplete, 
  duration = 5000 
}) => {
  const [stage, setStage] = useState<'dialing' | 'connecting' | 'connected' | 'complete'>('dialing');
  const [callTime, setCallTime] = useState(0);

  useEffect(() => {
    if (!isVisible) return;

    // Animation sequence
    const dialingTimer = setTimeout(() => setStage('connecting'), 1500);
    const connectingTimer = setTimeout(() => setStage('connected'), 3000);
    const completeTimer = setTimeout(() => {
      setStage('complete');
      setTimeout(onComplete, 1000);
    }, duration - 1000);

    return () => {
      clearTimeout(dialingTimer);
      clearTimeout(connectingTimer);
      clearTimeout(completeTimer);
    };
  }, [isVisible, duration, onComplete]);

  useEffect(() => {
    if (stage === 'connected') {
      const interval = setInterval(() => {
        setCallTime(prev => prev + 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [stage]);

  if (!isVisible) return null;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-90 flex items-center justify-center">
      {/* iPhone Frame */}
      <div className="relative w-80 h-96 bg-black rounded-3xl border-4 border-gray-800 shadow-2xl overflow-hidden">
        {/* Status Bar */}
        <div className="absolute top-0 left-0 right-0 h-6 bg-black flex items-center justify-between px-6 text-white text-xs">
          <span>9:41</span>
          <div className="flex items-center space-x-1">
            <div className="w-4 h-2 bg-white rounded-sm"></div>
            <div className="w-1 h-1 bg-white rounded-full"></div>
            <div className="w-1 h-1 bg-white rounded-full"></div>
            <div className="w-1 h-1 bg-white rounded-full"></div>
          </div>
        </div>

        {/* Screen Content */}
        <div className="absolute top-6 left-0 right-0 bottom-0 bg-gradient-to-b from-blue-900 to-blue-800 flex flex-col">
          {/* Call Header */}
          <div className="flex-1 flex flex-col items-center justify-center text-white">
            <div className="text-center mb-8">
              <div className="w-20 h-20 bg-red-600 rounded-full flex items-center justify-center mb-4 mx-auto animate-pulse">
                <span className="text-2xl">🚨</span>
              </div>
              <h1 className="text-2xl font-bold mb-2">Emergency</h1>
              <p className="text-lg opacity-90">911</p>
            </div>

            {/* Call Status */}
            <div className="text-center">
              {stage === 'dialing' && (
                <div className="animate-pulse">
                  <p className="text-lg">Dialing...</p>
                  <div className="flex justify-center space-x-1 mt-2">
                    <div className="w-2 h-2 bg-white rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                </div>
              )}

              {stage === 'connecting' && (
                <div className="animate-pulse">
                  <p className="text-lg">Connecting...</p>
                  <div className="flex justify-center space-x-1 mt-2">
                    <div className="w-2 h-2 bg-white rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                </div>
              )}

              {stage === 'connected' && (
                <div>
                  <p className="text-lg text-green-400">Connected</p>
                  <p className="text-sm opacity-75 mt-1">{formatTime(callTime)}</p>
                </div>
              )}

              {stage === 'complete' && (
                <div className="animate-pulse">
                  <p className="text-lg text-green-400">Call Complete</p>
                  <p className="text-sm opacity-75 mt-1">Emergency services contacted</p>
                </div>
              )}
            </div>
          </div>

          {/* Call Controls */}
          <div className="p-6">
            <div className="flex justify-center space-x-8">
              {/* End Call Button */}
              <button 
                className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center text-white shadow-lg hover:bg-red-700 transition-colors"
                onClick={onComplete}
              >
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Home Indicator */}
        <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 w-32 h-1 bg-white rounded-full opacity-60"></div>
      </div>

      {/* Emergency Alert Overlay */}
      {stage === 'connected' && (
        <div className="absolute top-4 left-4 right-4 bg-red-600 text-white p-3 rounded-lg animate-pulse">
          <div className="flex items-center space-x-2">
            <span className="text-xl">🚨</span>
            <span className="font-semibold">EMERGENCY CALL IN PROGRESS</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default Call911Animation; 