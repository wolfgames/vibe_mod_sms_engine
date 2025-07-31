// Test script to verify typing delay functionality
console.log('Testing typing delay functionality...');

// Test 1: Check if localStorage has saved typing delay
const savedState = localStorage.getItem('sms_game_state');
if (savedState) {
  const parsed = JSON.parse(savedState);
  console.log('Saved typing delay:', parsed.typingDelays?.global || 'not found');
} else {
  console.log('No saved state found');
}

// Test 2: Set typing delay to 0 and save
const testState = {
  typingDelays: { global: 0 },
  unlockedContacts: [],
  viewedContacts: [],
  currentRounds: {},
  variables: {},
  threadStates: {},
  messageHistory: {},
  gameStartTime: Date.now(),
  notifications: []
};

localStorage.setItem('sms_game_state', JSON.stringify(testState));
console.log('Set typing delay to 0 and saved to localStorage');

// Test 3: Read back the saved value
const readBack = localStorage.getItem('sms_game_state');
if (readBack) {
  const parsed = JSON.parse(readBack);
  console.log('Read back typing delay:', parsed.typingDelays?.global);
}

console.log('Test completed. Check the browser console for results.'); 