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
  notifications: Array<{
    id: string;
    type: 'contact_unlocked' | 'message_received' | 'location_added';
    title: string;
    message: string;
    contactName?: string;
    timestamp: number;
  }>;
}

export interface Message {
  id: string;
  contactName: string;
  text: string;
  timestamp: number;
  isFromPlayer: boolean;
  type: 'text' | 'photo' | 'video' | 'location' | 'typing' | 'unlock_contact';
  mediaUrl?: string;
  caption?: string;
  location?: {
    name: string;
    description: string;
    mapFile?: string;
  };
  read: boolean;
  unlockedContactName?: string; // For unlock_contact messages
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
  public events: GameEngineEvents;
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

    // Create initial state
    const initialState: GameState = {
      currentRounds: {},
      variables: { ...this.gameData.variables },
      threadStates: {},
      messageHistory: {},
      unlockedContacts: initiallyUnlocked,
      messageQueue: [],
      typingDelays: { global: 0 }, // Initialize with 0ms delay
      gameStartTime: Date.now(),
      notifications: []
    };

    // Set up Jamie as the starting contact with initial message
    if (this.gameData.contacts['Jamie']) {
      initialState.unlockedContacts.add('Jamie');
      initialState.currentRounds['Jamie'] = 1;
      
      // Add initial message from Jamie using round 1 passage
      const jamieContact = this.gameData.contacts['Jamie'];
      const round1 = jamieContact.rounds[1];
      if (round1 && round1.passage) {
        const initialMessage: Message = {
          id: `msg_${Date.now()}_initial`,
          contactName: 'Jamie',
          text: round1.passage,
          timestamp: Date.now(),
          isFromPlayer: false,
          type: 'text',
          read: false
        };
        
        initialState.messageHistory['Jamie'] = [initialMessage];
      }
    }

