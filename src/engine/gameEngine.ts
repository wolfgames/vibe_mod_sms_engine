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
  private pendingEndThreadShowMessage: boolean = false;
  private pendingDropPin: { contactName: string; location: string; description: string; file: string } | null = null;
  private pendingResponses: Set<string> = new Set();
  private specialMessagesProcessed: boolean = false;
  
  // Centralized typing indicator management
  private activeTypingIndicators: Set<string> = new Set(); // Track active typing indicators by contact

  // Helper methods for centralized typing indicator management
  private addTypingIndicator(contactName: string): boolean {
    // Only add if no typing indicator is already active for this contact
    if (this.activeTypingIndicators.has(contactName)) {
      return false; // Already has typing indicator
    }
    
    this.activeTypingIndicators.add(contactName);
    this.addMessage(contactName, '', false, 'typing');
    return true;
  }

  private removeTypingIndicator(contactName: string): void {
    if (this.activeTypingIndicators.has(contactName)) {
      this.activeTypingIndicators.delete(contactName);
      
      // Remove typing indicator from message history
      const messages = this.state.messageHistory[contactName] || [];
      const typingMessage = messages.find(msg => msg.type === 'typing');
      if (typingMessage) {
        this.state.messageHistory[contactName] = messages.filter(msg => msg.id !== typingMessage.id);
      }
    }
  }

  private hasTypingIndicator(contactName: string): boolean {
    return this.activeTypingIndicators.has(contactName);
  }

  constructor(gameData: GameData, events: GameEngineEvents) {
    this.gameData = gameData;
    this.events = events;
    
    this.state = this.initializeState();
    this.loadGameState();
  }

  private initializeState(): GameState {
    const initialState: GameState = {
      currentRounds: {},
      variables: {},
      threadStates: {},
      messageHistory: {},
      unlockedContacts: new Set(),
      viewedContacts: new Set(),
      typingDelays: {},
      gameStartTime: Date.now(),
      notifications: []
    };

    // Process initial contacts and set up initial state
    const unlockedContacts: string[] = [];
    
    console.log('DEBUG: Available contacts:', Object.keys(this.gameData.contacts));
    
    for (const [contactName, contact] of Object.entries(this.gameData.contacts)) {
      console.log(`DEBUG: Checking contact ${contactName}:`, contact.unlocked);
      if (contact.unlocked) {
        unlockedContacts.push(contactName);
        console.log(`DEBUG: Added ${contactName} to unlocked contacts`);
      }
    }

    console.log('DEBUG: Unlocked contacts found:', unlockedContacts);

    if (unlockedContacts.length > 0) {
      // Add all unlocked contacts to the Set
      unlockedContacts.forEach(contactName => {
        initialState.unlockedContacts.add(contactName);
      });
      
      // Ensure Sarah is processed first if she exists
      let firstContact = unlockedContacts[0];
      if (unlockedContacts.includes('Sarah')) {
        firstContact = 'Sarah';
      }
      
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
    
    // Execute actions from the target round
    if (targetRound.actions && targetRound.actions.length > 0) {
      this.executeActions(targetRound.actions, contactName);
    }
    
    // Update current round
    this.state.currentRounds[contactName] = finalRoundNumber;
    
    // Queue response message if there's a passage
    if (targetRound.passage) {
      this.queueResponseMessage(contactName, targetRound.passage);
    } else {
      // If no passage, still process pending actions to ensure round advances properly
      this.processPendingActions(contactName);
    }
    
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

  executeActions(actions: Action[], contactName?: string): void {
    // Process actions in sequence to maintain proper timing
    this.processActionsSequentially(actions, contactName, 0);
  }

  private processActionsSequentially(actions: Action[], contactName?: string, currentDelay: number = 0): void {
    if (actions.length === 0) {
      // All actions processed, start processing pending actions
      if (contactName) {
        this.processPendingActions(contactName);
      }
      return;
    }

    const action = actions[0];
    const remainingActions = actions.slice(1);

    this.events.onActionExecuted(action);

    switch (action.type) {
      case 'unlock_contact':
        this.handleUnlockContact(action);
        // Don't schedule the message here - it will be handled after the reply appears
        this.processActionsSequentially(remainingActions, contactName, currentDelay);
        break;
      case 'end_thread':
        this.handleEndThread(action);
        // Don't schedule the message here - it will be handled after the reply appears
        this.processActionsSequentially(remainingActions, contactName, currentDelay);
        break;
      case 'drop_pin':
        this.handleDropPin(action, contactName);
        // Don't schedule the message here - it will be handled after the reply appears
        this.processActionsSequentially(remainingActions, contactName, currentDelay);
        break;
      case 'send_photo':
        this.handleSendPhotoImmediate(action, contactName, currentDelay);
        this.processActionsSequentially(remainingActions, contactName, currentDelay);
        break;
      case 'delayed_message':
        this.handleDelayedMessageSequential(action, contactName, currentDelay);
        const messageDelay = action.parameters.delay as number || 0;
        this.processActionsSequentially(remainingActions, contactName, currentDelay + messageDelay);
        break;
      case 'set_variable':
        this.handleSetVariable(action);
        this.processActionsSequentially(remainingActions, contactName, currentDelay);
        break;
      case 'call_911':
        this.handleCall911(action);
        this.processActionsSequentially(remainingActions, contactName, currentDelay);
        break;
      case 'open_thread':
        this.handleOpenThread(action);
        this.processActionsSequentially(remainingActions, contactName, currentDelay);
        break;
      case 'trigger_eli_needs_code':
        this.handleTriggerEliNeedsCode(action);
        this.processActionsSequentially(remainingActions, contactName, currentDelay);
        break;
      case 'typing_indicator':
        this.handleTypingIndicator(action);
        this.processActionsSequentially(remainingActions, contactName, currentDelay);
        break;
      case 'set_typing_delay':
        this.handleSetTypingDelay(action);
        this.processActionsSequentially(remainingActions, contactName, currentDelay);
        break;
      case 'show_notification':
        this.handleShowNotification(action);
        this.processActionsSequentially(remainingActions, contactName, currentDelay);
        break;
      case 'vibrate':
        this.handleVibrate(action);
        this.processActionsSequentially(remainingActions, contactName, currentDelay);
        break;
      case 'set_contact_status':
        this.handleSetContactStatus(action);
        this.processActionsSequentially(remainingActions, contactName, currentDelay);
        break;
      case 'trigger_emergency_call':
        this.handleTriggerEmergencyCall(action);
        this.processActionsSequentially(remainingActions, contactName, currentDelay);
        break;
      case 'add_chat_history':
        this.handleAddChatHistory(action, contactName);
        this.processActionsSequentially(remainingActions, contactName, currentDelay);
        break;
      default:
        this.processActionsSequentially(remainingActions, contactName, currentDelay);
        break;
    }
  }

  private handleDelayedMessageSequential(action: Action, contactName?: string, currentDelay: number = 0): void {
    const message = action.parameters.message as string;
    const delay = action.parameters.delay as number || 0;
    const character = action.parameters.character as string;
    
    if (message) {
      const contactNameToUse = contactName || character || this.getCurrentContactFromAction(action);
      
      if (contactNameToUse) {
        // Schedule the message with typing indicator
        setTimeout(() => {
          // Add typing indicator using centralized system
          this.addTypingIndicator(contactNameToUse);
          
          // Remove typing indicator and add message after 400ms
          setTimeout(() => {
            this.removeTypingIndicator(contactNameToUse);
            
            // Add the actual message
            this.addMessage(
              contactNameToUse,
              message,
              false
            );
          }, 400); // 400ms typing indicator duration
        }, currentDelay);
      }
    }
  }

  private normalizeContactName(contactName: string): string {
    // Handle known contact name mismatches
    const contactMappings: Record<string, string> = {
      'Maya Delgado': 'Maya',
      'Eli Mercer': 'Eli'
    };
    
    return contactMappings[contactName] || contactName;
  }

  private handleUnlockContact(action: Action): void {
    let contactToUnlock: string;
    
    // Handle different parameter formats
    if (action.parameters.contactName) {
      contactToUnlock = action.parameters.contactName as string;
    } else if (action.parameters.character) {
      contactToUnlock = action.parameters.character as string;
    } else {
      return;
    }
    
    if (contactToUnlock) {
      // Normalize the contact name to match script definitions
      const normalizedContactName = this.normalizeContactName(contactToUnlock);
      
      // Actually unlock the contact in the game state
      this.unlockContact(normalizedContactName);
      
      // Store the normalized contact to unlock - it will be queued after the response appears
      this.pendingUnlockContact = normalizedContactName;
      // Dispatch event for UI updates
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('character-unlocked', {
          detail: { character: normalizedContactName }
        }));
      }
    }
  }

  private handleEndThread(action: Action): void {
    const contactName = this.getCurrentContactFromAction(action);
    if (contactName) {
      // Only execute end_thread if the thread is not already locked
      // AND if it wasn't just unlocked in this same action sequence
      if (this.state.threadStates[contactName] !== 'locked') {
        // Check if this thread was just unlocked in the current action sequence
        // by looking at the current round - if it's a .0 round, it was just unlocked
        const currentRound = this.state.currentRounds[contactName];
        const isJustUnlocked = currentRound && currentRound.endsWith('.0');
        
        if (!isJustUnlocked) {
          this.state.threadStates[contactName] = 'locked';
          this.events.onThreadStateChanged(contactName, 'locked');
          
          // Parse the parameter to determine if we should show the end message
          // end_thread:0 = no message, end_thread:1 = show message
          const showMessage = action.parameters.showMessage !== undefined ? Boolean(action.parameters.showMessage) : true;
          
          // Set flag to add end thread message after response (only if showMessage is true)
          this.pendingEndThread = true;
          this.pendingEndThreadShowMessage = showMessage;
        }
      }
    }
  }

  private handleDropPin(action: Action, contactName?: string): void {
    const location = action.parameters.location as string;
    const description = action.parameters.description as string;
    const file = action.parameters.file as string;
    const character = action.parameters.character as string;
    
    if (location && description) {
      const contactNameToUse = contactName || character || this.getCurrentContactFromAction(action);
      
      if (contactNameToUse) {
        // Store the drop pin to be added after the response message
        this.pendingDropPin = {
          contactName: contactNameToUse,
          location: location,
          description: description,
          file: file
        };
        
        // Add notification
        this.addNotification({
          type: 'location_added',
          title: 'Location Added',
          message: `New location: ${location}`,
          contactName: contactNameToUse,
          timestamp: Date.now()
        });
      }
    }
  }

  private handleSendPhoto(action: Action, contactName?: string): void {
    const file = action.parameters.file as string;
    const caption = action.parameters.caption as string;
    const character = action.parameters.character as string;
    
    if (file && caption) {
      const contactNameToUse = contactName || character || this.getCurrentContactFromAction(action);
      
      if (contactNameToUse) {
        // Use the correct path for images in assets/images directory
        const imagePath = `/assets/images/${file}`;
        
        // Process photo immediately - it will appear after the current message sequence
        // We'll add it to the pending photos with a minimal delay to ensure it appears after the current message
        // This logic is now handled by handleSendPhotoImmediate
      }
    }
  }

  private handleSendPhotoImmediate(action: Action, contactName?: string, currentDelay: number = 0): void {
    const file = action.parameters.file as string;
    const caption = action.parameters.caption as string;
    const character = action.parameters.character as string;
    const delay = action.parameters.delay as number || 0; // Added delay parameter from action

    if (file && caption) {
      const contactNameToUse = contactName || character || this.getCurrentContactFromAction(action);

      if (contactNameToUse) {
        const imagePath = `/assets/images/${file}`;

        // Schedule the photo to appear after the current delay plus the action's delay parameter
        setTimeout(() => {
          this.addMessage(
            contactNameToUse,
            caption,
            false,
            'photo',
            imagePath,
            caption
          );
        }, currentDelay + delay);
      }
    }
  }

  private handleSetVariable(action: Action): void {
    const variableName = action.parameters.variableName as string;
    const variableValue = action.parameters.variableValue;
    
    if (variableName && variableValue !== undefined) {
      this.setVariable(variableName, variableValue);
      
      // Dispatch variable change event
      this.events.onVariableChanged(variableName, variableValue);
      
      // Check if any new conditional threads should be unlocked
      this.unlockConditionalThreads();
    }
  }

  private unlockConditionalThreads(): void {
    // Scan all contacts for conditional .0 rounds that might now be unlocked due to variable changes
    for (const [contactName, contact] of Object.entries(this.gameData.contacts)) {
      // Check all contacts, not just unlocked ones, since we want to unlock them if conditions are met

      // Find conditional .0 rounds for this contact
      // Now we keep the full round format (e.g., "5.0", "6.0")
      for (const [roundKey, round] of Object.entries(contact.rounds)) {
        // Only check rounds that end with .0 (conditional rounds)
        // This filters out .1, .2, .3 sub-rounds
        if (!roundKey.endsWith('.0')) {
          continue;
        }
        
        // Skip Round 1.0 for conditional unlocking - we want the actual conditional rounds
        if (roundKey === '1.0') {
          continue;
        }
        
        // Re-parse the round with current variables to see if it's now visible
        const reparsedRound = this.reparseRoundWithVariables(round, contactName);
        
        // If the reparsed round has content (passage or choices), it means the conditional is now true
        const hasContent = (reparsedRound.passage && reparsedRound.passage.trim()) || 
                         (reparsedRound.choices && reparsedRound.choices.length > 0);
        
        if (hasContent) {
          // This round is now unlocked due to conditional being true
          // Check if this is a higher round than the current one
          const currentRound = this.state.currentRounds[contactName];
          // Parse round numbers, handling both "6" and "6.0" formats
          const currentRoundNum = parseFloat(currentRound);
          const newRoundNum = parseFloat(roundKey);
          
          // Unlock if this is a higher round number OR if the thread is currently locked
          const shouldUnlock = newRoundNum > currentRoundNum || this.state.threadStates[contactName] === 'locked';
          
          if (shouldUnlock) {
            // Add contact to unlocked contacts if not already there
            if (!this.state.unlockedContacts.has(contactName)) {
              this.state.unlockedContacts.add(contactName);
            }
            
            // Set thread state to active since we're unlocking a new round
            this.state.threadStates[contactName] = 'active';
            
            // Remove any thread-ended messages from the conversation history when unlocking
            const messages = this.state.messageHistory[contactName] || [];
            let removedCount = 0;
            const filteredMessages = messages.filter(msg => {
              // Remove messages that are marked as thread ended OR have the specific end thread text
              if (msg.isThreadEnded || msg.text === 'The Conversation Has Ended') {
                removedCount++;
                return false; // Remove this message
              }
              return true; // Keep this message
            });
            this.state.messageHistory[contactName] = filteredMessages;
            
            this.saveGameState();
            
            // Trigger UI update events
            this.events.onThreadStateChanged(contactName, 'active');
            this.events.onContactUnlocked(contactName);
            
            // Update the current round AFTER triggering events to avoid re-processing
            this.state.currentRounds[contactName] = roundKey;
          }
        }
      }
    }
  }

  private handleCall911(action: Action): void {
    this.triggerEmergencyCall();
  }

  private handleOpenThread(action: Action): void {
    const character = action.parameters.character as string;
    
    if (character) {
      const normalizedContactName = this.normalizeContactName(character);
      
      if (this.state.threadStates[normalizedContactName] === 'locked') {
        this.state.threadStates[normalizedContactName] = 'active';
        
        // Remove from viewedContacts so blue dot will appear
        this.state.viewedContacts.delete(normalizedContactName);
        
        // Add initial message when thread is unlocked
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
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('thread-unlocked', {
            detail: { character: normalizedContactName }
          }));
        }
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

  private handleAddChatHistory(action: Action, contactName?: string): void {
    const targetContact = contactName || this.getCurrentContactFromAction(action);
    if (!targetContact) return;

    // Get past timestamp for chat history (messages should appear as if they happened in the past)
    const pastTimestamp = this.getPastTimestamp();

    // Handle contact messages
    if (action.parameters.contact) {
      const contactMessages = (action.parameters.contact as string).split('|');
      contactMessages.forEach((message, index) => {
        const timestamp = pastTimestamp - (index * 5 * 60 * 1000); // 5 minutes apart
        this.addMessage(
          targetContact,
          message.trim(),
          false, // isFromPlayer = false (contact message)
          'text',
          undefined,
          undefined,
          undefined,
          undefined,
          timestamp
        );
      });
    }

    // Handle player messages
    if (action.parameters.player) {
      const playerMessages = (action.parameters.player as string).split('|');
      playerMessages.forEach((message, index) => {
        const timestamp = pastTimestamp - (index * 5 * 60 * 1000) - (2.5 * 60 * 1000); // Between contact messages
        this.addMessage(
          targetContact,
          message.trim(),
          true, // isFromPlayer = true (player message)
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

  private getPastTimestamp(): number {
    // Generate a timestamp that's in the past (1 hour ago)
    return Date.now() - (60 * 60 * 1000);
  }

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
    
    // Add typing indicator using centralized system
    if (this.addTypingIndicator(contactName)) {
      // Remove typing indicator after the specified duration
      setTimeout(() => {
        this.removeTypingIndicator(contactName);
      }, duration);
    }
  }

  private queueResponseMessage(contactName: string, responseText: string): void {
    const delay = this.state.typingDelays[contactName] || this.state.typingDelays.global || 1000;
    
    if (delay > 0) {
      // Add typing indicator using centralized system
      this.addTypingIndicator(contactName);
      
      // Schedule the response after the delay
      setTimeout(() => {
        // Remove typing indicator using centralized system
        this.removeTypingIndicator(contactName);
        
        // Add the response message
        this.addMessage(contactName, responseText, false);
        this.pendingResponses.delete(contactName);
        
        // Process special messages after the reply message is added
        this.processSpecialMessages(contactName);
        
        // Process pending actions in sequence
        this.processPendingActions(contactName);
      }, delay);
    } else {
      // No delay - add response immediately
      this.addMessage(contactName, responseText, false);
      this.pendingResponses.delete(contactName);
      
      // Process special messages after the reply message is added
      this.processSpecialMessages(contactName);
      
      // Process pending actions in sequence
      this.processPendingActions(contactName);
    }
  }

  private processSpecialMessages(contactName: string): void {
    // Process any pending unlock contact
    if (this.pendingUnlockContact) {
      this.unlockContact(this.pendingUnlockContact);
      
      // Add the unlock contact message after the global typing delay
      setTimeout(() => {
        this.addMessage(
          contactName,
          `New Contact: ${this.pendingUnlockContact}`,
          false,
          'unlock_contact',
          undefined,
          undefined,
          undefined,
          this.pendingUnlockContact
        );
        this.pendingUnlockContact = null;
      }, this.getGlobalTypingDelay());
    }

    // Process any pending end thread message
    if (this.pendingEndThread && this.pendingEndThreadShowMessage) {
      setTimeout(() => {
        this.addMessage(
          contactName,
          'The Conversation Has Ended',
          false,
          'end_thread'
        );
        this.pendingEndThread = false;
        this.pendingEndThreadShowMessage = false;
      }, this.getGlobalTypingDelay());
    }

    // Process any pending drop pin
    if (this.pendingDropPin && this.pendingDropPin.contactName === contactName) {
      // Add the drop pin message after the global typing delay
      setTimeout(() => {
        this.addMessage(
          this.pendingDropPin.contactName,
          this.pendingDropPin.description,
          false,
          'location',
          undefined,
          undefined,
          {
            name: this.pendingDropPin.location,
            description: this.pendingDropPin.description,
            mapFile: this.pendingDropPin.file
          }
        );
        this.pendingDropPin = null;
      }, this.getGlobalTypingDelay());
    }
  }

  private processPendingActions(contactName: string): void {
    // Process any pending end thread
    if (this.pendingEndThread) {
      this.state.threadStates[contactName] = 'ended';
      this.events.onThreadStateChanged(contactName, 'ended');
      this.pendingEndThread = false;
      this.pendingEndThreadShowMessage = false;
    }

    // No pending actions, trigger UI update to show new choices
    this.events.onMessageAdded({
      id: `round_update_${Date.now()}`,
      contactName: contactName,
      text: '',
      timestamp: Date.now(),
      isFromPlayer: false,
      type: 'text',
      read: false
    });
  }

  private processRemainingPendingActions(contactName: string): void {
    // Delayed messages are now handled in the new sequential system
    // Only process end thread if pending
    if (this.pendingEndThread) {
      setTimeout(() => {
        if (this.pendingEndThreadShowMessage) {
          this.addMessage(
            contactName,
            'The Conversation Has Ended',
            false,
            'end_thread'
          );
        }
        this.pendingEndThread = false;
        this.pendingEndThreadShowMessage = false;
      }, 500);
    } else {
      // No pending actions, trigger UI update to show new choices
      this.events.onMessageAdded({
        id: `round_update_${Date.now()}`,
        contactName: contactName,
        text: '',
        timestamp: Date.now(),
        isFromPlayer: false,
        type: 'text',
        read: false
      });
    }
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
    return delay !== undefined ? delay : 1000; // Default to 1000ms if not set
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
        this.handleSetVariable(action);
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
    // Normalize the contact name to handle mismatches
    const normalizedContactName = this.normalizeContactName(contactName);
    
    // First try the normalized name
    if (this.gameData.contacts[normalizedContactName]) {
      return this.gameData.contacts[normalizedContactName];
    }
    
    // If not found, try the original name
    if (this.gameData.contacts[contactName]) {
      return this.gameData.contacts[contactName];
    }
    
    // If not in gameData but is unlocked, return null to prevent empty bubbles
    // The contact should be properly defined in the Twee script
    return null;
  }

  getContactState(contactName: string): 'active' | 'locked' | 'ended' {
    return this.state.threadStates[contactName] || 'active';
  }

  getCurrentRound(contactName: string): string {
    return this.state.currentRounds[contactName] || '1.0';
  }

  getCurrentRoundData(contactName: string): Round | null {
    const contact = this.getContactData(contactName);
    if (!contact) return null;

    const currentRoundKey = this.getCurrentRound(contactName);
    
    const round = contact.rounds[currentRoundKey];
    
    if (!round) {
      return null;
    }
    
    // Re-parse the round with current variables for conditional evaluation
    return this.reparseRoundWithVariables(round, contactName);
  }

  private reparseRoundWithVariables(round: Round, contactName: string): Round {
    // Create a temporary parser with current variables
    const tempParser = new TweeParser();
    tempParser.setVariables(this.state.variables);
    
    // Use the original content with conditionals if available
    let fullContent = '';
    if (round.originalContent) {
      fullContent = round.originalContent;
    } else {
      // Fallback: reconstruct the content from parsed data
      if (round.passage) {
        fullContent += round.passage + '\n';
      }
      
      // Add actions
      if (round.actions) {
        for (const action of round.actions) {
          fullContent += `[Action: ${action.type}:${JSON.stringify(action.parameters)}]\n`;
        }
      }
      
      // Add choices with conditionals
      if (round.choices) {
        for (const choice of round.choices) {
          let choiceText = choice.text;
          if (choice.embeddedAction) {
            choiceText += ` [Action: ${choice.embeddedAction.type}:${JSON.stringify(choice.embeddedAction.parameters)}]`;
          }
          fullContent += `[[${choiceText}|${choice.targetRound}]]\n`;
        }
      }
    }
    
    // First evaluate conditional content with current variables
    const evaluatedContent = tempParser.evaluateConditionalContent(fullContent, this.state.variables);
    
    // Then parse the evaluated content
    const { passage, actions, choices } = tempParser.parseRoundContent(evaluatedContent);
    
    return {
      ...round,
      passage,
      actions: actions.length > 0 ? actions : round.actions, // fallback to original actions if none found
      choices
    };
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
    if (this.state.variables[name] !== undefined) {
      delete this.state.variables[name];
      this.events.onVariableChanged(name, undefined);
      this.saveGameState();
    }
  }

  // Public method to manually trigger conditional thread unlocking (for debugging)
  triggerConditionalThreadUnlock(): void {
    this.unlockConditionalThreads();
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
      } else {
        // Initialize with a default typing delay if no saved state
        this.state.typingDelays.global = 2000; // Default to 2 seconds
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
    this.pendingUnlockContact = null;
    this.pendingEndThread = false;
    this.pendingEndThreadShowMessage = false;
    this.pendingDropPin = null;
    
    // Clear active typing indicators
    this.activeTypingIndicators.clear();
    
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
    const action: Action = {
      type: actionType as any,
      parameters
    };
    this.executeActions([action]);
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

