import { TweeParser } from '../parser/tweeParser';
import { ParserResult } from '../parser/types';
import { GameData } from '../parser/types';

export class ScriptLoader {
  private parser: TweeParser;
  private currentScript: string | null = null;
  private scriptContent: string | null = null;

  constructor() {
    this.parser = new TweeParser();
  }

  async loadScript(scriptName: string): Promise<ParserResult> {
    try {
      const response = await fetch(`/scripts/${scriptName}`);
      if (!response.ok) {
        throw new Error(`Failed to load script: ${response.statusText}`);
      }
      
      const content = await response.text();
      this.currentScript = scriptName;
      this.scriptContent = content;
      
      return this.parser.parseTweeFile(content);
    } catch (error) {
      console.error('Error loading script:', error);
      throw error;
    }
  }

  async reloadScript(): Promise<ParserResult> {
    if (!this.currentScript) {
      throw new Error('No script currently loaded');
    }
    
    return this.loadScript(this.currentScript);
  }

  getCurrentScriptName(): string | null {
    return this.currentScript;
  }

  getCurrentScriptContent(): string | null {
    return this.scriptContent;
  }

  parseContent(content: string): ParserResult {
    return this.parser.parseTweeFile(content);
  }

  // Hot reloading support
  parseWithHotReload(content: string, previousData?: GameData): ParserResult {
    return this.parser.parseWithHotReload(content, previousData);
  }
} 