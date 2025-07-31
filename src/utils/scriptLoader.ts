import { TweeParser } from '../parser/tweeParser';

export async function loadScript(scriptName: string = 'SMS Branching40_New_test1.twee'): Promise<any> {
  try {
    const response = await fetch(`/scripts/${scriptName}`);
    const content = await response.text();
    
    const parser = new TweeParser();
    const result = parser.parseTweeFile(content);
    
    if (result.errors.length > 0) {
      console.error('Parser errors:', result.errors);
      throw new Error('Failed to parse script');
    }
    
    return result.gameData;
  } catch (error) {
    console.error('Error loading script:', error);
    throw error;
  }
} 