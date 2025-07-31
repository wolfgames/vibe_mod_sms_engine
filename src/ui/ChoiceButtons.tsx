'use client';

import React from 'react';
import { Choice } from '../parser/types';

interface ChoiceButtonsProps {
  choices: Choice[];
  onChoiceSelect: (choiceIndex: number) => void;
}

export default function ChoiceButtons({ choices, onChoiceSelect }: ChoiceButtonsProps) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-300 mb-3">Choose your response:</p>
      {choices.map((choice, index) => (
        <button
          key={index}
          onClick={() => onChoiceSelect(index)}
          className="w-full bg-blue-500 text-white rounded-xl px-4 py-3 text-left hover:bg-blue-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 font-medium"
        >
          {choice.displayText || choice.text}
        </button>
      ))}
    </div>
  );
} 