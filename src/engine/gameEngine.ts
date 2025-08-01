import { GameData, Contact, Round, Action, Choice } from '../parser/types';
import { TweeParser } from '../parser/tweeParser';

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
  // New fields for enhanced UI
  isLocationPin?: boolean;
  locationPin?: { location: string; description: string };
  isThreadEnded?: boolean;
  mediaType?: 'photo' | 'video' | 'location';
  image?: string;
}

// NEW: Unified delay system interfaces
export interface QueuedAction {
  type: string;
  parameters: Record<string, any>;
  delay: number; // From script or default 0
  priority: number; // For end_thread = highest priority
  contactName: string;
  isResponseTriggered: boolean; // Actions that display after response
}

export interface QueuedMessage {
  type: 'response' | 'action' | 'typing';
  content: any;
  delay: number;
  contactName: string;
  priority: number;
}

export interface UnifiedDelayConfig {
  globalTypingDelay: number;
  typingIndicatorDuration: number;
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

  // NEW: Unified delay system
  private delayConfig: UnifiedDelayConfig = {
    globalTypingDelay: 1000,
    typingIndicatorDuration: 400
  };
  
  private messageQueue: QueuedMessage[] = [];
  private isProcessingQueue: boolean = false;

  constructor(gameData: GameData, events: GameEngineEvents) {
    this.gameData = gameData;
    this.events = events;
    
    this.state = this.initializeState();
    this.loadGameState();
    
    // Ensure delayConfig and state.typingDelays are in sync after loading
    this.syncDelayConfig();
  }

  // NEW: Unified delay system methods
  private syncDelayConfig(): void {
    // Ensure delayConfig and state.typingDelays are synchronized
    if (this.state.typingDelays.global !== this.delayConfig.globalTypingDelay) {
      this.delayConfig.globalTypingDelay = this.state.typingDelays.global;
    }
  }
  
  private processRoundWithUnifiedDelays(round: Round, contactName: string): void {
    const queuedActions: QueuedAction[] = [];
    
    // Process actions from the round
    if (round.actions && round.actions.length > 0) {
      for (const action of round.actions) {
        const delay = (action.parameters.delay as number) || 0;
        const isResponseTriggered = this.isResponseTriggeredAction(action.type);
        const priority = action.type === 'end_thread' ? 1000 : 0; // end_thread gets highest priority
        
        queuedActions.push({
          type: action.type,
          parameters: action.parameters,
          delay,
          priority,
          contactName,
          isResponseTriggered
        });
      }
    }
    
    // Sort actions by priority (end_thread last)
    queuedActions.sort((a, b) => a.priority - b.priority);
    
    // Calculate delays
    const responseDelay = this.delayConfig.globalTypingDelay;
    let currentDelay = 0;
    
    // Add response if it exists
    if (round.passage && round.passage.trim()) {
      // Only show typing indicator if there's a global delay
      if (responseDelay > 0) {
        this.queueMessage({
          type: 'typing',
          content: { contactName },
          delay: currentDelay,
          contactName,
          priority: 0
        });
        
        currentDelay += this.delayConfig.typingIndicatorDuration;
      }
      
      const responseDelayTotal = currentDelay + responseDelay;
      
      this.queueMessage({
        type: 'response',
        content: { text: round.passage, contactName },
        delay: responseDelayTotal, // Apply global delay to response
        contactName,
        priority: 0
      });
      
      currentDelay += responseDelay;
    }
    
    // Process actions
    for (const action of queuedActions) {
      if (action.isResponseTriggered) {
        // These actions display after the response with the same delay
        this.queueMessage({
          type: 'action',
          content: action,
          delay: currentDelay + action.delay,
          contactName,
          priority: action.priority
        });
      } else {
        // These actions display with their own delay
        const actionDelay = this.delayConfig.globalTypingDelay + action.delay;
        
        // For delayed_message actions, add typing indicator before the message
        if (action.type === 'delayed_message') {
          // Only show typing indicator if there's a global delay
          if (this.delayConfig.globalTypingDelay > 0) {
            // Add typing indicator before the delayed message
            this.queueMessage({
              type: 'typing',
              content: { contactName },
              delay: actionDelay - this.delayConfig.typingIndicatorDuration,
              contactName,
              priority: action.priority - 1 // Lower priority than the message
            });
          }
          
          // Add the delayed message
          this.queueMessage({
            type: 'action',
            content: action,
            delay: actionDelay,
            contactName,
            priority: action.priority
          });
        } else {
          // Other actions display normally
          this.queueMessage({
            type: 'action',
            content: action,
            delay: actionDelay,
            contactName,
            priority: action.priority
          });
        }
      }
    }
    
    // Start processing the queue
    this.processMessageQueue();
  }
  
