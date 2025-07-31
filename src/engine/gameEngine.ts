import { GameData, Contact, Round, Action } from '../parser/types';

export interface GameState {
  currentRounds: Record<string, number>;
  variables: Record<string, any>;
  threadStates: Record<string, 'active' | 'locked' | 'ended'>;
  messageHistory: Record<string, Message[]>;
  unlockedContacts: Set<string>;
  messageQueue: QueuedMessage[];
  typingDelays: Record<string, number>;
  gameStartTime: number;
}

export interface Message {
  id: string;
  contactName: string;
  text: string;
  timestamp: number;
  isFromPlayer: boolean;
  type: 'text' | 'photo' | 'video' | 'location' | 'typing';
  mediaUrl?: string;
  caption?: string;
  location?: {
    name: string;
    description: string;
    mapFile?: string;
  };
  read: boolean;
}

export interface QueuedMessage {
  id: string;
  contactName: string;
  message: Message;
  delay: number;
  scheduledTime: number;
}

export interface GameEngineEvents {
  onMessageAdded: (message: Message) => void;
  onContactUnlocked: (contactName: string) => void;
  onThreadStateChanged: (contactName: string, state: 'active' | 'locked' | 'ended') => void;
  onVariableChanged: (variableName: string, value: any) => void;
  onActionExecuted: (action: Action) => void;
}

export class GameEngine {
  private state: GameState;
  private gameData: GameData;
  private events: GameEngineEvents;
  private messageQueueTimer: NodeJS.Timeout | null = null;

  constructor(gameData: GameData, events: GameEngineEvents) {
    this.gameData = gameData;
    this.events = events;
    this.state = this.initializeState();
    this.loadGameState();
  }

  private initializeState(): GameState {
    // Initialize contacts that should start unlocked
    const initiallyUnlocked = new Set<string>();
    for (const [contactName, contact] of Object.entries(this.gameData.contacts)) {
      if (contact.unlocked) {
        initiallyUnlocked.add(contactName);
      }
    }

    return {
      currentRounds: {},
      variables: { ...this.gameData.variables },
      threadStates: {},
      messageHistory: {},
      unlockedContacts: initiallyUnlocked,
      messageQueue: [],
      typingDelays: {},
      gameStartTime: Date.now()
    };
  }

  // Core game functions
  processChoice(contactName: string, choiceIndex: number): boolean {
    const contact = this.gameData.contacts[contactName];
    if (!contact) return false;

    const currentRound = this.state.currentRounds[contactName] || 1;
    const round = contact.rounds[currentRound];
    if (!round || choiceIndex >= round.choices.length) return false;

    const choice = round.choices[choiceIndex];
    
    // Add player message to history
    this.addMessage(contactName, choice.text, true);

    // Execute actions for this round
    this.executeActions(round.actions);

    // Move to next round
    this.state.currentRounds[contactName] = currentRound + 1;

    // Check if there's a next round
    const nextRound = contact.rounds[currentRound + 1];
    if (nextRound) {
      // Add contact's response
      this.addMessage(contactName, nextRound.passage, false);
      
      // Execute actions for next round
      this.executeActions(nextRound.actions);
    } else {
      // End thread if no more rounds
      this.state.threadStates[contactName] = 'ended';
      this.events.onThreadStateChanged(contactName, 'ended');
    }

    this.saveGameState();
    return true;
  }

  evaluateConditions(contactName: string): boolean {
    const contact = this.gameData.contacts[contactName];
    if (!contact) return false;

    const currentRound = this.state.currentRounds[contactName] || 1;
    const round = contact.rounds[currentRound];
    if (!round) return false;

    // For now, simple condition evaluation
    // TODO: Implement complex Harlowe-style condition parsing
    return true;
  }

  executeActions(actions: Action[]): void {
    for (const action of actions) {
      this.executeAction(action);
    }
  }

  private executeAction(action: Action): void {
    this.events.onActionExecuted(action);

    switch (action.type) {
      case 'unlock_contact':
        this.unlockContact(action.parameters.contactName as string);
        break;
      
      case 'end_thread':
        const contactName = this.getCurrentContactFromAction(action);
        if (contactName) {
          this.state.threadStates[contactName] = 'locked';
          this.events.onThreadStateChanged(contactName, 'locked');
        }
        break;
      
      case 'delayed_message':
        this.queueDelayedMessage(action);
        break;
      
      case 'send_photo':
        this.queuePhotoMessage(action);
        break;
      
      case 'send_video':
        this.queueVideoMessage(action);
        break;
      
      case 'drop_pin':
        this.queueLocationMessage(action);
        break;
      
      case 'typing_indicator':
        this.queueTypingIndicator(action);
        break;
      
      case 'set_typing_delay':
        this.setTypingDelay(action);
        break;
      
      case 'mark_read':
        this.markConversationRead(action.parameters.contactName as string);
        break;
      
      case 'notification':
        this.showNotification(action);
        break;
      
      case 'vibrate':
        this.vibrate(action.parameters.pattern as string);
        break;
      
      case 'set_contact_status':
        this.setContactStatus(action);
        break;
      
      case 'call_911':
        this.triggerEmergencyCall();
        break;
    }
  }

