import { GameData, Contact, Round, Choice, Action, ParsedPassage, ParserError, ParserResult } from './types';

export class TweeParser {
  private errors: ParserError[] = [];
  private warnings: ParserError[] = [];

  parseTweeFile(content: string): ParserResult {
    this.errors = [];
    this.warnings = [];

    const lines = content.split('\n');
    const passages: ParsedPassage[] = [];
    let currentPassage: ParsedPassage | null = null;
    let lineNumber = 0;

    for (const line of lines) {
      lineNumber++;
      const trimmedLine = line.trim();

      if (trimmedLine.startsWith('::')) {
        // Save previous passage if exists
        if (currentPassage) {
          passages.push(currentPassage);
        }

        // Parse new passage header
        currentPassage = this.parsePassageHeader(line, lineNumber);
      } else if (currentPassage && trimmedLine) {
        // Add content to current passage
        currentPassage.content += line + '\n';
      }
    }

    // Add the last passage
    if (currentPassage) {
      passages.push(currentPassage);
    }

    // Convert passages to game data
    const gameData = this.convertPassagesToGameData(passages);

    return {
      gameData,
      errors: this.errors,
      warnings: this.warnings
    };
  }

  private parsePassageHeader(line: string, lineNumber: number): ParsedPassage {
    // Format: :: Round-1 [Jamie initial_contact] {"position":"575,375","size":"100,100"}
    // Also handle metadata passages like :: StoryTitle and :: StoryData
    const match = line.match(/^::\s+([^[]+)\s*\[([^\]]+)\]\s*(.*)$/);
    
    if (!match) {
      // Check if this is a metadata passage (no tags)
      const metadataMatch = line.match(/^::\s+([^\s]+)\s*$/);
      if (metadataMatch) {
        return {
          title: metadataMatch[1].trim(),
          content: '',
          tags: [],
          position: undefined,
          size: undefined
        };
      }
      
      this.errors.push({
        message: `Invalid passage header format: ${line}`,
        type: 'syntax',
        lineNumber
      });
      return {
        title: 'Unknown',
        content: '',
        tags: [],
        position: undefined,
        size: undefined
      };
    }

    const title = match[1].trim();
    const tags = match[2].split(/\s+/).map(tag => tag.trim()).filter(tag => tag.length > 0);
    

    
    // Parse position and size from JSON
    let position: { x: number; y: number } | undefined;
    let size: { width: number; height: number } | undefined;
    
    // Parse position and size from JSON - handle the entire JSON object
    const jsonMatch = match[3].match(/\{.*\}/);
    if (jsonMatch) {
      try {
        const jsonData = JSON.parse(jsonMatch[0]);
        position = this.parsePosition(jsonData.position);
        size = this.parseSize(jsonData.size);
      } catch (error) {
        this.warnings.push({
          message: `Failed to parse JSON data: ${match[3]}`,
          type: 'syntax',
          lineNumber
        });
      }
    }

    return {
      title,
      content: '',
      tags,
      position,
      size
    };
  }

  private parsePosition(positionStr: string): { x: number; y: number } | undefined {
    if (!positionStr) return undefined;
    const coords = positionStr.split(',').map(s => parseInt(s.trim()));
    if (coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
      return { x: coords[0], y: coords[1] };
    }
    return undefined;
  }

  private parseSize(sizeStr: string): { width: number; height: number } | undefined {
    if (!sizeStr) return undefined;
    const dimensions = sizeStr.split(',').map(s => parseInt(s.trim()));
    if (dimensions.length === 2 && !isNaN(dimensions[0]) && !isNaN(dimensions[1])) {
      return { width: dimensions[0], height: dimensions[1] };
    }
    return undefined;
  }

  private convertPassagesToGameData(passages: ParsedPassage[]): GameData {
    const contacts: Record<string, Contact> = {};
    const variables: Record<string, any> = {};
    const startingPassages: string[] = [];
    const conditions: Record<string, string> = {};

    // Find metadata passages
    const storyTitle = passages.find(p => p.title === 'StoryTitle')?.content || 'SMS Game';
    const storyData = passages.find(p => p.title === 'StoryData');

    // Process each passage
    for (const passage of passages) {
      if (passage.title === 'StoryTitle' || passage.title === 'StoryData') {
        continue;
      }

      // Extract contact information from tags
      const contactName = this.extractContactName(passage);
      
      if (contactName) {
        // Check if this is an initial contact (has 'initial_contact' tag)
        const isInitialContact = passage.tags.includes('initial_contact');
        const isUnlocked = isInitialContact || passage.tags.includes('unlocked');



        if (!contacts[contactName]) {
          contacts[contactName] = {
            name: contactName,
            unlocked: isUnlocked,
            playerInitiated: false,
            rounds: {},
            position: passage.position,
            size: passage.size
          };
        } else {
          // Update existing contact's unlocked status if this is initial contact
          if (isInitialContact) {
            contacts[contactName].unlocked = true;
          }
        }

        // Parse round content
        const round = this.parseRound(passage);
        if (round) {
          // Extract round number from title (e.g., "Round-1" -> 1, "Round-2.1" -> 2.1)
          const roundMatch = passage.title.match(/Round-(\d+(?:\.\d+)?)/);
          if (roundMatch) {
            const roundKey = roundMatch[1];
            contacts[contactName].rounds[roundKey] = round;
          }
        }
      }
    }

    return {
      contacts,
      variables,
      gameFlow: {
        startingPassages,
        conditions
      },
      metadata: {
        title: storyTitle,
        format: 'Harlowe',
        formatVersion: '3.3.9',
        startPassage: 'Round-1'
      }
    };
  }

