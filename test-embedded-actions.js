// Simple test for embedded actions
const fs = require('fs');
const path = require('path');

// Read the script file
const scriptPath = path.join(__dirname, 'public/scripts/SMS Branching41.twee');
const scriptContent = fs.readFileSync(scriptPath, 'utf8');

// Test the embedded action parsing
console.log('Testing embedded action parsing...');

// Find Eli-Round-3.1
const eliRound31Match = scriptContent.match(/:: Eli-Round-3\.1.*?\n(.*?)(?=\n::|\n$)/s);
if (eliRound31Match) {
  const roundContent = eliRound31Match[1];
  console.log('Eli-Round-3.1 content:');
  console.log(roundContent);
  
  // Test parsing the choices with embedded actions
  const choiceMatches = roundContent.match(/\[\[(.*?)\|(.*?)\]\]/g);
  if (choiceMatches) {
    console.log('\nFound choices:');
    choiceMatches.forEach((choice, index) => {
      console.log(`Choice ${index + 1}: ${choice}`);
      
      // Extract choice text and target
      const match = choice.match(/\[\[(.*?)\|(.*?)\]\]/);
      if (match) {
        const choiceText = match[1];
        const targetRound = match[2];
        
        console.log(`  Choice text: "${choiceText}"`);
        console.log(`  Target round: "${targetRound}"`);
        
        // Check for embedded action
        const actionMatch = choiceText.match(/\[Action:\s*(.*?)\]/);
        if (actionMatch) {
          console.log(`  Embedded action: "${actionMatch[1]}"`);
          
          // Test parsing the action
          const actionText = actionMatch[1].trim();
          const colonIndex = actionText.indexOf(':');
          if (colonIndex !== -1) {
            const actionType = actionText.substring(0, colonIndex).trim();
            const parameters = actionText.substring(colonIndex + 1).trim();
            console.log(`    Action type: "${actionType}"`);
            console.log(`    Parameters: "${parameters}"`);
          }
        } else {
          console.log(`  No embedded action found`);
        }
      }
    });
  }
} else {
  console.log('Eli-Round-3.1 not found in script');
} 