  private getCurrentContactFromAction(action: Action): string | null {
    // Try to determine which contact this action belongs to
    // This is a simplified approach - in practice, we'd need more context
    for (const [contactName, contact] of Object.entries(this.gameData.contacts)) {
      if (this.state.currentRounds[contactName]) {
        return contactName;
      }
    }
    return null;
  }

  private unlockContact(contactName: string): void {
    this.state.unlockedContacts.add(contactName);
    this.events.onContactUnlocked(contactName);
  }

  private queueDelayedMessage(action: Action): void {
    const delay = action.parameters.delay as number || 0;
    const message = action.parameters.message as string;
    const contactName = this.getCurrentContactFromAction(action) || 'Unknown';
    
    const queuedMessage: QueuedMessage = {
      id: `msg_${Date.now()}_${Math.random()}`,
      contactName,
      message: {
        id: `msg_${Date.now()}_${Math.random()}`,
        contactName,
        text: message,
        timestamp: Date.now() + delay,
        isFromPlayer: false,
        type: 'text',
        read: false
      },
      delay,
      scheduledTime: Date.now() + delay
    };

    this.state.messageQueue.push(queuedMessage);
    this.sortMessageQueue();
    this.processMessageQueue();
  }

  private queuePhotoMessage(action: Action): void {
    const delay = action.parameters.delay as number || 0;
    const file = action.parameters.file as string;
    const caption = action.parameters.caption as string;
    const contactName = this.getCurrentContactFromAction(action) || 'Unknown';
    
    const queuedMessage: QueuedMessage = {
      id: `photo_${Date.now()}_${Math.random()}`,
      contactName,
      message: {
        id: `photo_${Date.now()}_${Math.random()}`,
        contactName,
        text: caption || '',
        timestamp: Date.now() + delay,
        isFromPlayer: false,
        type: 'photo',
        mediaUrl: `/assets/images/${file}`,
        caption,
        read: false
      },
      delay,
      scheduledTime: Date.now() + delay
    };

    this.state.messageQueue.push(queuedMessage);
    this.sortMessageQueue();
    this.processMessageQueue();
  }

  private queueVideoMessage(action: Action): void {
    const delay = action.parameters.delay as number || 0;
    const file = action.parameters.file as string;
    const caption = action.parameters.caption as string;
    const contactName = this.getCurrentContactFromAction(action) || 'Unknown';
    
    const queuedMessage: QueuedMessage = {
      id: `video_${Date.now()}_${Math.random()}`,
      contactName,
      message: {
        id: `video_${Date.now()}_${Math.random()}`,
        contactName,
        text: caption || '',
        timestamp: Date.now() + delay,
        isFromPlayer: false,
        type: 'video',
        mediaUrl: `/assets/videos/${file}`,
        caption,
        read: false
      },
      delay,
      scheduledTime: Date.now() + delay
    };

    this.state.messageQueue.push(queuedMessage);
    this.sortMessageQueue();
    this.processMessageQueue();
  }

  private queueLocationMessage(action: Action): void {
    const delay = action.parameters.delay as number || 0;
    const location = action.parameters.location as string;
    const description = action.parameters.description as string;
    const mapFile = action.parameters.mapfile as string;
    const contactName = this.getCurrentContactFromAction(action) || 'Unknown';
    
    const queuedMessage: QueuedMessage = {
      id: `location_${Date.now()}_${Math.random()}`,
      contactName,
      message: {
        id: `location_${Date.now()}_${Math.random()}`,
        contactName,
        text: description || '',
        timestamp: Date.now() + delay,
        isFromPlayer: false,
        type: 'location',
        location: {
          name: location,
          description,
          mapFile: mapFile ? `/assets/images/${mapFile}` : undefined
        },
        read: false
      },
      delay,
      scheduledTime: Date.now() + delay
    };

    this.state.messageQueue.push(queuedMessage);
    this.sortMessageQueue();
    this.processMessageQueue();
  }

  private queueTypingIndicator(action: Action): void {
    const duration = action.parameters.duration as number || 1000;
    const contactName = this.getCurrentContactFromAction(action) || 'Unknown';
    
    const queuedMessage: QueuedMessage = {
      id: `typing_${Date.now()}_${Math.random()}`,
      contactName,
      message: {
        id: `typing_${Date.now()}_${Math.random()}`,
        contactName,
        text: '',
        timestamp: Date.now() + duration,
        isFromPlayer: false,
        type: 'typing',
        read: false
      },
      delay: duration,
      scheduledTime: Date.now() + duration
    };

    this.state.messageQueue.push(queuedMessage);
    this.sortMessageQueue();
    this.processMessageQueue();
  }

  private setTypingDelay(action: Action): void {
    const delay = action.parameters.delay as number || 1000;
    // Set global typing delay
    this.state.typingDelays.global = delay;
  }