  private isResponseTriggeredAction(actionType: string): boolean {
    return ['unlock_contact', 'send_photo', 'drop_pin'].includes(actionType);
  }
  
  private queueMessage(message: QueuedMessage): void {
    this.messageQueue.push(message);
  }
  
  private processMessageQueue(): void {
    if (this.isProcessingQueue || this.messageQueue.length === 0) {
      return;
    }
    
    this.isProcessingQueue = true;
    this.processNextMessage();
  }
  
  private processNextMessage(): void {
    if (this.messageQueue.length === 0) {
      this.isProcessingQueue = false;
      return;
    }
    
    const message = this.messageQueue.shift()!;
    
    setTimeout(() => {
      this.executeQueuedMessage(message);
      this.processNextMessage();
    }, message.delay);
  }
  
  private executeQueuedMessage(message: QueuedMessage): void {
    switch (message.type) {
      case 'typing':
        this.addTypingIndicator(message.content.contactName);
        break;
        
      case 'response':
        this.removeTypingIndicator(message.content.contactName);
        this.addMessage(message.content.contactName, message.content.text, false);
        break;
        
      case 'action':
        // Remove typing indicator before executing action (for delayed messages)
        this.removeTypingIndicator(message.content.contactName);
        this.executeUnifiedAction(message.content);
        break;
    }
  }
  
  private executeUnifiedAction(action: QueuedAction): void {
    switch (action.type) {
      case 'unlock_contact':
        this.handleUnlockContactUnified(action);
        break;
      case 'send_photo':
        this.handleSendPhotoUnified(action);
        break;
      case 'drop_pin':
        this.handleDropPinUnified(action);
        break;
      case 'delayed_message':
        this.handleDelayedMessageUnified(action);
        break;
      case 'end_thread':
        this.handleEndThreadUnified(action);
        break;
      case 'set_variable':
        this.handleSetVariableUnified(action);
        break;
      case 'call_911':
        this.handleCall911Unified(action);
        break;
      case 'open_thread':
        this.handleOpenThreadUnified(action);
        break;
      case 'trigger_eli_needs_code':
        this.handleTriggerEliNeedsCodeUnified(action);
        break;
      case 'typing_indicator':
        this.handleTypingIndicatorUnified(action);
        break;
      case 'set_typing_delay':
        this.handleSetTypingDelayUnified(action);
        break;
      case 'show_notification':
        this.handleShowNotificationUnified(action);
        break;
      case 'vibrate':
        this.handleVibrateUnified(action);
        break;
      case 'set_contact_status':
        this.handleSetContactStatusUnified(action);
        break;
      case 'trigger_emergency_call':
        this.handleTriggerEmergencyCallUnified(action);
        break;
      case 'add_chat_history':
        this.handleAddChatHistoryUnified(action);
        break;
    }
  }
  
  // NEW: Unified action handlers
  private handleUnlockContactUnified(action: QueuedAction): void {
    const contactToUnlock = action.parameters.contactName || action.parameters.character;
    if (contactToUnlock) {
      const normalizedContactName = this.normalizeContactName(contactToUnlock);
      this.unlockContact(normalizedContactName);
      
      this.addMessage(
        action.contactName,
        `New Contact: ${normalizedContactName}`,
        false,
        'unlock_contact',
        undefined,
        undefined,
        undefined,
        normalizedContactName
      );
    }
  }
  
  private handleSendPhotoUnified(action: QueuedAction): void {
    const file = action.parameters.file as string;
    const caption = action.parameters.caption as string;
    
    if (file && caption) {
      const imagePath = `/assets/images/${file}`;
      this.addMessage(
        action.contactName,
        caption,
        false,
        'photo',
        imagePath,
        caption
      );
    }
  }
  
  private handleDropPinUnified(action: QueuedAction): void {
    const location = action.parameters.location as string;
    const description = action.parameters.description as string;
    const file = action.parameters.file as string;
    
    if (location && description) {
      this.addMessage(
        action.contactName,
        description,
        false,
        'location',
        undefined,
        undefined,
        {
          name: location,
          description: description,
          mapFile: file
        }
      );
      
      this.addNotification({
        type: 'location_added',
        title: 'Location Added',
        message: `New location: ${location}`,
        contactName: action.contactName,
        timestamp: Date.now()
      });
    }
  }
  
