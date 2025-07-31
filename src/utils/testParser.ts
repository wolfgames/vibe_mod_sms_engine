import { TweeParser } from '../parser/tweeParser';

export async function testParser() {
  try {
    const response = await fetch('/scripts/SMS Branching40_New_test1.twee');
    const content = await response.text();
    
    const parser = new TweeParser();
    const result = parser.parseTweeFile(content);
    
    
  
  if (result.errors.length === 0) {
    // Contacts found successfully
  } else {
      console.error('Parser failed:', result.errors);
    }
  } catch (error) {
    console.error('Test failed:', error);
  }
} 