  private markConversationRead(contactName: string): void {
    const messages = this.state.messageHistory[contactName] || [];
    messages.forEach(msg => msg.read = true);
  }

  private showNotification(action: Action): void {
    const title = action.parameters.title as string;
    const body = action.parameters.body as string;
    
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  }

  private vibrate(pattern: string): void {
    if ('vibrate' in navigator) {
      const patternArray = pattern.split(',').map(p => parseInt(p.trim()));
      navigator.vibrate(patternArray);
    }
  }

  private setContactStatus(action: Action): void {
    // TODO: Implement contact status management
  }

  private triggerEmergencyCall(): void {
    // TODO: Implement emergency call sequence
    console.log('Emergency call triggered!');
  }

  private sortMessageQueue(): void {
    this.state.messageQueue.sort((a, b) => a.scheduledTime - b.scheduledTime);
  }

  private processMessageQueue(): void {
    if (this.messageQueueTimer) {
      clearTimeout(this.messageQueueTimer);
    }

    const now = Date.now();
    const readyMessages = this.state.messageQueue.filter(msg => msg.scheduledTime <= now);
    
    // Process ready messages
    for (const queuedMsg of readyMessages) {
      this.addMessage(
        queuedMsg.contactName,
        queuedMsg.message.text,
        queuedMsg.message.isFromPlayer,
        queuedMsg.message.type,
        queuedMsg.message.mediaUrl,
        queuedMsg.message.caption,
        queuedMsg.message.location
      );
    }

    // Remove processed messages
    this.state.messageQueue = this.state.messageQueue.filter(msg => msg.scheduledTime > now);

    // Schedule next check
    if (this.state.messageQueue.length > 0) {
      const nextMessage = this.state.messageQueue[0];
      const timeUntilNext = nextMessage.scheduledTime - now;
      
      this.messageQueueTimer = setTimeout(() => {
        this.processMessageQueue();
      }, Math.max(0, timeUntilNext));
    }
  }

  addMessage(
    contactName: string,
    text: string,
    isFromPlayer: boolean,
    type: 'text' | 'photo' | 'video' | 'location' | 'typing' = 'text',
    mediaUrl?: string,
    caption?: string,
    location?: Message['location']
  ): void {
    if (!this.state.messageHistory[contactName]) {
      this.state.messageHistory[contactName] = [];
    }

    const message: Message = {
      id: `msg_${Date.now()}_${Math.random()}`,
      contactName,
      text,
      timestamp: Date.now(),
      isFromPlayer,
      type,
      mediaUrl,
      caption,
      location,
      read: false
    };

    this.state.messageHistory[contactName].push(message);
    this.events.onMessageAdded(message);
  }

  getGameState(): GameState {
    return { ...this.state };
  }

  getContactMessages(contactName: string): Message[] {
    return this.state.messageHistory[contactName] || [];
  }

  getUnlockedContacts(): string[] {
    return Array.from(this.state.unlockedContacts);
  }

  getContactState(contactName: string): 'active' | 'locked' | 'ended' {
    return this.state.threadStates[contactName] || 'active';
  }

  getCurrentRound(contactName: string): number {
    return this.state.currentRounds[contactName] || 1;
  }

  getVariable(name: string): any {
    return this.state.variables[name];
  }

  setVariable(name: string, value: any): void {
    this.state.variables[name] = value;
    this.events.onVariableChanged(name, value);
    this.saveGameState();
  }

  private saveGameState(): void {
    try {
      // Convert Set to array for JSON serialization
      const stateToSave = {
        ...this.state,
        unlockedContacts: Array.from(this.state.unlockedContacts)
      };
      localStorage.setItem('sms_game_state', JSON.stringify(stateToSave));
    } catch (error) {
      console.warn('Failed to save game state:', error);
    }
  }

  private loadGameState(): void {
    try {
      const saved = localStorage.getItem('sms_game_state');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Merge with current state, preserving new game data
        this.state = { ...this.state, ...parsed };
        // Restore Set objects - handle both array and object formats
        if (parsed.unlockedContacts) {
          if (Array.isArray(parsed.unlockedContacts)) {
            this.state.unlockedContacts = new Set(parsed.unlockedContacts);
          } else if (typeof parsed.unlockedContacts === 'object') {
            // Convert object keys to array
            this.state.unlockedContacts = new Set(Object.keys(parsed.unlockedContacts));
          } else {
            this.state.unlockedContacts = new Set();
          }
        } else {
          this.state.unlockedContacts = new Set();
        }
      }
    } catch (error) {
      console.warn('Failed to load game state:', error);
    }
  }

  resetGame(): void {
    this.state = this.initializeState();
    localStorage.removeItem('sms_game_state');
  }

  updateGameData(newGameData: GameData): void {
    this.gameData = newGameData;
    // Preserve current state but update variables
    this.state.variables = { ...newGameData.variables, ...this.state.variables };
  }
} 