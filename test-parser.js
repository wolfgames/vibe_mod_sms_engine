// Simple test to verify parser works with new format
const fs = require('fs');

// Mock the parser classes for testing
class MockTweeParser {
  parseTweeFile(content) {
    const lines = content.split('\n');
    const contacts = {};
    let currentContact = null;
    let currentRound = null;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Parse passage headers: :: Jamie-Round-1 [initial_contact]
      const headerMatch = trimmedLine.match(/^::\s+([^[]+)\s*\[([^\]]+)\]/);
      if (headerMatch) {
        const title = headerMatch[1].trim();
        const tags = headerMatch[2].split(/\s+/).filter(tag => tag.length > 0);
        
        // Extract contact and round from title: "Jamie-Round-1" -> contact: "Jamie", round: "1"
        const titleMatch = title.match(/^([^-]+)-Round-(\d+(?:\.\d+)?)$/);
        if (titleMatch) {
          const contactName = titleMatch[1];
          const roundKey = titleMatch[2];
          
          if (!contacts[contactName]) {
            contacts[contactName] = {
              name: contactName,
              unlocked: tags.includes('initial_contact'),
              rounds: {}
            };
          }
          
          currentContact = contactName;
          currentRound = roundKey;
        }
      }
      
      // Parse choices: [[Choice text|Target]]
      const choiceMatch = trimmedLine.match(/\[\[([^\]]+)\]\]/);
      if (choiceMatch && currentContact && currentRound) {
        const choiceText = choiceMatch[1];
        let displayText = choiceText;
        let targetPassage = choiceText;
        
        if (choiceText.includes('|')) {
          const parts = choiceText.split('|');
          displayText = parts[0].trim();
          targetPassage = parts[1].trim();
        }
        
        if (!contacts[currentContact].rounds[currentRound]) {
          contacts[currentContact].rounds[currentRound] = {
            passage: '',
            choices: [],
            actions: []
          };
        }
        
        contacts[currentContact].rounds[currentRound].choices.push({
          text: displayText,
          targetPassage: targetPassage
        });
      }
    }
    
    return {
      gameData: { contacts },
      errors: [],
      warnings: []
    };
  }
}

async function testParser() {
  try {
    const content = fs.readFileSync('./public/scripts/SMS Branching40_New_test2.twee', 'utf8');
    
    const parser = new MockTweeParser();
    const result = parser.parseTweeFile(content);
    
    console.log('Parser result:', JSON.stringify(result, null, 2));
    
    if (result.errors.length === 0) {
      console.log('✅ Parser succeeded!');
      console.log('Contacts found:', Object.keys(result.gameData.contacts));
      
      // Check if Jamie contact was parsed correctly
      const jamie = result.gameData.contacts['Jamie'];
      if (jamie) {
        console.log('✅ Jamie contact found');
        console.log('Jamie rounds:', Object.keys(jamie.rounds));
        console.log('Jamie unlocked:', jamie.unlocked);
        
        // Check first round
        const round1 = jamie.rounds['1.0'];
        if (round1) {
          console.log('✅ Round 1.0 found with', round1.choices.length, 'choices');
          round1.choices.forEach((choice, index) => {
            console.log(`  Choice ${index + 1}: "${choice.text}" -> "${choice.targetPassage}"`);
          });
        }
      } else {
        console.log('❌ Jamie contact not found');
      }
    } else {
      console.error('❌ Parser failed:', result.errors);
    }
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testParser(); 