  private handleDelayedMessageUnified(action: QueuedAction): void {
    const message = action.parameters.message as string;
    if (message) {
      this.addMessage(action.contactName, message, false);
    }
  }
  
  private handleEndThreadUnified(action: QueuedAction): void {
    this.state.threadStates[action.contactName] = 'ended';
    this.events.onThreadStateChanged(action.contactName, 'ended');
    
    const showMessage = action.parameters.showMessage !== undefined ? Boolean(action.parameters.showMessage) : true;
    if (showMessage) {
      this.addMessage(
        action.contactName,
        'The Conversation Has Ended',
        false,
        'end_thread'
      );
    }
  }
  
  private handleSetVariableUnified(action: QueuedAction): void {
    const variableName = action.parameters.variableName as string;
    const variableValue = action.parameters.variableValue;
    
    if (variableName && variableValue !== undefined) {
      this.setVariable(variableName, variableValue);
      this.events.onVariableChanged(variableName, variableValue);
      this.unlockConditionalThreads();
    }
  }
  
  private handleCall911Unified(action: QueuedAction): void {
    this.triggerEmergencyCall();
  }
  
  private handleOpenThreadUnified(action: QueuedAction): void {
    const character = action.parameters.character as string;
    if (character) {
      const normalizedContactName = this.normalizeContactName(character);
      if (this.state.threadStates[normalizedContactName] === 'locked') {
        this.state.threadStates[normalizedContactName] = 'active';
        this.state.viewedContacts.delete(normalizedContactName);
        
        const contactData = this.gameData.contacts[normalizedContactName];
        const round1 = contactData.rounds["1.0"];
        if (round1 && round1.passage) {
          const initialMessage: Message = {
            id: `msg_${Date.now()}_initial_${normalizedContactName}`,
            contactName: normalizedContactName,
            text: round1.passage,
            timestamp: Date.now(),
            isFromPlayer: false,
            type: 'text',
            read: false
          };
          
          if (!this.state.messageHistory[normalizedContactName]) {
            this.state.messageHistory[normalizedContactName] = [];
          }
          this.state.messageHistory[normalizedContactName].push(initialMessage);
          this.events.onMessageAdded(initialMessage);
        }
        
        this.events.onThreadStateChanged(normalizedContactName, 'active');
      }
    }
  }
  