    return initialState;
  }

  // Core game functions
  processChoice(contactName: string, choiceIndex: number): boolean {
    const contact = this.gameData.contacts[contactName];
    if (!contact) return false;

    const currentRound = this.state.currentRounds[contactName] || 1;
    // Ensure we can't skip rounds - must progress sequentially
    if (currentRound < 1) {
      this.state.currentRounds[contactName] = 1;
    }
    
    const round = contact.rounds[currentRound];
    if (!round || choiceIndex >= round.choices.length) return false;

    const choice = round.choices[choiceIndex];
    
    // Add player message to history
    this.addMessage(contactName, choice.text, true);

    // Find the correct response based on the choice made
    const responsePassage = this.findResponseForChoice(contact, choice, currentRound);
    
    // Execute actions from the target passage
    if (responsePassage) {
             // For Jamie, we need to handle specific choice-to-action mappings
       if (contact.name === 'Jamie' && currentRound === 2) {
         if (choice.text === 'Who else was she close with?') {
           // This choice should trigger the unlock action
           this.executeAction({
             type: 'unlock_contact',
             parameters: { contactName: 'Maya' }
           });
         }
       }
      
      // Find the target passage that contains the actions
      for (const [roundNum, round] of Object.entries(contact.rounds)) {
        if (round.passage && round.passage.includes(responsePassage)) {
          if (round.actions && round.actions.length > 0) {
            this.executeActions(round.actions);
          }
          break;
        }
      }
    }
    
    if (responsePassage) {
      // Advance to the next round
      this.state.currentRounds[contactName] = currentRound + 1;
      
      // Add contact's response after the typing indicator finishes
      const delay = this.getGlobalTypingDelay();
      setTimeout(() => {
        this.addMessage(contactName, responsePassage, false);
      }, delay);
    } else {
      // End thread if no response found
      this.state.threadStates[contactName] = 'ended';
      this.events.onThreadStateChanged(contactName, 'ended');
    }

    this.saveGameState();
    return true;
  }

  private findResponseForChoice(contact: Contact, choice: any, currentRound: number): string | null {
    const choiceText = choice.text.trim();
    
    // For Jamie, we need to map specific choices to their correct responses
    if (contact.name === 'Jamie') {
      // Round 1 choices -> Round 2 responses
      if (currentRound === 1) {
        const nextRound = contact.rounds[2];
        if (nextRound && nextRound.passage) {
          return nextRound.passage;
        }
      }
      
      // Round 2 choices -> Round 3 responses (specific mapping)
      if (currentRound === 2) {
        if (choiceText === 'Why did you contact me?') {
          return 'I was hoping you might know where she was';
        } else if (choiceText === 'Did you try calling the cops?') {
          return 'Not yet, I was checking her texts for any leads.';
        } else if (choiceText === 'Who else was she close with?') {
          return 'I think she was upset about her ex—Maya. You might wanna talk to her.';
        }
      }
      
      // Round 3 choices -> specific responses
      if (currentRound === 3) {
        if (choiceText === 'Who else was she close with?') {
          return 'I think she was upset about her ex—Maya. You might wanna talk to her.';
        } else if (choiceText === 'Why did you contact me?') {
          return 'I was hoping you might know where she was';
        } else if (choiceText === 'Did you try calling the cops?') {
          return 'Not yet, I was checking her texts for any leads.';
        }
      }
    }
    
    // Fallback: try to find any response in the next round
    const nextRoundNumber = currentRound + 1;
    const nextRound = contact.rounds[nextRoundNumber];
    
    if (nextRound && nextRound.passage) {
      return nextRound.passage;
    }
    
    return null;
  }

  private findNextRound(contact: Contact, currentRound: number): number | null {
    // Get all available round numbers and sort them
    const availableRounds = Object.keys(contact.rounds)
      .map(Number)
      .filter(round => round > currentRound)
      .sort((a, b) => a - b);
    
    // Return the next available round, or null if none exist
    return availableRounds.length > 0 ? availableRounds[0] : null;
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
        const contactToUnlock = action.parameters.contactName as string;
        if (contactToUnlock) {
          this.unlockContact(contactToUnlock);
          // Dispatch event for UI updates
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('character-unlocked', {
              detail: { character: contactToUnlock }
            }));
          }
        }
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

  unlockContact(contactName: string): void {
    if (!this.state.unlockedContacts.has(contactName)) {
      this.state.unlockedContacts.add(contactName);
      // Ensure newly unlocked contacts start on round 1
      if (!this.state.currentRounds[contactName]) {
        this.state.currentRounds[contactName] = 1;
      }
      
      // Initialize empty message history for the newly unlocked contact
      if (!this.state.messageHistory[contactName]) {
        this.state.messageHistory[contactName] = [];
      }
      
      // Add green bubble notification to the current active conversation
      // Find the current active conversation (the one that triggered the unlock)
      for (const [activeContact, messages] of Object.entries(this.state.messageHistory)) {
        if (messages.length > 0) {
          // Add the unlock notification to the active conversation
          this.addMessage(
            activeContact,
            `${contactName} is now available to chat with`,
            false,
            'unlock_contact',
            undefined,
            undefined,
            undefined,
            contactName
          );
          break; // Only add to the first active conversation
        }
      }
      
      this.events.onContactUnlocked(contactName);
      this.saveGameState();
    } else {
      // Contact already unlocked
    }
  }

  private addNotification(notification: Omit<GameState['notifications'][0], 'id'>): void {
    const newNotification = {
      ...notification,
      id: `notification_${Date.now()}_${Math.random()}`
    };
    
    this.state.notifications.push(newNotification);
    
    // Dispatch notification event for UI
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('notification-added', {
        detail: newNotification
      }));
    }
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

  setGlobalTypingDelay(delay: number): void {
    this.state.typingDelays.global = delay;
    // Save the state immediately to persist the delay
    this.saveGameState();
  }

  getGlobalTypingDelay(): number {
    return this.state.typingDelays.global || 0;
  }

  private markConversationRead(contactName: string): void {
    const messages = this.state.messageHistory[contactName] || [];
    messages.forEach(msg => msg.read = true);
    this.saveGameState();
  }

  markContactMessagesAsRead(contactName: string): void {
    this.markConversationRead(contactName);
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
    type: 'text' | 'photo' | 'video' | 'location' | 'typing' | 'unlock_contact' = 'text',
    mediaUrl?: string,
    caption?: string,
    location?: Message['location'],
    unlockedContactName?: string
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
      read: false,
      unlockedContactName
    };

    this.state.messageHistory[contactName].push(message);
    this.events.onMessageAdded(message);
  }

  getGameState(): GameState {
    return { ...this.state };
  }

  getNotifications(): GameState['notifications'] {
    return [...this.state.notifications];
  }

  clearNotifications(): void {
    this.state.notifications = [];
    this.saveGameState();
  }

  getContactMessages(contactName: string): Message[] {
    return this.state.messageHistory[contactName] || [];
  }

  getUnlockedContacts(): string[] {
    return Array.from(this.state.unlockedContacts);
  }

  getContactData(contactName: string): Contact | null {
    // First try to get from gameData
    const contact = this.gameData.contacts[contactName];
    if (contact) {
      return contact;
    }
    
    // If not in gameData but is unlocked, return null to prevent empty bubbles
    // The contact should be properly defined in the Twee script
    return null;
  }

  getContactState(contactName: string): 'active' | 'locked' | 'ended' {
    return this.state.threadStates[contactName] || 'active';
  }

  getCurrentRound(contactName: string): number {
    const round = this.state.currentRounds[contactName];
    // Ensure we always start on round 1 and progress sequentially
    if (!round || round < 1) {
      return 1;
    }
    return round;
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
        
        // Store the current typing delay before merging state
        const currentTypingDelay = this.state.typingDelays.global;
        
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
        
        // Only preserve the current typing delay if it's been explicitly set by the user
        // Otherwise, use the saved value or default
        if (currentTypingDelay !== undefined && currentTypingDelay !== 2000) {
          this.state.typingDelays.global = currentTypingDelay;
        } else if (parsed.typingDelays && parsed.typingDelays.global !== undefined) {
          this.state.typingDelays.global = parsed.typingDelays.global;
        }
      }
    } catch (error) {
      console.warn('Failed to load game state:', error);
    }
  }

  resetGame(): void {
    this.state = this.initializeState();
    localStorage.removeItem('sms_game_state');
    // Trigger events to update UI
    this.events.onContactUnlocked('Jamie');
    if (this.state.messageHistory['Jamie'] && this.state.messageHistory['Jamie'].length > 0) {
      this.events.onMessageAdded(this.state.messageHistory['Jamie'][0]);
    }
  }

  updateGameData(newGameData: GameData): void {
    this.gameData = newGameData;
    // Preserve current state but update variables
    this.state.variables = { ...newGameData.variables, ...this.state.variables };
  }

  // Test method to manually trigger an action
  testAction(actionType: string, parameters: Record<string, any>): void {
    const action: Action = {
      type: actionType,
      parameters
    };
    this.executeAction(action);
  }
} 