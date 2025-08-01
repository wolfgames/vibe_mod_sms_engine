import { GameData, Contact, Round, Choice, Action, ParsedPassage, ParserError, ParserResult } from './types';

export class TweeParser {
  private errors: ParserError[] = [];
  private warnings: ParserError[] = [];
  private variables: Record<string, any> = {};

  parseTweeFile(content: string): ParserResult {
    this.errors = [];
    this.warnings = [];
    this.variables = {};

    const lines = content.split('\n');
    const passages: ParsedPassage[] = [];
    let currentPassage: ParsedPassage | null = null;
    let lineNumber = 0;

    // First pass: extract variables from all passages
    this.extractVariablesFromAllPassages(lines);

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

  private extractVariablesFromAllPassages(lines: string[]): void {
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Parse Harlowe variable assignments: (set: $var to value)
      const setMatch = trimmedLine.match(/\(set:\s*\$(\w+)\s+to\s+(.+?)\)/);
      if (setMatch) {
        const varName = setMatch[1];
        const varValueStr = setMatch[2].trim();
        
        // Handle special Harlowe values like 'it', 'true', 'false'
        let varValue;
        if (varValueStr === 'it') {
          varValue = 'it';
        } else {
          varValue = this.parseVariableValue(varValueStr);
        }
        
        this.variables[varName] = varValue;
      }
    }
  }

  private parsePassageHeader(line: string, lineNumber: number): ParsedPassage {
    // Format: :: Jamie-Round-1 [initial_contact] {"position":"575,375","size":"100,100"}
    // Also handle metadata passages like :: StoryTitle and :: StoryData
    // Remove carriage return characters that can cause regex to fail
    const cleanLine = line.replace(/\r/g, '');
    const match = cleanLine.match(/^::\s+([^[]+)\s*\[([^\]]+)\]\s*(.*)$/);
    
    if (!match) {
      // Check if this is a metadata passage (no tags)
      const metadataMatch = cleanLine.match(/^::\s+([^\s]+)\s*$/);
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
        message: `Invalid passage header format: "${cleanLine}"`,
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
    const variables: Record<string, any> = { ...this.variables };
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

      // Handle Initial Variables passage
      if (passage.title === 'Initial Variables' || passage.tags.includes('initial_variables')) {
        // Extract variable assignments from this passage
        const lines = passage.content.split('\n');
        for (const line of lines) {
          const trimmedLine = line.trim();
          const setMatch = trimmedLine.match(/\(set:\s*\$(\w+)\s+to\s+(.+?)\)/);
          if (setMatch) {
            const varName = setMatch[1];
            const varValueStr = setMatch[2].trim();
            const varValue = this.parseVariableValue(varValueStr);
            variables[varName] = varValue;
          }
        }
        continue;
      }

      // Extract contact information from passage title (new format)
      const contactInfo = this.extractContactAndRoundInfo(passage.title);
      
      if (contactInfo) {
        const { contactName, roundKey } = contactInfo;
        
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
        if (round && roundKey) {
          contacts[contactName].rounds[roundKey] = round;
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
        startPassage: 'Jamie-Round-1'
      }
    };
  }

  private extractContactAndRoundInfo(title: string): { contactName: string; roundKey: string } | null {
    // Handle format: "ContactName-Round-X.X"
    // "Jamie-Round-1" -> contactName: "Jamie", roundKey: "1"
    // "Jamie-Round-2.1" -> contactName: "Jamie", roundKey: "2.1"
    // "Jamie-Round-1.0" -> contactName: "Jamie", roundKey: "1.0"
    const match = title.match(/^([^-]+)-Round-(\d+(?:\.\d+)?)$/);
    
    if (match) {
      const contactName = match[1].trim();
      const roundKey = match[2];
      
      // Keep the full round number format (e.g., "6.0", "5.1", etc.)
      const finalRoundKey = roundKey;
      
      return { contactName, roundKey: finalRoundKey };
    }
    
    return null;
  }

  private parseRound(passage: ParsedPassage): Round | null {
    const content = passage.content;
    if (!content.trim()) {
      return null;
    }

    // Store the original content with conditionals
    const originalContent = content;

    // First, evaluate conditional content using current variables
    const evaluatedContent = this.evaluateConditionalContent(content, this.variables);
    
    const { passage: passageText, actions, choices } = this.parseRoundContent(evaluatedContent);

    return {
      passage: passageText,
      actions: actions,
      choices: choices,
      originalContent: originalContent
    };
  }

  public parseRoundContent(content: string): { passage: string; actions: Action[]; choices: Choice[] } {
    const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    let passage = '';
    const actions: Action[] = [];
    const choices: Choice[] = [];

    for (const line of lines) {
      // Include conditional lines in passage content so they can be evaluated later
      if (line.startsWith('(if:') || line.startsWith('(else:') || line.startsWith('(endif)') || line.startsWith('(set:')) {
        passage += line + '\n';
        continue;
      }
      
      if (line.startsWith('[Action:')) {
        // Parse standalone action
        const actionText = line.replace('[Action:', '').replace(']', '').trim();
        const action = this.parseAction(actionText);
        if (action) {
          actions.push(action);
        }
      } else if (line.startsWith('[[') && line.endsWith(']]')) {
        // Use a more robust regex that handles commas in choice text
        const choiceMatch = line.match(/\[\[([^|]*)\|([^\]]*)\]\]/);
        if (choiceMatch) {
          const choiceText = choiceMatch[1].trim();
          const targetRound = choiceMatch[2].trim();

          const actionMatch = choiceText.match(/\[Action:\s*(.*?)\]/);
          let cleanChoiceText = choiceText;
          let embeddedAction: Action | null = null;

          if (actionMatch) {
            const actionText = actionMatch[1].trim();
            embeddedAction = this.parseAction(actionText);
            cleanChoiceText = choiceText.replace(/\[Action:\s*.*?\]/, '').trim();
          }

          choices.push({
            text: cleanChoiceText,
            targetRound: targetRound,
            embeddedAction: embeddedAction
          });
        }
      } else {
        passage += line + '\n';
      }
    }

    return { passage: passage.trim(), actions, choices };
  }