  private handleTriggerEliNeedsCodeUnified(action: QueuedAction): void {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('trigger-eli-needs-code', {
        detail: { character: action.parameters.character || 'Unknown' }
      }));
    }
  }
  
  private handleTypingIndicatorUnified(action: QueuedAction): void {
    const duration = action.parameters.duration as number || 1000;
    this.addTypingIndicator(action.contactName);
    setTimeout(() => {
      this.removeTypingIndicator(action.contactName);
    }, duration);
  }
  
  private handleSetTypingDelayUnified(action: QueuedAction): void {
    const delay = action.parameters.delay as number || 1000;
    this.delayConfig.globalTypingDelay = delay;
    this.state.typingDelays.global = delay;
  }
  
  private handleShowNotificationUnified(action: QueuedAction): void {
    const title = action.parameters.title as string;
    const body = action.parameters.body as string;
    
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  }
  
  private handleVibrateUnified(action: QueuedAction): void {
    const pattern = action.parameters.pattern as string || 'default';
    if ('vibrate' in navigator) {
      const patternArray = pattern.split(',').map(p => parseInt(p.trim()));
      navigator.vibrate(patternArray);
    }
  }
  
  private handleSetContactStatusUnified(action: QueuedAction): void {
    // TODO: Implement contact status management
  }
  
  private handleTriggerEmergencyCallUnified(action: QueuedAction): void {
    this.triggerEmergencyCall();
  }
  
  private handleAddChatHistoryUnified(action: QueuedAction): void {
    const pastTimestamp = this.getPastTimestamp();
    
    if (action.parameters.contact) {
      const contactMessages = (action.parameters.contact as string).split('|');
      contactMessages.forEach((message, index) => {
        const timestamp = pastTimestamp - (index * 5 * 60 * 1000);
        this.addMessage(
          action.contactName,
          message.trim(),
          false,
          'text',
          undefined,
          undefined,
          undefined,
          undefined,
          timestamp
        );
      });
    }
    
    if (action.parameters.player) {
      const playerMessages = (action.parameters.player as string).split('|');
      playerMessages.forEach((message, index) => {
        const timestamp = pastTimestamp - (index * 5 * 60 * 1000) - (2.5 * 60 * 1000);
        this.addMessage(
          action.contactName,
          message.trim(),
          true,
          'text',
          undefined,
          undefined,
          undefined,
          undefined,
          timestamp
        );
      });
    }
  }

  // Add back the missing processChatHistoryAction method
  private processChatHistoryAction(action: Action, contactName: string, state: GameState): void {
    const targetContact = contactName || this.getCurrentContactFromAction(action);
    if (!targetContact) return;

    const pastTimestamp = this.getPastTimestamp();

    if (action.parameters.contact) {
      const contactMessages = (action.parameters.contact as string).split('|');
      contactMessages.forEach((message, index) => {
        const timestamp = pastTimestamp - (index * 5 * 60 * 1000);
        const chatMessage: Message = {
          id: `${targetContact}-${timestamp}-${Math.random()}`,
          contactName: targetContact,
          text: message.trim(),
          timestamp: timestamp,
          isFromPlayer: false,
          type: 'text',
          read: false
        };
        if (!state.messageHistory[targetContact]) {
          state.messageHistory[targetContact] = [];
        }
        state.messageHistory[targetContact].push(chatMessage);
      });
    }

    if (action.parameters.player) {
      const playerMessages = (action.parameters.player as string).split('|');
      playerMessages.forEach((message, index) => {
        const timestamp = pastTimestamp - (index * 5 * 60 * 1000) - (2.5 * 60 * 1000);
        const chatMessage: Message = {
          id: `${targetContact}-${timestamp}-${Math.random()}`,
          contactName: targetContact,
          text: message.trim(),
          timestamp: timestamp,
          isFromPlayer: true,
          type: 'text',
          read: false
        };
        if (!state.messageHistory[targetContact]) {
          state.messageHistory[targetContact] = [];
        }
        state.messageHistory[targetContact].push(chatMessage);
      });
    }
  }

  // Add back the missing getCurrentContactFromAction method
  private getCurrentContactFromAction(action: Action): string | null {
    // Try to determine which contact this action belongs to
    // First, check if there's a character parameter in the action
    if (action.parameters.character) {
      return action.parameters.character as string;
    }
    
    // Look for the most recently active contact (one with the highest round number)
    let mostActiveContact: string | null = null;
    let highestRound = 0;
    
    for (const [contactName, currentRound] of Object.entries(this.state.currentRounds)) {
      const roundNum = parseInt(currentRound);
      if (roundNum > highestRound) {
        highestRound = roundNum;
        mostActiveContact = contactName;
      }
    }
    
    // If no active contact found, try the first unlocked contact
    if (!mostActiveContact) {
      const unlockedContacts = Array.from(this.state.unlockedContacts);
      if (unlockedContacts.length > 0) {
        mostActiveContact = unlockedContacts[0];
      }
    }
    
    return mostActiveContact;
  }
  
  // NEW: Simplified typing indicator management
  private addTypingIndicator(contactName: string): void {
    this.addMessage(contactName, '', false, 'typing');
  }
  
  private removeTypingIndicator(contactName: string): void {
    const messages = this.state.messageHistory[contactName] || [];
    const typingMessage = messages.find(msg => msg.type === 'typing');
    if (typingMessage) {
      this.state.messageHistory[contactName] = messages.filter(msg => msg.id !== typingMessage.id);
    }
  }

  private initializeState(): GameState {
    const initialState: GameState = {
      currentRounds: {},
      variables: {},
      threadStates: {},
      messageHistory: {},
      unlockedContacts: new Set(),
      viewedContacts: new Set(),
      typingDelays: {
        global: this.delayConfig.globalTypingDelay // Initialize with the global delay
      },
      gameStartTime: Date.now(),
      notifications: []
    };

    // Process initial contacts and set up initial state
    const unlockedContacts: string[] = [];
    
    for (const [contactName, contact] of Object.entries(this.gameData.contacts)) {
      if (contact.unlocked) {
        unlockedContacts.push(contactName);
      }
    }

    if (unlockedContacts.length > 0) {
      // Add all unlocked contacts to the Set
      unlockedContacts.forEach(contactName => {
        initialState.unlockedContacts.add(contactName);
      });
      
      // Use the first unlocked contact as the initial contact
      const firstContact = unlockedContacts[0];
      
      initialState.currentRounds[firstContact] = "1.0";
      initialState.threadStates[firstContact] = "active";
      
      // Add initial message from the first contact using round 1.0 passage
      const firstContactData = this.gameData.contacts[firstContact];
      const round1 = firstContactData.rounds["1.0"];
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
      
      // Execute chat history actions from Round-1.0 immediately for the first contact
      if (round1 && round1.actions && round1.actions.length > 0) {
        for (const action of round1.actions) {
          if (action.type === 'add_chat_history') {
            this.processChatHistoryAction(action, firstContact, initialState);
          }
        }
      }
      
      // Process other unlocked contacts - set thread state to locked initially
      for (let i = 0; i < unlockedContacts.length; i++) {
        const contactName = unlockedContacts[i];
        if (contactName === firstContact) continue; // Skip the first contact
        
        // Set thread state to locked for non-first contacts
        initialState.threadStates[contactName] = "locked";
        
        const contactData = this.gameData.contacts[contactName];
        const round1Other = contactData.rounds["1.0"];
        
        if (round1Other && round1Other.actions && round1Other.actions.length > 0) {
          for (const action of round1Other.actions) {
            if (action.type === 'add_chat_history') {
              this.processChatHistoryAction(action, contactName, initialState);
            }
          }
        }
        // Don't add initial message for locked threads - it will be added when thread is unlocked
      }
    }

    return initialState;
  }

  // Core game functions
  processChoice(contactName: string, choiceIndex: number): void {
    
    const contact = this.getContactData(contactName);
    if (!contact) return;

    const currentRound = this.getCurrentRound(contactName);
    const round = this.getCurrentRoundData(contactName);
    
    if (!round || !round.choices || choiceIndex >= round.choices.length) {
      return;
    }

    const choice = round.choices[choiceIndex];
    const targetRoundName = choice.targetRound;
    
    // Add the player's choice as a message first
    this.addMessage(contactName, choice.text, true); // isFromPlayer = true
    
    // Extract round number from target round name
    const roundMatch = targetRoundName.match(/(\d+\.\d+)/);
    if (!roundMatch) return;
    
    const finalRoundNumber = roundMatch[1];
    
    // Find the target round in the contact's rounds
    const contactData = this.getContactData(contactName);
    if (!contactData) return;
    
    const targetRound = contactData.rounds[finalRoundNumber];
    if (!targetRound) return;
    
    // Update current round
    this.state.currentRounds[contactName] = finalRoundNumber;
    
    // Process the round with unified delays
    this.processRoundWithUnifiedDelays(targetRound, contactName);
    
    // Execute embedded action if present
    if (choice.embeddedAction) {
      this.executeEmbeddedAction(choice.embeddedAction, contactName);
    }
    
    // Save game state
    this.saveGameState();
  }

  private findResponseForChoice(contact: Contact, choice: Choice, currentRound: string): string | null {
    // Look for the target round in the contact's rounds
    const targetRoundName = choice.targetRound;
    
    // Extract round number from target round name
    const roundMatch = targetRoundName.match(/(?:[^-]+)-Round-(\d+(?:\.\d+)?)/);
    if (roundMatch) {
      const roundNumber = roundMatch[1];
      // Keep the full round number format
      const finalRoundNumber = roundNumber;
      
      // Check if the target round exists in the contact's rounds
      if (contact.rounds[finalRoundNumber]) {
        return contact.rounds[finalRoundNumber].passage;
      }
    }
    
    // Fallback: try to find the exact target round name
    if (contact.rounds[targetRoundName]) {
      return contact.rounds[targetRoundName].passage;
    }
    
    return null;
  }

  private findNextRoundNumber(contact: Contact, targetRoundName: string): string | null {
    // Extract round number from target round name
    const roundMatch = targetRoundName.match(/(?:[^-]+)-Round-(\d+(?:\.\d+)?)/);
    if (roundMatch) {
      const roundNumber = roundMatch[1];
      // Keep the full round number format
      const finalRoundNumber = roundNumber;
      return finalRoundNumber;
    }
    return null;
  }

  evaluateConditions(contactName: string): boolean {
    const contact = this.gameData.contacts[contactName];
    if (!contact) return false;

    const currentRound = this.state.currentRounds[contactName] || "1.0";
    const round = contact.rounds[currentRound];
    if (!round) return false;

    // For now, simple condition evaluation
    // TODO: Implement complex Harlowe-style condition parsing
    return true;
  }

  private normalizeContactName(contactName: string): string {
    // Handle known contact name mismatches
    const contactMappings: Record<string, string> = {
      'Maya Delgado': 'Maya',
      'Eli Mercer': 'Eli'
    };
    
    return contactMappings[contactName] || contactName;
  }

  // Essential methods that are still needed
  setGlobalTypingDelay(delay: number): void {
    this.delayConfig.globalTypingDelay = delay;
    this.state.typingDelays.global = delay;
    
    // Save the state immediately to persist the delay
    this.saveGameState();
    
    // Dispatch event to notify UI of typing delay change
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('typing-delay-changed', {
        detail: { delay }
      }));
    }
  }

  // Force reset typing delay to a specific value (for debugging)
  forceSetTypingDelay(delay: number): void {
    this.delayConfig.globalTypingDelay = delay;
    this.state.typingDelays.global = delay;
    this.saveGameState();
    
    // Dispatch event to notify UI of typing delay change
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('typing-delay-changed', {
        detail: { delay }
      }));
    }
  }

  getGlobalTypingDelay(): number {
    return this.delayConfig.globalTypingDelay;
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
    // Dispatch event to trigger the 911 call animation
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('call-911-animation', {
        detail: { timestamp: Date.now() }
      }));
    }
  }

  private executeEmbeddedAction(action: Action, contactName: string): void {
    // Handle embedded actions as player messages
    switch (action.type) {
      case 'drop_pin':
        this.handleEmbeddedDropPin(action, contactName);
        break;
      case 'send_photo':
        this.handleEmbeddedSendPhoto(action, contactName);
        break;
      case 'delayed_message':
        this.handleEmbeddedDelayedMessage(action, contactName);
        break;
      case 'set_variable':
        this.handleSetVariableUnified({ type: 'set_variable', parameters: action.parameters, delay: 0, priority: 0, contactName, isResponseTriggered: false });
        break;
      default:
        // For other actions, just ignore them in embedded context
        break;
    }
  }

  private handleEmbeddedDropPin(action: Action, contactName: string): void {
    const location = action.parameters.location as string;
    const description = action.parameters.description as string;
    const file = action.parameters.file as string;
    
    if (location && description) {
      // Add as player message immediately
      this.addMessage(
        contactName,
        location,
        true, // isFromPlayer = true
        'location',
        undefined,
        undefined,
        {
          name: location,
          description: description,
          mapFile: file
        }
      );
      
      // Add notification
      this.addNotification({
        type: 'location_added',
        title: 'Location Added',
        message: `New location: ${location}`,
        contactName: contactName,
        timestamp: Date.now()
      });
    }
  }

  private handleEmbeddedSendPhoto(action: Action, contactName: string): void {
    const file = action.parameters.file as string;
    const caption = action.parameters.caption as string;
    const delay = action.parameters.delay as number;
    
    if (file && caption) {
      const imagePath = `/assets/images/${file}`;
      
      if (delay) {
        // Queue delayed photo as player message
        setTimeout(() => {
          this.addMessage(
            contactName,
            caption,
            true, // isFromPlayer = true
            'photo',
            imagePath,
            caption
          );
        }, delay);
      } else {
        // Send immediately as player message
        this.addMessage(
          contactName,
          caption,
          true, // isFromPlayer = true
          'photo',
          imagePath,
          caption
        );
      }
    }
  }

  private handleEmbeddedDelayedMessage(action: Action, contactName: string): void {
    const message = action.parameters.message as string;
    const delay = action.parameters.delay as number || 0;
    
    if (message) {
      if (delay) {
        // Queue delayed message as player message
        setTimeout(() => {
          this.addMessage(contactName, message, true); // isFromPlayer = true
        }, delay);
      } else {
        // Send immediately as player message
        this.addMessage(contactName, message, true); // isFromPlayer = true
      }
    }
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
      // Silent error handling
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
        
        // Sync delayConfig with the loaded state
        this.delayConfig.globalTypingDelay = this.state.typingDelays.global;
      } else {
        // Initialize with a default typing delay if no saved state
        this.state.typingDelays.global = 2000; // Default to 2 seconds
        this.delayConfig.globalTypingDelay = this.state.typingDelays.global;
      }
    } catch (error) {
      // Silent error handling
    }
  }

  resetGame(): void {
    // Clear all state
    this.state = this.initializeState();
    
    // Clear localStorage
    localStorage.removeItem('sms_game_state');
    
    // Clear pending operations
    // this.pendingUnlockContact = null; // Removed
    // this.pendingEndThread = false; // Removed
    // this.pendingEndThreadShowMessage = false; // Removed
    // this.pendingDropPin = null; // Removed
    
    // Clear active typing indicators
    // this.activeTypingIndicators.clear(); // Removed
    
    // Ensure variables are reset to initial state from gameData
    this.state.variables = { ...this.gameData.variables };
    
    // Trigger events to update UI
    const unlockedContacts = Array.from(this.state.unlockedContacts);
    if (unlockedContacts.length > 0) {
      const firstContact = unlockedContacts[0];
      this.events.onContactUnlocked(firstContact);
      
      // Don't automatically add initial message - let the UI handle it when contact is selected
    }
    
    // Clear notifications
    this.state.notifications = [];
  }

  updateGameData(newGameData: GameData): void {
    this.gameData = newGameData;
    // Preserve current state but update variables
    this.state.variables = { ...newGameData.variables, ...this.state.variables };
  }

  // Test method to manually trigger an action
  testAction(actionType: string, parameters: Record<string, any>): void {
    
    // Convert to QueuedAction and execute with unified system
    const queuedAction: QueuedAction = {
      type: actionType,
      parameters,
      delay: parameters.delay || 0,
      priority: actionType === 'end_thread' ? 1000 : 0,
      contactName: 'test',
      isResponseTriggered: this.isResponseTriggeredAction(actionType)
    };
    
    // For delayed_message actions, we need to queue them properly with typing indicator
    if (actionType === 'delayed_message') {
      const actionDelay = this.delayConfig.globalTypingDelay + queuedAction.delay;
      
      // Only show typing indicator if there's a global delay
      if (this.delayConfig.globalTypingDelay > 0) {
        // Add typing indicator before the delayed message
        this.queueMessage({
          type: 'typing',
          content: { contactName: 'test' },
          delay: actionDelay - this.delayConfig.typingIndicatorDuration,
          contactName: 'test',
          priority: queuedAction.priority - 1
        });
      }
      
      // Add the delayed message
      this.queueMessage({
        type: 'action',
        content: queuedAction,
        delay: actionDelay,
        contactName: 'test',
        priority: queuedAction.priority
      });
      
      // Start processing the queue
      this.processMessageQueue();
    } else {
      // For other actions, execute directly
      this.executeUnifiedAction(queuedAction);
    }
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

  // Essential methods that are still needed
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

  addMessage(
    contactName: string,
    text: string,
    isFromPlayer: boolean,
    type: 'text' | 'photo' | 'video' | 'location' | 'typing' | 'unlock_contact' | 'end_thread' = 'text',
    mediaUrl?: string,
    caption?: string,
    location?: Message['location'],
    unlockedContactName?: string,
    timestamp?: number // Added timestamp parameter
  ): void {
    const message: Message = {
      id: `${contactName}-${Date.now()}-${Math.random()}`,
      contactName,
      text,
      timestamp: timestamp || Date.now(), // Use provided timestamp or current
      isFromPlayer,
      type,
      mediaUrl,
      caption,
      location,
      read: false,
      unlockedContactName,
      // New enhanced properties
      image: mediaUrl,
      mediaType: type === 'photo' ? 'photo' : type === 'video' ? 'video' : type === 'location' ? 'location' : undefined,
      isLocationPin: type === 'location',
      locationPin: location ? { location: location.name, description: location.description } : undefined,
      isThreadEnded: type === 'end_thread'
    };

    if (type === 'location') {
      // Location message created successfully
    }

    if (!this.state.messageHistory[contactName]) {
      this.state.messageHistory[contactName] = [];
    }

    this.state.messageHistory[contactName].push(message);
    this.events.onMessageAdded(message);
    this.saveGameState();
  }

  getContactMessages(contactName: string): Message[] {
    return this.state.messageHistory[contactName] || [];
  }

  getUnlockedContacts(): string[] {
    return Array.from(this.state.unlockedContacts);
  }

  getContactData(contactName: string): Contact | null {
    const normalizedName = this.normalizeContactName(contactName);
    return this.gameData.contacts[normalizedName] || null;
  }

  getContactState(contactName: string): 'active' | 'locked' | 'ended' {
    return this.state.threadStates[contactName] || 'locked';
  }

  getCurrentRound(contactName: string): string {
    return this.state.currentRounds[contactName] || '1.0';
  }

  getCurrentRoundData(contactName: string): Round | null {
    const contact = this.getContactData(contactName);
    if (!contact) return null;

    const currentRound = this.getCurrentRound(contactName);
    const round = contact.rounds[currentRound];
    
    if (!round) return null;

    // Re-parse the round with current variables
    return this.reparseRoundWithVariables(round, contactName);
  }

  public reparseRoundWithVariables(round: Round, contactName: string): Round {
    const reparsedRound: Round = JSON.parse(JSON.stringify(round));
    const tempParser = new TweeParser();
    tempParser.setVariables(this.state.variables);

    let passageToEvaluate = reparsedRound.passage && reparsedRound.passage.trim().length > 0
      ? reparsedRound.passage
      : reparsedRound.originalContent || '';

    let processedPassage = this.replaceVariablesInText(passageToEvaluate, contactName);
    processedPassage = tempParser.evaluateConditionalContent(processedPassage, this.state.variables);
    reparsedRound.passage = processedPassage;

    // After conditional evaluation, re-parse the passage to extract choices
    // Only re-parse if the original choices array is empty (for conditional rounds)
    if (!reparsedRound.choices || reparsedRound.choices.length === 0) {
      const tempChoicesParser = new TweeParser();
      const { choices } = tempChoicesParser.parseRoundContent(processedPassage);
      reparsedRound.choices = choices;
    }

    if (reparsedRound.choices) {
      reparsedRound.choices = reparsedRound.choices.map(choice => {
        let processedText = this.replaceVariablesInText(choice.text, contactName);
        processedText = tempParser.evaluateConditionalContent(processedText, this.state.variables);
        return {
          ...choice,
          text: processedText
        };
      });
    }
    return reparsedRound;
  }

  private replaceVariablesInText(text: string, contactName: string): string {
    return text.replace(/\{\{(\w+)\}\}/g, (match, variableName) => {
      const value = this.state.variables[variableName];
      return value !== undefined ? String(value) : match;
    });
  }

  getVariable(name: string): any {
    return this.state.variables[name];
  }

  setVariable(name: string, value: any): void {
    this.state.variables[name] = value;
    this.events.onVariableChanged(name, value);
    this.saveGameState();
  }

  resetVariable(name: string): void {
    delete this.state.variables[name];
    this.events.onVariableChanged(name, undefined);
    this.saveGameState();
  }

  triggerConditionalThreadUnlock(): void {
    this.unlockConditionalThreads();
  }

  private unlockConditionalThreads(): void {
    for (const contactName in this.gameData.contacts) {
      const contact = this.gameData.contacts[contactName];
      if (this.state.threadStates[contactName] === 'ended') {
        // Check if this contact has any conditional .0 rounds
        const conditionalRounds = Object.keys(contact.rounds).filter(roundKey => 
          roundKey.endsWith('.0') && contact.rounds[roundKey]
        );

        for (const roundKey of conditionalRounds) {
          const round = contact.rounds[roundKey];
          const reparsedRound = this.reparseRoundWithVariables(round, contactName);
          
          // If the reparsed round has content, unlock the thread
          if (reparsedRound.passage && reparsedRound.passage.trim().length > 0) {
            this.state.threadStates[contactName] = 'active';
            break;
          }
        }
      }
    }
  }

  unlockContact(contactName: string): void {
    if (!this.state.unlockedContacts.has(contactName)) {
      this.state.unlockedContacts.add(contactName);
      // Ensure newly unlocked contacts start on round 1.0
      if (!this.state.currentRounds[contactName]) {
        this.state.currentRounds[contactName] = "1.0";
      }
      
      // Set thread state to active for newly unlocked contacts
      this.state.threadStates[contactName] = "active";
      
      // Initialize empty message history for the newly unlocked contact
      if (!this.state.messageHistory[contactName]) {
        this.state.messageHistory[contactName] = [];
      }
      
      this.events.onContactUnlocked(contactName);
      this.events.onThreadStateChanged(contactName, 'active');
      this.saveGameState();
    } else {
      // Contact already unlocked
    }
  }

  private getPastTimestamp(): number {
    // Generate a timestamp that's in the past (1 hour ago)
    return Date.now() - (60 * 60 * 1000);
  }
}