  private extractContactName(passage: ParsedPassage): string | null {
    // Look for contact name in tags
    for (const tag of passage.tags) {
      // Skip special tags
      if (tag === 'initial_contact' || tag === 'unlocked') {
        continue;
      }
      // Return the first non-special tag as the contact name
      return tag;
    }
    return null;
  }

  private parseRound(passage: ParsedPassage): Round | null {
    if (!passage.content.trim()) {
      return null;
    }

    const { passage: responseText, choices, actions } = this.parseRoundContent(passage.content);

    return {
      passage: responseText,
      choices,
      actions
    };
  }

  private parseRoundContent(content: string): { passage: string; choices: Choice[]; actions: Action[] } {
    const choices: Choice[] = [];
    const actions: Action[] = [];

    // Parse choices [[Choice Text|Target Round]]
    const choiceRegex = /\[\[([^\]]+)\]\]/g;
    let choiceMatch;
    while ((choiceMatch = choiceRegex.exec(content)) !== null) {
      const choiceText = choiceMatch[1].trim();
      let targetPassage = choiceText;
      let displayText = choiceText;
      
      // Check if there's a pipe separator for target passage
      if (choiceText.includes('|')) {
        const parts = choiceText.split('|');
        displayText = parts[0].trim();
        targetPassage = parts[1].trim();
      }
      
      choices.push({
        text: displayText,
        targetPassage,
        displayText: undefined
      });
    }

    // Parse actions [Action: action_type:parameters]
    // Fixed regex to handle action types with underscores and other characters
    const actionRegex = /\[Action:\s*([^:\]]+):\s*([^\]]+)\]/g;
    let actionMatch;
    while ((actionMatch = actionRegex.exec(content)) !== null) {
      const actionType = actionMatch[1].trim();
      const parameters = this.parseActionParameters(actionMatch[2]);
      
      actions.push({
        type: actionType as any,
        parameters
      });
    }

    // Remove choices, actions, and variable assignments from content to get clean passage text
    let cleanContent = content
      .replace(/\[\[[^\]]+\]\]/g, '')
      .replace(/\[Action:[^\]]+\]/g, '')
      .replace(/\(set:\s*\$[^)]+\s+to\s+[^)]+\)/g, '') // Remove Harlowe variable assignments
      .trim();

    return {
      passage: cleanContent,
      choices,
      actions
    };
  }

  private parseActionParameters(paramString: string): Record<string, string | number | boolean> {
    const params: Record<string, string | number | boolean> = {};
    
    // Handle simple parameter format like "Maya Delgado" (no key:value pairs)
    if (!paramString.includes(':')) {
      // Check if it's a number
      const numValue = parseInt(paramString.trim());
      if (!isNaN(numValue)) {
        params.value = numValue;
      } else {
        // This is a simple value, treat it as contactName
        params.contactName = paramString.trim();
      }
      return params;
    }
    
    // Handle named parameter format: file: "filename" caption: "caption" delay: number
    // Extract file parameter
    const fileMatch = paramString.match(/file:\s*"([^"]+)"/);
    if (fileMatch) {
      params.file = fileMatch[1];
    }
    
    // Extract caption parameter
    const captionMatch = paramString.match(/caption:\s*"([^"]+)"/);
    if (captionMatch) {
      params.caption = captionMatch[1];
    }
    
    // Extract delay parameter
    const delayMatch = paramString.match(/delay:\s*(\d+)/);
    if (delayMatch) {
      params.delay = parseInt(delayMatch[1]);
    }
    
    // Extract message parameter
    const messageMatch = paramString.match(/message:\s*"([^"]+)"/);
    if (messageMatch) {
      params.message = messageMatch[1];
    }
    
    // Extract character parameter
    const characterMatch = paramString.match(/character:\s*"([^"]+)"/);
    if (characterMatch) {
      params.character = characterMatch[1];
    }
    
    // Extract thread_id parameter
    const threadIdMatch = paramString.match(/thread_id:\s*"([^"]+)"/);
    if (threadIdMatch) {
      params.thread_id = threadIdMatch[1];
    }
    
    // Handle comma-separated format for unlock_contact: "Maya Delgado"
    const commaMatch = paramString.match(/^"([^"]+)"$/);
    if (commaMatch) {
      params.contactName = commaMatch[1];
    }
    
    return params;
  }

  private parseVariables(content: string, variables: Record<string, any>): void {
    // Parse Harlowe variable assignments: (set: $var to value)
    const varRegex = /\(set:\s*\$([^)]+)\s+to\s+([^)]+)\)/g;
    let match;
    while ((match = varRegex.exec(content)) !== null) {
      const varName = match[1].trim();
      const varValue = this.parseVariableValue(match[2].trim());
      variables[varName] = varValue;
    }
  }

  private parseVariableValue(valueStr: string): any {
    // Try to parse as number
    if (!isNaN(Number(valueStr))) {
      return Number(valueStr);
    }
    
    // Try to parse as boolean
    if (valueStr === 'true' || valueStr === 'false') {
      return valueStr === 'true';
    }
    
    // Remove quotes if present
    if (valueStr.startsWith('"') && valueStr.endsWith('"')) {
      return valueStr.slice(1, -1);
    }
    
    return valueStr;
  }

  private parseStoryData(content: string): string {
    try {
      const data = JSON.parse(content);
      return data.start || 'Start';
    } catch (error) {
      return 'Start';
    }
  }

  parseWithHotReload(content: string, previousData?: GameData): ParserResult {
    return this.parseTweeFile(content);
  }
} 