  setVariables(variables: Record<string, any>): void {
    this.variables = { ...variables };
  }

  public evaluateConditionalContent(content: string, variables: Record<string, any>): string {
    if (!content || typeof content !== 'string') {
      return content || '';
    }

    let result = content;
    const lines = result.split('\n');
    const processedLines: string[] = [];
    let inConditionalBlock = false;
    let currentCondition = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      // Check for conditional start
      const ifMatch = trimmedLine.match(/^\(if:\s*\$(\w+)\s+is\s+(true|false)\)/);
      if (ifMatch) {
        const varName = ifMatch[1];
        const expectedValue = ifMatch[2] === 'true';
        const actualValue = variables[varName] === true;
        currentCondition = actualValue === expectedValue;
        inConditionalBlock = true;
        continue;
      }

      // Check for else
      if (trimmedLine === '(else:)') {
        currentCondition = !currentCondition;
        continue;
      }

      // Check for endif
      if (trimmedLine === '(endif)') {
        inConditionalBlock = false;
        currentCondition = false;
        continue;
      }

      // Check for set statements
      const setMatch = trimmedLine.match(/^\(set:\s*\$(\w+)\s+to\s+(.+)\)/);
      if (setMatch) {
        const varName = setMatch[1];
        const value = setMatch[2].trim();
        
        // Convert string values to appropriate types
        let parsedValue: any = value;
        if (value === 'true') parsedValue = true;
        else if (value === 'false') parsedValue = false;
        else if (!isNaN(Number(value))) parsedValue = Number(value);
        
        variables[varName] = parsedValue;
        continue;
      }

      // Check if this line starts a new conditional block (which closes the previous one)
      const nextIfMatch = trimmedLine.match(/^\(if:\s*\$(\w+)\s+is\s+(true|false)\)/);
      if (nextIfMatch && inConditionalBlock) {
        // We're starting a new conditional block, so close the current one
        inConditionalBlock = false;
        currentCondition = false;
        
        // Now process this new conditional
        const varName = nextIfMatch[1];
        const expectedValue = nextIfMatch[2] === 'true';
        const actualValue = variables[varName] === true;
        currentCondition = actualValue === expectedValue;
        inConditionalBlock = true;
        continue;
      }

      // Include line if not in conditional block or if condition is true
      if (!inConditionalBlock || currentCondition) {
        processedLines.push(line);
      }
    }

