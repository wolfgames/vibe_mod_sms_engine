import { TweeParser } from '../parser/tweeParser';

export async function testParser() {
  console.log('Testing parser with SMS Branching41.twee...');
  
  try {
    // Load the new script
    const response = await fetch('/scripts/SMS Branching41.twee');
    if (!response.ok) {
      throw new Error(`Failed to load script: ${response.statusText}`);
    }
    
    const scriptContent = await response.text();
    
    // Parse the script
    const parser = new TweeParser();
    const parseResult = parser.parseTweeFile(scriptContent);
    
    console.log('=== PARSER TEST RESULTS ===');
    console.log('Game Data:', parseResult.gameData);
    
    // Test specific features
    console.log('\n=== CONTACTS ===');
    Object.entries(parseResult.gameData.contacts).forEach(([name, contact]) => {
      console.log(`Contact: ${name}`);
      console.log(`  Unlocked: ${contact.unlocked}`);
      console.log(`  Rounds: ${Object.keys(contact.rounds).length}`);
      console.log(`  Round keys:`, Object.keys(contact.rounds));
      
      // Test actions in rounds
      Object.entries(contact.rounds).forEach(([roundKey, round]) => {
        console.log(`  Round ${roundKey}:`, round);
        if (round.actions.length > 0) {
          console.log(`    Actions:`, round.actions);
        }
      });
    });
    
    // Specifically check Jamie
    const jamie = parseResult.gameData.contacts['Jamie'];
    if (jamie) {
      console.log('\n=== JAMIE SPECIFIC ===');
      console.log('Jamie rounds:', Object.keys(jamie.rounds));
      console.log('Jamie round 1.0:', jamie.rounds['1.0']);
    }
    
    console.log('\n=== VARIABLES ===');
    console.log('Variables:', parseResult.gameData.variables);
    
    console.log('\n=== ERRORS ===');
    if (parseResult.errors.length > 0) {
      parseResult.errors.forEach(error => {
        console.error('Error:', error);
      });
    } else {
      console.log('No errors found!');
    }
    
    console.log('\n=== WARNINGS ===');
    if (parseResult.warnings.length > 0) {
      parseResult.warnings.forEach(warning => {
        console.warn('Warning:', warning);
      });
    } else {
      console.log('No warnings found!');
    }
    
    // Test specific action types
    console.log('\n=== ACTION TYPE TESTING ===');
    let actionCounts: Record<string, number> = {};
    
    Object.values(parseResult.gameData.contacts).forEach(contact => {
      Object.values(contact.rounds).forEach(round => {
        round.actions.forEach(action => {
          actionCounts[action.type] = (actionCounts[action.type] || 0) + 1;
        });
      });
    });
    
    console.log('Action type counts:', actionCounts);
    
    // Test specific actions
    console.log('\n=== SPECIFIC ACTION TESTS ===');
    Object.values(parseResult.gameData.contacts).forEach(contact => {
      Object.entries(contact.rounds).forEach(([roundKey, round]) => {
        round.actions.forEach(action => {
          console.log(`Action in ${contact.name} Round ${roundKey}:`, action);
        });
      });
    });
    
  } catch (error) {
    console.error('Test failed:', error);
  }
} 