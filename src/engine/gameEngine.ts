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
  private pendingDelayedMessages: Array<{ contactName: string; message: string; delay: number }> = [];
  private pendingResponses: Set<string> = new Set();
  private pendingDelayedPhotos: Array<{ contactName: string; caption: string; imagePath: string; delay: number }> = [];

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
    }

    return initialState;
  }

  // Core game functions
  processChoice(contactName: string, choiceIndex: number): void {
    const contactData = this.getContactData(contactName);
    if (!contactData) {
      return;
    }

    const currentRound = this.state.currentRounds[contactName];
    if (!currentRound) {
      return;
    }
    
    const round = contactData.rounds[currentRound];
    if (!round || !round.choices || choiceIndex >= round.choices.length) {
      return;
    }

    const choice = round.choices[choiceIndex];
    
    // Add player message first
    this.addMessage(contactName, choice.text, true);

    // Execute embedded action if present - as a player action
    if (choice.embeddedAction) {
      this.executeEmbeddedAction(choice.embeddedAction, contactName);
    }

    // Extract target round number from the target round name
    const targetRoundName = choice.targetRound;
    const roundMatch = targetRoundName.match(/(?:[^-]+)-Round-(\d+(?:\.\d+)?)/);
    if (roundMatch) {
      const roundNumber = roundMatch[1];
      // Keep the full round number format
      const finalRoundNumber = roundNumber;
      
      // Update current round
      this.state.currentRounds[contactName] = finalRoundNumber;
      this.saveGameState();
      
      // Get the target round and process its response
      const targetRound = contactData.rounds[finalRoundNumber];
      if (targetRound) {
        // Execute actions from the target round
        if (targetRound.actions && targetRound.actions.length > 0) {
          this.executeActions(targetRound.actions, contactName);
        }
        
        // Queue the response message
        if (targetRound.passage && targetRound.passage.trim()) {
          this.queueResponseMessage(contactName, targetRound.passage);
        }
      }
    }
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
    for (const action of actions) {
      this.executeAction(action, contactName);
    }
  }

  private executeAction(action: Action, contactName?: string): void {
    this.events.onActionExecuted(action);

    switch (action.type) {
      case 'unlock_contact':
        this.handleUnlockContact(action);
        break;
      case 'end_thread':
        this.handleEndThread(action);
        break;
      case 'drop_pin':
        this.handleDropPin(action, contactName);
        break;
      case 'send_photo':
        this.handleSendPhoto(action, contactName);
        break;
      case 'delayed_message':
        this.handleDelayedMessage(action, contactName);
        break;
      case 'set_variable':
        this.handleSetVariable(action);
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
      console.warn('unlock_contact action missing contact name');
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
      if (this.state.threadStates[contactName] !== 'locked') {
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
    const delay = action.parameters.delay as number;
    const character = action.parameters.character as string;
    
    if (file && caption) {
      const contactNameToUse = contactName || character || this.getCurrentContactFromAction(action);
      
      if (contactNameToUse) {
        // Use the correct path for images in assets/images directory
        const imagePath = `/assets/images/${file}`;
        
        if (delay) {
          // Store the delayed photo to be added after the response message
          this.pendingDelayedPhotos.push({
            contactName: contactNameToUse,
            caption: caption,
            imagePath: imagePath,
            delay: delay
          });
        } else {
          // Send immediately
          this.addMessage(
            contactNameToUse,
            caption,
            false,
            'photo',
            imagePath,
            caption
          );
        }
      }
    }
  }

  private handleDelayedMessage(action: Action, contactName?: string): void {
    const message = action.parameters.message as string;
    const delay = action.parameters.delay as number || 0;
    const character = action.parameters.character as string;
    
    if (message) {
      const contactNameToUse = contactName || character || this.getCurrentContactFromAction(action);
      
      if (contactNameToUse) {
        // Store the delayed message to be added after the response message
        this.pendingDelayedMessages.push({
          contactName: contactNameToUse,
          message: message,
          delay: delay
        });
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
    
    setTimeout(() => {
      this.addMessage(contactName, '', false, 'typing');
    }, duration);
  }

  private queueResponseMessage(contactName: string, responseText: string): void {
    const delay = this.getGlobalTypingDelay();
    
    // Mark that we have a pending response for this contact
    this.pendingResponses.add(contactName);
    
    // Add typing indicator first
    setTimeout(() => {
      this.addMessage(contactName, '', false, 'typing');
      
      // Then add the actual response after a short delay
      setTimeout(() => {
        // Remove the typing indicator by replacing it with the actual message
        const messages = this.state.messageHistory[contactName] || [];
        if (messages.length > 0 && messages[messages.length - 1].type === 'typing') {
          messages.pop(); // Remove the typing indicator
        }
        
        // Add the response message
        this.addMessage(contactName, responseText, false);
        this.pendingResponses.delete(contactName);
        
        // Process pending actions in sequence
        this.processPendingActions(contactName);
      }, 1000); // Show typing for 1 second before response
    }, delay);
  }

  private processPendingActions(contactName: string): void {
    // Process unlock contact first
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
        
        // Continue processing other pending actions
        this.processRemainingPendingActions(contactName);
      }, 1000);
    } else if (this.pendingDropPin && this.pendingDropPin.contactName === contactName) {
      setTimeout(() => {
        if (this.pendingDropPin) { // Add null check
          this.addMessage(
            this.pendingDropPin.contactName,
            this.pendingDropPin.location,
            false,
            'location',
            undefined, // mediaUrl - not needed for location
            undefined, // caption - not needed for location
            {
              name: this.pendingDropPin.location,
              description: this.pendingDropPin.description,
              mapFile: this.pendingDropPin.file
            }
          );
          this.pendingDropPin = null;
        }
        
        // Continue processing other pending actions
        this.processRemainingPendingActions(contactName);
      }, 1000);
    } else {
      // No unlock contact or drop pin, process remaining actions
      this.processRemainingPendingActions(contactName);
    }
  }

  private processRemainingPendingActions(contactName: string): void {
    // Process delayed messages and photos
    if (this.pendingDelayedMessages.length > 0 || this.pendingDelayedPhotos.length > 0) {
      this.processNextDelayedAction(contactName);
    } else {
      // If there's a pending end thread, add it after unlock contact
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
      }
    }
  }

  private processNextDelayedAction(contactName: string): void {
    if (this.pendingDelayedMessages.length === 0 && this.pendingDelayedPhotos.length === 0) {
      // No more delayed actions, process end thread if pending
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
      }
      return;
    }

    // Determine which action to process next (message or photo)
    let nextAction: any = null;
    let isPhoto = false;

    if (this.pendingDelayedMessages.length > 0 && this.pendingDelayedPhotos.length > 0) {
      // Both have actions, choose the one with the shorter delay
      const nextMessage = this.pendingDelayedMessages[0];
      const nextPhoto = this.pendingDelayedPhotos[0];
      
      if (nextMessage.delay <= nextPhoto.delay) {
        nextAction = nextMessage;
        isPhoto = false;
      } else {
        nextAction = nextPhoto;
        isPhoto = true;
      }
    } else if (this.pendingDelayedMessages.length > 0) {
      nextAction = this.pendingDelayedMessages[0];
      isPhoto = false;
    } else {
      nextAction = this.pendingDelayedPhotos[0];
      isPhoto = true;
    }
    
    // Add typing indicator before the delayed message/photo
    this.addMessage(
      nextAction.contactName,
      '',
      false,
      'typing'
    );
    
    setTimeout(() => {
      // Remove typing indicator
      const messages = this.state.messageHistory[nextAction.contactName] || [];
      const typingMessage = messages.find(msg => msg.type === 'typing');
      if (typingMessage) {
        this.state.messageHistory[nextAction.contactName] = messages.filter(msg => msg.id !== typingMessage.id);
        this.events.onMessageAdded(typingMessage); // Trigger UI update
      }
      
      if (isPhoto) {
        // Process delayed photo
        this.addMessage(
          nextAction.contactName,
          nextAction.caption,
          false,
          'photo',
          nextAction.imagePath,
          nextAction.caption
        );
        this.pendingDelayedPhotos.shift(); // Remove the processed photo
      } else {
        // Process delayed message
        this.addMessage(
          nextAction.contactName,
          nextAction.message,
          false
        );
        this.pendingDelayedMessages.shift(); // Remove the processed message
      }
      
      // Process the next delayed action
      this.processNextDelayedAction(contactName);
    }, nextAction.delay);
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
        // For other actions, just execute normally
        this.executeAction(action, contactName);
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
    unlockedContactName?: string
  ): void {
    const message: Message = {
      id: `${contactName}-${Date.now()}-${Math.random()}`,
      contactName,
      text,
      timestamp: Date.now(),
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
      passage,
      actions,
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
    // Clear all state
    this.state = this.initializeState();
    
    // Clear localStorage
    localStorage.removeItem('sms_game_state');
    
    // Clear pending operations
    this.pendingUnlockContact = null;
    this.pendingEndThread = false;
    this.pendingEndThreadShowMessage = false;
    this.pendingDropPin = null;
    this.pendingDelayedMessages = []; // Clear pending delayed messages
    this.pendingResponses.clear();
    this.pendingDelayedPhotos = []; // Clear pending delayed photos
    
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
