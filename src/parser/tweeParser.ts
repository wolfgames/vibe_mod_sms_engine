import { 
  GameData, 
  Contact, 
  Round, 
  Choice, 
  Action, 
  ParsedPassage, 
  VariableAssignment, 
  ActionDefinition, 
  ParserError, 
  ParserResult 
} from './types';

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
        currentPassage = this.parsePassageHeader(trimmedLine, lineNumber);
      } else if (currentPassage && trimmedLine) {
        // Add content to current passage
        currentPassage.content += (currentPassage.content ? '\n' : '') + line;
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
    // Remove ':: ' prefix
    const content = line.substring(2);
    
    // Split by first space to separate title from tags
    const firstSpaceIndex = content.indexOf(' ');
    let title = content;
    let tags = '';
    let position = '';
    let size = '';

    if (firstSpaceIndex !== -1) {
      title = content.substring(0, firstSpaceIndex);
      const remaining = content.substring(firstSpaceIndex + 1);
      
      // Parse tags and metadata
      const tagMatch = remaining.match(/\[(.*?)\]/);
      if (tagMatch) {
        tags = tagMatch[1];
        const afterTags = remaining.substring(tagMatch.index! + tagMatch[0].length);
        
        // Parse position and size if present
        const metadataMatch = afterTags.match(/\{(.*?)\}/);
        if (metadataMatch) {
          const metadata = metadataMatch[1];
          const positionMatch = metadata.match(/"position":"([^"]+)"/);
          const sizeMatch = metadata.match(/"size":"([^"]+)"/);
          
          if (positionMatch) position = positionMatch[1];
          if (sizeMatch) size = sizeMatch[1];
        }
      }
    }

    return {
      title,
      tags: tags ? tags.split(' ').filter(tag => tag.trim()) : [],
      content: '',
      position: position ? this.parsePosition(position) : undefined,
      size: size ? this.parseSize(size) : undefined
    };
  }

  private parsePosition(positionStr: string): { x: number; y: number } | undefined {
    const parts = positionStr.split(',');
    if (parts.length === 2) {
      const x = parseInt(parts[0]);
      const y = parseInt(parts[1]);
      if (!isNaN(x) && !isNaN(y)) {
        return { x, y };
      }
    }
    return undefined;
  }

  private parseSize(sizeStr: string): { width: number; height: number } | undefined {
    const parts = sizeStr.split(',');
    if (parts.length === 2) {
      const width = parseInt(parts[0]);
      const height = parseInt(parts[1]);
      if (!isNaN(width) && !isNaN(height)) {
        return { width, height };
      }
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
    const startPassage = storyData ? this.parseStoryData(storyData.content) : 'Start';

    // Process each passage
    for (const passage of passages) {
      if (passage.title === 'StoryTitle' || passage.title === 'StoryData') {
        continue;
      }

      // Extract contact information from tags
      const { contactName, roundNumber } = this.extractContactInfo(passage);
      
      if (contactName && roundNumber) {
        const isCharacterStart = passage.tags.includes('character_starts');
        const isPlayerStart = passage.tags.includes('player_starts');
        const isUnlocked = passage.tags.includes('unlocked');

        if (!contacts[contactName]) {
          contacts[contactName] = {
            name: contactName,
            unlocked: isUnlocked || isCharacterStart, // Unlock if explicitly unlocked OR character starts
            playerInitiated: isPlayerStart,
            rounds: {},
            position: passage.position,
            size: passage.size
          };
        } else {
          // Update existing contact's unlocked status if this passage has character_starts
          if (isCharacterStart) {
            contacts[contactName].unlocked = true;
          }
        }

        // Parse variables if this is a starting passage
        if (passage.title === 'Start' || passage.tags.includes('start')) {
          this.parseVariables(passage.content, variables);
          startingPassages.push(passage.title);
        }

        // Parse round content
        const round = this.parseRound(passage);
        if (round) {
          contacts[contactName].rounds[roundNumber] = round;
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
        formatVersion: '3.3.5',
        startPassage
      }
    };
  }

  private extractContactInfo(passage: ParsedPassage): { contactName: string | null; roundNumber: number | null } {
    let contactName: string | null = null;
    let roundNumber: number | null = null;
    
    // First check the passage title for format [ContactName Round-X]
    const titleMatch = passage.title.match(/^([A-Z][a-z]+)\s+Round-(\d+)$/);
    if (titleMatch) {
      contactName = titleMatch[1];
      roundNumber = parseInt(titleMatch[2]);
    }
    
    // Check passage title for "Text ContactName" format (fallback)
    if (!contactName) {
      const textMatch = passage.title.match(/^Text\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)$/);
      if (textMatch) {
        contactName = textMatch[1];
      }
    }
    
    // Check tags for various formats - this takes precedence over title extraction
    for (const tag of passage.tags) {
        // Check if this tag contains both contact name and round number in format [ContactName Round-X]
        const tagMatch = tag.match(/^([A-Z][a-z]+)\s+Round-(\d+)$/);
        if (tagMatch) {
          contactName = tagMatch[1];
          roundNumber = parseInt(tagMatch[2]);
          break;
        }
        
        // Check for format [ContactName player_starts Round-X]
        const playerStartsMatch = tag.match(/^([A-Z][a-z]+)\s+player_starts\s+Round-(\d+)$/);
        if (playerStartsMatch) {
          contactName = playerStartsMatch[1];
          roundNumber = parseInt(playerStartsMatch[2]);
          break;
        }
        
        // Check for format [ContactName player_starts initial_contact Round-X]
        const playerStartsInitialMatch = tag.match(/^([A-Z][a-z]+)\s+player_starts\s+initial_contact\s+Round-(\d+)$/);
        if (playerStartsInitialMatch) {
          contactName = playerStartsInitialMatch[1];
          roundNumber = parseInt(playerStartsInitialMatch[2]);
          break;
        }
        
        // Check for format [ContactName character_starts Round-X]
        const characterStartsMatch = tag.match(/^([A-Z][a-z]+)\s+character_starts\s+Round-(\d+)$/);
        if (characterStartsMatch) {
          contactName = characterStartsMatch[1];
          roundNumber = parseInt(characterStartsMatch[2]);
          break;
        }
        
        // Check for format [ContactName needs_code Round-X]
        const needsCodeMatch = tag.match(/^([A-Z][a-z]+)\s+needs_code\s+Round-(\d+)$/);
        if (needsCodeMatch) {
          contactName = needsCodeMatch[1];
          roundNumber = parseInt(needsCodeMatch[2]);
          break;
        }
        
        // Check if this is a contact name (single word, likely capitalized)
        if (!contactName && /^[A-Z][a-z]+$/.test(tag)) {
          contactName = tag;
        }
        
        // Check if this is a round number
        if (!roundNumber) {
          const roundMatch = tag.match(/^Round-(\d+)$/);
          if (roundMatch) {
            roundNumber = parseInt(roundMatch[1]);
          }
        }
      }
    
    // Fallback: if contactName is still not found, try to infer from tags that are just names
    if (!contactName) {
      for (const tag of passage.tags) {
        if (/^[A-Z][a-z]+$/.test(tag)) { // Simple capitalized word
          contactName = tag;
          break;
        }
      }
    }
    
    // Fallback: if roundNumber is still not found, try to infer from tags that are just round numbers
    if (!roundNumber) {
      for (const tag of passage.tags) {
        const roundMatch = tag.match(/^Round-(\d+)$/);
        if (roundMatch) {
          roundNumber = parseInt(roundMatch[1]);
          break;
        }
      }
    }
    
    return { contactName, roundNumber };
  }

  private parseRound(passage: ParsedPassage): Round | null {
    const choices: Choice[] = [];
    const actions: Action[] = [];

    // Parse choices [[Choice Text]] or [[Choice Text|Target Passage]]
    const choiceRegex = /\[\[([^\]]+)\]\]/g;
    let choiceMatch;
    while ((choiceMatch = choiceRegex.exec(passage.content)) !== null) {
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
    const actionRegex = /\[Action:\s*([^:]+):([^\]]+)\]/g;
    let actionMatch;
    while ((actionMatch = actionRegex.exec(passage.content)) !== null) {
      const actionType = actionMatch[1].trim();
      const parameters = this.parseActionParameters(actionMatch[2]);
      
      actions.push({
        type: actionType,
        parameters
      });
    }

    // Remove choices, actions, and variable assignments from content to get clean passage text
    let cleanContent = passage.content
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
    
    // Handle simple parameter format like "Eli Mercer" (no key:value pairs)
    if (!paramString.includes(':')) {
      // This is a simple value, treat it as contactName
      params.contactName = paramString.trim();
      return params;
    }
    
    // Split by spaces, but respect quoted strings
    const parts = paramString.match(/(?:([^"\s]+)|"([^"]*)")/g) || [];
    
    for (const part of parts) {
      if (part.includes(':')) {
        const [key, value] = part.split(':', 2);
        const cleanKey = key.trim();
        const cleanValue = value.trim().replace(/^"|"$/g, '');
        
        // Try to parse as number or boolean
        if (cleanValue === 'true' || cleanValue === 'false') {
          params[cleanKey] = cleanValue === 'true';
        } else if (!isNaN(Number(cleanValue))) {
          params[cleanKey] = Number(cleanValue);
        } else {
          params[cleanKey] = cleanValue;
        }
      }
    }
    
    return params;
  }

  private parseVariables(content: string, variables: Record<string, any>): void {
    // Parse Harlowe variable assignments: (set: $variableName to value)
    const varRegex = /\(set:\s*\$([^)]+)\s+to\s+([^)]+)\)/g;
    let varMatch;
    
    while ((varMatch = varRegex.exec(content)) !== null) {
      const varName = varMatch[1].trim();
      const value = this.parseVariableValue(varMatch[2].trim());
      variables[varName] = value;
    }
  }

  private parseVariableValue(valueStr: string): any {
    // Handle arrays: (array: "item1", "item2")
    if (valueStr.startsWith('(array:')) {
      const arrayContent = valueStr.substring(7, valueStr.length - 1);
      return arrayContent.split(',').map(item => 
        item.trim().replace(/^"|"$/g, '')
      );
    }
    
    // Handle booleans
    if (valueStr === 'true' || valueStr === 'false') {
      return valueStr === 'true';
    }
    
    // Handle numbers
    if (!isNaN(Number(valueStr))) {
      return Number(valueStr);
    }
    
    // Handle strings (remove quotes)
    return valueStr.replace(/^"|"$/g, '');
  }

  private parseStoryData(content: string): string {
    try {
      const data = JSON.parse(content);
      return data.start || 'Start';
    } catch {
      return 'Start';
    }
  }

  // Hot reloading support
  parseWithHotReload(content: string, previousData?: GameData): ParserResult {
    const result = this.parseTweeFile(content);
    
    if (previousData) {
      // Preserve existing game state if possible
      result.gameData.variables = { ...previousData.variables, ...result.gameData.variables };
    }
    
    return result;
  }
} 