    return processedLines.join('\n');
  }

  private parseAction(actionText: string): Action | null {
    // Parse action in format: "action_type:parameters" or just "action_type" for actions without parameters
    const colonIndex = actionText.indexOf(':');
    
    let actionType: string;
    let parameters: string;
    
    if (colonIndex === -1) {
      // No parameters - entire text is the action type
      actionType = actionText.trim();
      parameters = '';
    } else {
      // Has parameters
      actionType = actionText.substring(0, colonIndex).trim();
      parameters = actionText.substring(colonIndex + 1).trim();
    }
    
    return this.parseActionWithParameters(actionType, parameters);
  }

  private parseActionWithParameters(actionType: string, parameters: string): Action | null {
    const params: Record<string, string | number | boolean> = {};
    
    // NEW: Extract delay parameter from all actions
    let delay = 0;
    const delayMatch = parameters.match(/delay:\s*(\d+)/);
    if (delayMatch) {
      delay = parseInt(delayMatch[1]);
      // Remove delay from parameters string for further parsing
      parameters = parameters.replace(/delay:\s*\d+/, '').trim();
    }
    
    switch (actionType) {
      case 'unlock_contact':
        // Parse comma-separated format: character
        const unlockParts = parameters.split(',').map(p => p.trim());
        let character = unlockParts[0] || 'Maya';
        
        if (character.startsWith('$')) {
          params.variable_ref = character;
        } else {
          params.contactName = character;
        }
        params.delay = delay;
        break;
      
      case 'drop_pin':
        // Parse comma-separated format: location, description, file, character
        const parts = parameters.split(',').map(p => p.trim());
        
        let location = 'Freight Warehouse District';
        let description = 'An old warehouse by the train tracks';
        let file = 'Map.png';
        let dropPinCharacter = undefined;
        
        if (parts.length >= 1) location = parts[0];
        if (parts.length >= 2) description = parts[1];
        if (parts.length >= 3) file = parts[2];
        if (parts.length >= 4) dropPinCharacter = parts[3];
        
        params.location = location;
        params.description = description;
        params.file = file;
        if (dropPinCharacter) params.character = dropPinCharacter;
        params.delay = delay;
        break;
      
      case 'send_photo':
        // Parse named parameter format: file: "filename" caption: "caption"
        let photoFile = 'front_door.png';
        let photoCaption = 'Front door with padlock';
        
        // Extract file parameter
        const fileMatch = parameters.match(/file:\s*"([^"]+)"/);
        if (fileMatch) {
          photoFile = fileMatch[1];
        }
        
        // Extract caption parameter
        const captionMatch = parameters.match(/caption:\s*"([^"]+)"/);
        if (captionMatch) {
          photoCaption = captionMatch[1];
        }
        
        params.file = photoFile;
        params.caption = photoCaption;
        params.delay = delay;
        break;
      
      case 'send_video':
        // Parse named parameter format: file: "filename" caption: "caption"
        let videoFile = 'inside_warehouse.png';
        let videoCaption = 'Inside the warehouse';
        
        // Extract file parameter
        const videoFileMatch = parameters.match(/file:\s*"([^"]+)"/);
        if (videoFileMatch) {
          videoFile = videoFileMatch[1];
        }
        
        // Extract caption parameter
        const videoCaptionMatch = parameters.match(/caption:\s*"([^"]+)"/);
        if (videoCaptionMatch) {
          videoCaption = videoCaptionMatch[1];
        }
        
        params.file = videoFile;
        params.caption = videoCaption;
        params.delay = delay;
        break;
      
      case 'end_thread':
        // Parse optional parameter: 0 = do not show message, 1 (or omitted) = show message
        let showMessage = true;
        if (parameters === '0') showMessage = false;
        params.showMessage = showMessage;
        params.delay = delay;
        break;
      
      case 'call_911':
        // No parameters needed
        params.delay = delay;
        break;
      
      case 'add_chat_history':
        // Parse format: contact: "message1|message2" player: "response1|response2"
        const contactMatch = parameters.match(/contact:\s*"([^"]+)"/);
        const playerMatch = parameters.match(/player:\s*"([^"]+)"/);
        
        if (contactMatch) {
          params.contact = contactMatch[1];
        }
        if (playerMatch) {
          params.player = playerMatch[1];
        }
        params.delay = delay;
        break;
      
      case 'open_thread':
        const openMatch = parameters.match(/character:\s*"([^"]+)"/);
        const threadMatch = parameters.match(/thread_id:\s*"([^"]+)"/);
        if (openMatch) params.character = openMatch[1];
        if (threadMatch) params.thread_id = threadMatch[1];
        params.delay = delay;
        break;
      
      case 'delayed_message':
        // Support both named and comma-separated (delay, message) formats
        let messageDelay = 3500; // default
        let message = 'This is a delayed message.'; // default
        
        // Try named parameters first
        const messageDelayMatch = parameters.match(/delay:\s*(\d+)/);
        if (messageDelayMatch) {
          messageDelay = parseInt(messageDelayMatch[1]);
        }
        const messageMatch = parameters.match(/message:\s*"([^"]+)"/);
        if (messageMatch) {
          message = messageMatch[1];
        }
        // If not found, try the format: 1000 message: "text" (delay first, then message)
        if (!messageDelayMatch && !messageMatch) {
          const delayFirstMatch = parameters.match(/^(\d+)\s+message:\s*"([^"]+)"/);
          if (delayFirstMatch) {
            messageDelay = parseInt(delayFirstMatch[1]);
            message = delayFirstMatch[2];
          } else {
            // Fallback to comma-separated
            const delayedParts = parameters.split(',').map(p => p.trim());
            if (delayedParts.length >= 1) messageDelay = parseInt(delayedParts[0]);
            if (delayedParts.length >= 2) message = delayedParts[1];
          }
        }
        params.delay = messageDelay;
        params.message = message;
        break;
      
      case 'set_variable':
        // Parse format: variableName,value
        const varParts = parameters.split(',').map(p => p.trim());
        if (varParts.length >= 2) {
          const varName = varParts[0];
          const varValue = this.parseVariableValue(varParts[1]);
          params.variableName = varName;
          params.variableValue = varValue;
        }
        params.delay = delay;
        break;
      
      case 'trigger_eli_needs_code':
        // No parameters needed
        params.delay = delay;
        break;
      
      case 'typing_indicator':
        const duration = parameters.match(/duration:\s*(\d+)/);
        if (duration) {
          params.duration = parseInt(duration[1]);
        } else {
          params.duration = 1000; // default
        }
        params.delay = delay;
        break;
      
      case 'set_typing_delay':
        const typingDelay = parameters.match(/delay:\s*(\d+)/);
        if (typingDelay) {
          params.delay = parseInt(typingDelay[1]);
        } else {
          params.delay = 1000; // default
        }
        break;
      
      case 'show_notification':
        const titleMatch = parameters.match(/title:\s*"([^"]+)"/);
        const bodyMatch = parameters.match(/body:\s*"([^"]+)"/);
        if (titleMatch) params.title = titleMatch[1];
        if (bodyMatch) params.body = bodyMatch[1];
        params.delay = delay;
        break;
      
      case 'vibrate':
        const patternMatch = parameters.match(/pattern:\s*"([^"]+)"/);
        if (patternMatch) {
          params.pattern = patternMatch[1];
        } else {
          params.pattern = 'default';
        }
        params.delay = delay;
        break;
      
      case 'set_contact_status':
        // TODO: Implement contact status parameters
        params.delay = delay;
        break;
      
      case 'trigger_emergency_call':
        // No parameters needed
        params.delay = delay;
        break;
      
      default:
        return null;
    }
    
    return {
      type: actionType as any,
      parameters: params
    };
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