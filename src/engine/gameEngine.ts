import { GameData, Contact, Round, Action } from '../parser/types';

export interface GameState {
  currentRounds: Record<string, string>;
  variables: Record<string, any>;
  threadStates: Record<string, 'active' | 'locked' | 'ended'>;
  messageHistory: Record<string, Message[]>;
  unlockedContacts: Set<string>;
  viewedContacts: Set<string>; // Track which contacts have been viewed
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
  type: 'text' | 'photo' | 'video' | 'location' | 'typing' | 'unlock_contact' | 'end_thread';
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

  private pendingUnlockContact: string | null = null;
  private pendingEndThread: boolean = false;
  private pendingResponses: Set<string> = new Set();

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
      viewedContacts: new Set<string>(), // Initialize empty set for viewed contacts

      typingDelays: { global: 2000 }, // Initialize with 2000ms default instead of 0
      gameStartTime: Date.now(),
      notifications: []
    };

    // Set up the first unlocked contact as the starting contact with initial message
    const unlockedContacts = Array.from(initiallyUnlocked);
    if (unlockedContacts.length > 0) {
      const firstContact = unlockedContacts[0];
      initialState.currentRounds[firstContact] = "1";
      
      // Add initial message from the first contact using round 1 passage
      const firstContactData = this.gameData.contacts[firstContact];
      const round1 = firstContactData.rounds["1"];
      if (round1 && round1.passage) {
        const initialMessage: Message = {
          id: `msg_${Date.now()}_initial`,
          contactName: firstContact,
          text: round1.passage,
          timestamp: Date.now(),
          isFromPlayer: false,
          type: 'text',
          read: false
        };
        
        initialState.messageHistory[firstContact] = [initialMessage];
      }
    }

    return initialState;
  }

  // Core game functions
  processChoice(contactName: string, choiceIndex: number): boolean {
    const contact = this.gameData.contacts[contactName];
    if (!contact) return false;

    const currentRound = this.state.currentRounds[contactName] || "1";
    
    // Find the current round object
    const round = contact.rounds[currentRound];
    if (!round || choiceIndex >= round.choices.length) return false;

    const choice = round.choices[choiceIndex];
    
    // Add player message to history
    this.addMessage(contactName, choice.text, true);

    // Find the correct response based on the choice made
    const responsePassage = this.findResponseForChoice(contact, choice, currentRound);
    
    // Execute actions from the target passage
    if (responsePassage) {
      // Find the target passage that contains the actions
      const targetRound = this.findTargetRound(contact, responsePassage);
      if (targetRound && targetRound.actions && targetRound.actions.length > 0) {
        this.executeActions(targetRound.actions);
      }
    }
    
    if (responsePassage) {
      // Find the next round number based on the choice target
      const nextRound = this.findNextRoundNumber(contact, choice.targetPassage);
      if (nextRound) {
        this.state.currentRounds[contactName] = nextRound;
      }
      
      // Queue the contact's response to appear after the typing delay
      this.queueResponseMessage(contactName, responsePassage);
    } else {
      // End thread if no response found
      this.state.threadStates[contactName] = 'ended';
      this.events.onThreadStateChanged(contactName, 'ended');
    }

    this.saveGameState();
    return true;
  }

  private findResponseForChoice(contact: Contact, choice: any, currentRound: string): string | null {
    const choiceText = choice.text.trim();
    const targetPassageName = choice.targetPassage;
    
    // Extract round number from target passage name (e.g., "Round-2.1" -> "2.1")
    const roundMatch = targetPassageName.match(/Round-(\d+(?:\.\d+)?)/);
    if (roundMatch) {
      const roundKey = roundMatch[1]; // "2.1", "2.2", etc.
      
      // Look for the target round in the contact's rounds
      if (contact.rounds[roundKey]) {
        return contact.rounds[roundKey].passage;
      }
    }
    
    // Fallback: try to find by exact round name (for backward compatibility)
    if (contact.rounds[targetPassageName]) {
      return contact.rounds[targetPassageName].passage;
    }
    
    // If not found by round name, try to find by partial match
    for (const [roundKey, round] of Object.entries(contact.rounds)) {
      if (round.passage && round.passage.trim() !== '') {
        // Check if the first line of the passage matches the choice text
        const passageLines = round.passage.split('\n');
        const firstLine = passageLines[0]?.trim();
        if (firstLine === choiceText) {
          return round.passage;
        }
      }
    }
    
    return null;
  }

  private findNextRoundNumber(contact: Contact, targetPassageName: string): string | null {
    // Extract the round number from the target passage name (e.g., "Round-2.1" -> "2.1")
    const roundMatch = targetPassageName.match(/Round-(\d+(?:\.\d+)?)/);
    if (roundMatch) {
      return roundMatch[1]; // Return "2.1", "2.2", etc.
    }
    
    // Fallback: try to find the next sequential round
    const currentRoundNum = parseFloat(this.state.currentRounds[contact.name] || "1");
    const availableRounds = Object.keys(contact.rounds)
      .map(key => ({ key, num: parseFloat(key) }))
      .filter(round => round.num > currentRoundNum)
      .sort((a, b) => a.num - b.num);
    
    return availableRounds.length > 0 ? availableRounds[0].key : null;
  }

  evaluateConditions(contactName: string): boolean {
    const contact = this.gameData.contacts[contactName];
    if (!contact) return false;

    const currentRound = this.state.currentRounds[contactName] || "1";
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

    try {
      switch (action.type) {
        case 'unlock_contact':
          this.handleUnlockContact(action);
          break;
        
        case 'end_thread':
          this.handleEndThread(action);
          break;
        
        case 'delayed_message':
          this.handleDelayedMessage(action);
          break;
        
        case 'send_photo':
          this.handleSendPhoto(action);
          break;
        
        case 'send_video':
          this.handleSendVideo(action);
          break;
        
        case 'drop_pin':
          this.handleDropPin(action);
          break;
        
        case 'call_911':
          this.handleCall911(action);
          break;
        
        case 'open_thread':
          this.handleOpenThread(action);
          break;
        
        case 'trigger_eli_needs_code':
          this.handleTriggerEliNeedsCode(action);
          break;
        
        case 'typing_indicator':
          this.handleTypingIndicator(action);
          break;
        
        case 'set_typing_delay':
          this.handleSetTypingDelay(action);
          break;
        
        case 'show_notification':
          this.handleShowNotification(action);
          break;
        
        case 'vibrate':
          this.handleVibrate(action);
          break;
        
        case 'set_contact_status':
          this.handleSetContactStatus(action);
          break;
        
        case 'trigger_emergency_call':
          this.handleTriggerEmergencyCall(action);
          break;
        
        default:
          console.warn(`Unknown action type: ${action.type}`);
      }
    } catch (error) {
      console.error(`Error executing action ${action.type}:`, error);
    }
  }

  private handleUnlockContact(action: Action): void {
    let contactToUnlock: string;
    
    // Handle different parameter formats
    if (action.parameters.contactName) {
      contactToUnlock = action.parameters.contactName as string;
    } else if (action.parameters.character) {
      contactToUnlock = action.parameters.character as string;
    } else {
      console.warn('unlock_contact action missing contact name');
      return;
    }
    
    if (contactToUnlock) {
      // Actually unlock the contact in the game state
      this.unlockContact(contactToUnlock);
      
      // Store the contact to unlock - it will be queued after the response appears
      this.pendingUnlockContact = contactToUnlock;
      // Dispatch event for UI updates
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('character-unlocked', {
          detail: { character: contactToUnlock }
        }));
      }
    }
  }

  private handleEndThread(action: Action): void {
    const contactName = this.getCurrentContactFromAction(action);
    if (contactName) {
      this.state.threadStates[contactName] = 'locked';
      this.events.onThreadStateChanged(contactName, 'locked');
      
      // Set flag to add end thread message after response
      this.pendingEndThread = true;
    }
  }

  private handleDelayedMessage(action: Action): void {
    this.queueDelayedMessage(action);
  }

  private handleSendPhoto(action: Action): void {
    this.queuePhotoMessage(action);
  }

  private handleSendVideo(action: Action): void {
    this.queueVideoMessage(action);
  }

  private handleDropPin(action: Action): void {
    this.queueLocationMessage(action);
  }

  private handleCall911(action: Action): void {
    this.triggerEmergencyCall();
  }

  private handleOpenThread(action: Action): void {
    const character = action.parameters.character as string;
    const threadId = action.parameters.thread_id as string;
    
    if (character && threadId) {
      // Dispatch event for UI to open thread
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('open-thread', {
          detail: { character, thread_id: threadId }
        }));
      }
    }
  }

  private handleTriggerEliNeedsCode(action: Action): void {
    // Dispatch event for character needs code scenario
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('trigger-eli-needs-code', {
        detail: { character: action.parameters.character || 'Unknown' }
      }));
    }
  }

  private handleTypingIndicator(action: Action): void {
    this.queueTypingIndicator(action);
  }

  private handleSetTypingDelay(action: Action): void {
    this.setTypingDelay(action);
  }

  private handleShowNotification(action: Action): void {
    this.showNotification(action);
  }

  private handleVibrate(action: Action): void {
    this.vibrate(action.parameters.pattern as string || 'default');
  }

  private handleSetContactStatus(action: Action): void {
    // TODO: Implement contact status management
  }

  private handleTriggerEmergencyCall(action: Action): void {
    this.triggerEmergencyCall();
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
        this.state.currentRounds[contactName] = "1";
      }
      
      // Initialize empty message history for the newly unlocked contact
      if (!this.state.messageHistory[contactName]) {
        this.state.messageHistory[contactName] = [];
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
    
    setTimeout(() => {
      this.addMessage(contactName, message, false);
    }, delay);
  }

  private queuePhotoMessage(action: Action): void {
    const delay = action.parameters.delay as number || 0;
    const file = action.parameters.file as string;
    const caption = action.parameters.caption as string;
    const contactName = this.getCurrentContactFromAction(action) || 'Unknown';
    
    setTimeout(() => {
      this.addMessage(contactName, caption || '', false, 'photo', `/assets/images/${file}`, caption);
    }, delay);
  }

  private queueVideoMessage(action: Action): void {
    const delay = action.parameters.delay as number || 0;
    const file = action.parameters.file as string;
    const caption = action.parameters.caption as string;
    const contactName = this.getCurrentContactFromAction(action) || 'Unknown';
    
    setTimeout(() => {
      this.addMessage(contactName, caption || '', false, 'video', `/assets/videos/${file}`, caption);
    }, delay);
  }

  private queueLocationMessage(action: Action): void {
    const delay = action.parameters.delay as number || 0;
    const location = action.parameters.location as string;
    const description = action.parameters.description as string;
    const mapFile = action.parameters.mapfile as string;
    const contactName = this.getCurrentContactFromAction(action) || 'Unknown';
    
    setTimeout(() => {
      this.addMessage(
        contactName,
        description || '',
        false,
        'location',
        undefined,
        undefined,
        {
          name: location,
          description,
          mapFile: mapFile ? `/assets/images/${mapFile}` : undefined
        }
      );
    }, delay);
  }

  private queueTypingIndicator(action: Action): void {
    const duration = action.parameters.duration as number || 1000;
    const contactName = this.getCurrentContactFromAction(action) || 'Unknown';
    
    setTimeout(() => {
      this.addMessage(contactName, '', false, 'typing');
    }, duration);
  }

  private queueResponseMessage(contactName: string, responseText: string): void {
    const delay = this.getGlobalTypingDelay();
    

    
    // Mark that we have a pending response for this contact
    this.pendingResponses.add(contactName);
    
    // Simple approach: just use setTimeout directly
    setTimeout(() => {
      // Add the response message
      this.addMessage(contactName, responseText, false);
      this.pendingResponses.delete(contactName);
      
             // If there's a pending unlock contact, add it after a short delay
       if (this.pendingUnlockContact) {
         setTimeout(() => {
           this.addMessage(
             contactName,
             `New Contact: ${this.pendingUnlockContact}`,
             false,
             'unlock_contact',
             undefined,
             undefined,
             undefined,
             this.pendingUnlockContact || undefined
           );
           this.pendingUnlockContact = null;
           
           // If there's a pending end thread, add it after unlock contact
           if (this.pendingEndThread) {
             setTimeout(() => {
               this.addMessage(
                 contactName,
                 'The Conversation Has Ended',
                 false,
                 'end_thread'
               );
               this.pendingEndThread = false;
             }, 500);
           }
         }, 1000);
       } else if (this.pendingEndThread) {
         // If no unlock contact but there's a pending end thread, add it after a short delay
         setTimeout(() => {
           this.addMessage(
             contactName,
             'The Conversation Has Ended',
             false,
             'end_thread'
           );
           this.pendingEndThread = false;
         }, 500);
       }
    }, delay);
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

  // Force reset typing delay to a specific value (for debugging)
  forceSetTypingDelay(delay: number): void {
    this.state.typingDelays.global = delay;
    this.saveGameState();
  }

  getGlobalTypingDelay(): number {
    const delay = this.state.typingDelays.global;
    return delay !== undefined ? delay : 2000; // Default to 2000ms if not set
  }

  hasPendingResponse(contactName: string): boolean {
    const hasPending = this.pendingResponses.has(contactName);
    return hasPending;
  }

  private markConversationRead(contactName: string): void {
    const messages = this.state.messageHistory[contactName] || [];
    messages.forEach(msg => msg.read = true);
    this.saveGameState();
  }

  markContactMessagesAsRead(contactName: string): void {
    this.markConversationRead(contactName);
    // Mark contact as viewed when messages are read
    this.markContactAsViewed(contactName);
  }

  markContactAsViewed(contactName: string): void {
    this.state.viewedContacts.add(contactName);
    this.saveGameState();
  }

  isContactViewed(contactName: string): boolean {
    return this.state.viewedContacts.has(contactName);
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



  addMessage(
    contactName: string,
    text: string,
    isFromPlayer: boolean,
    type: 'text' | 'photo' | 'video' | 'location' | 'typing' | 'unlock_contact' | 'end_thread' = 'text',
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

  getCurrentRound(contactName: string): string {
    const round = this.state.currentRounds[contactName];
    // Ensure we always start on round 1 and progress sequentially
    if (!round || round === "0") {
      return "1";
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
        unlockedContacts: Array.from(this.state.unlockedContacts),
        viewedContacts: Array.from(this.state.viewedContacts)
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

        // Restore viewedContacts Set
        if (parsed.viewedContacts) {
          if (Array.isArray(parsed.viewedContacts)) {
            this.state.viewedContacts = new Set(parsed.viewedContacts);
          } else if (typeof parsed.viewedContacts === 'object') {
            // Convert object keys to array
            this.state.viewedContacts = new Set(Object.keys(parsed.viewedContacts));
          } else {
            this.state.viewedContacts = new Set();
          }
        } else {
          this.state.viewedContacts = new Set();
        }
        
        // Restore typing delay - use saved value if it exists, otherwise use current value
        if (parsed.typingDelays && parsed.typingDelays.global !== undefined) {
          this.state.typingDelays.global = parsed.typingDelays.global;
        } else {
          // If no saved typing delay, ensure we have the default
          this.state.typingDelays.global = currentTypingDelay || 2000;
        }
      } else {
        // Initialize with a default typing delay if no saved state
        this.state.typingDelays.global = 2000; // Default to 2 seconds
      }
    } catch (error) {
      console.warn('Failed to load game state:', error);
    }
  }

  resetGame(): void {
    this.state = this.initializeState();
    localStorage.removeItem('sms_game_state');
    // Trigger events to update UI
    const unlockedContacts = Array.from(this.state.unlockedContacts);
    if (unlockedContacts.length > 0) {
      const firstContact = unlockedContacts[0];
      this.events.onContactUnlocked(firstContact);
      if (this.state.messageHistory[firstContact] && this.state.messageHistory[firstContact].length > 0) {
        this.events.onMessageAdded(this.state.messageHistory[firstContact][0]);
      }
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
      type: actionType as any,
      parameters
    };
    this.executeAction(action);
  }

  private findTargetRound(contact: Contact, responseText: string): Round | null {
    // Look through all rounds to find the one that contains the response text
    for (const [roundKey, round] of Object.entries(contact.rounds)) {
      if (round.passage && round.passage.trim() === responseText.trim()) {
        return round;
      }
    }
    return null;
  }
} 