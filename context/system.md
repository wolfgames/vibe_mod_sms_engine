# **Game System Context for Mini-Game Development**

## **1\. High-Level Overview**

This document provides the necessary context for developing a mini-game module that runs within a larger, parent game application. The system is designed around a central **Parent Application** that manages the overall game state and narrative flow, and one or more **Child Mini-Games** that are loaded dynamically to provide interactive experiences.

* **Parent Application**: A web-based application that renders the main game interface. It contains a core **Game Engine** that manages state and logic.  
* **Child Mini-Game**: An independent web application (in this case, a Next.js app) that is loaded into an \<iframe\> within the Parent Application.  
* **Communication Layer**: A shared package, wolfy-module-kit, facilitates all communication between the Parent and the Child Mini-Game.

The primary goal for a mini-game developer is to create a child application that can communicate effectively with the parent system using the provided wolfy-module-kit.

## **2\. The Parent System Architecture**

The parent system consists of three main parts: the core game engine, a narrative scripting parser, and a component that renders the mini-game.

### **2.1. Core Game Engine (engine.ts)**

* **Purpose**: The central brain of the game. It is responsible for managing the entire game state.  
* **State Management**: The engine's state is primarily managed through **"Aspects"**. An Aspect is a key-value pair representing a piece of game data (e.g., player score, a viewed item, a character's status).  
* **Event-Driven**: The engine operates on an event-based system. Actions in the game (like a player clicking a button or a mini-game finishing) raise events, which the engine processes to update Aspects and trigger new actions.

### **2.2. Narrative Scripting and its Impact on Mini-Games**

* **Purpose**: The game's narrative, logic, and flow are defined in **Twine**.  
* **Parsing**: A parser (map-twine-structure-to-triggers.ts) reads the Twine script and translates its commands into actions and triggers for the Game Engine.  
* **What a Mini-Game Developer Needs to Know**: While you will not write Twine code, you need to know that the Twine script is where the following are defined for your mini-game:  
  * **Action Map (actions)**: This is an object that maps human-readable action names (like "done", "success") to unique IDs. Your mini-game will receive this map and must use these names to tell the parent which outcome occurred.  
  * **Aspect Permissions (aspectPermissions)**: This object defines which game state variables (Aspects) your mini-game is allowed to read or modify. For example, { "PlayerScore": "read-write", "GameProgress": "read-only" }.  
  * **Module Operations**: The Twine script can trigger commands ($executeModuleOperation) to be sent to your running mini-game at any time.

### **2.3. The Vibe Component (vibe.component.tsx)**

* **Purpose**: The front-end component that hosts the child mini-game's \<iframe\>.  
* **Communication Hub**: Initializes the parent-side of the communication channel (createParentCommunicator) and is responsible for relaying data between the Game Engine and the child mini-game.

## **3\. Communication: The wolfy-module-kit**

This shared library is the key to parent-child interaction. It provides the SDK for initializing the module and the communicator for handling the message-passing.

### **3.1. The Module SDK (sdk.ts)**

The primary entry point for any child mini-game is the initModule function from the SDK. It streamlines the entire setup process.

* initModule(options): This function performs several key startup tasks:  
  1. Parses the config parameter from the mini-game's URL.  
  2. Validates the parsed configuration against a schema provided by the developer.  
  3. Creates and initializes the ChildModuleCommunicator.  
  4. Returns the communicator instance, a resultHandler function, and the validated config object.

### **3.2. The Child Communicator (child.ts)**

The communicator object returned by initModule is the interface for all communication with the parent.

**Key communicator Methods:**

* sendReady(): Signals to the parent that the child is loaded and ready to receive initialization data.  
* onOperation(callback): Registers a callback function that will be executed whenever the parent sends a command via ($executeModuleOperation). The operation data from the parent is passed to the callback.  
* onAspectUpdate(callback): Registers a callback that fires when an Aspect the child has permission to read is changed in the parent's Game Engine. The callback receives the key (name) and value of the updated Aspect.  
* requestAspectValueChange(key, value): Sends a request to the parent to update an Aspect. This will only succeed if the child has "read-write" permission for that Aspect.  
* sendResult(result): Sends the final result payload to the parent. This is typically handled by the resultHandler from the SDK.

### **3.3. Communication Lifecycle**

1. **Initialization**: The child mini-game calls initModule.  
2. **Ready Signal**: After its own setup is complete, the child calls communicator.sendReady().  
3. **Parent Response**: The parent receives the Ready signal and sends back an Init message. This message contains the moduleUid, the actions map, and the aspectPermissions defined in the Twine script. The initCallback provided to initModule is invoked with this data.  
4. **Ongoing Communication**: The parent can now send Operation and AspectUpdate messages. The child listens for these using the onOperation and onAspectUpdate methods.  
5. **Completion**: When the mini-game is finished, it calls the resultHandler (returned from initModule), which formats and sends the final result to the parent using communicator.sendResult().

### **3.4. Key Data Types**

* **CommEvent (enum)**: Defines the type property for all messages, such as Ready, Init, ExecuteOperation, AspectValueChange, RequestAspectValueChange, and Done.  
* **AspectPermissions**: An object mapping Aspect names to their permission level ('read-only' or 'read-write'). This is received during initialization.  
* **ModuleResult**: The object sent back to the parent upon completion. It includes a type ("attempt" or "choice"), a data value (e.g., 1 for success on an attempt, or an index for a choice), and an optional array of actions.  
* **BaseConfig**: The basic configuration object that all mini-games receive, containing replayAbility, expectedResultType, and integrationType. Mini-games can extend this with their own specific configuration properties.

## **4\. Mini-Game Template Architecture**

The provided mini-game template is a Next.js application structured into two main parts: a configuration editor and the game itself.

* **Editor (/ route)**: This is the home page of the mini-game URL. It displays a ConfigForm component that allows a game designer to set various properties for the mini-game. When the form is submitted, it generates a URL with the configuration encoded in the query string (e.g., /game?config=...) and navigates to it.  
* **Game (/game route)**: This page contains the actual mini-game, rendered by component.tsx. It reads the configuration from the URL, initializes communication with the parent application, and runs the game logic.

## **5\. Rules for LLM Developers**

To safely modify the mini-game template, you must follow these rules. This ensures the core communication logic remains intact and the module continues to function within the parent system.

### **Rule 1: Respect "Frozen" Regions**

In many files, you will see code comments marking "frozen" regions:

// region Frozen  
...  
// endregion Frozen

**DO NOT modify or delete any code within these regions.** This code handles the critical low-level communication and initialization with the parent system. All your changes should be made *outside* of these blocks.

### **Rule 2: Modifying Game Logic**

The primary file for implementing game logic and UI is **component.tsx**.

* **Add State**: You can add new React state using useState to manage the game's internal state (e.g., player position, score, timer).  
* **Create UI**: You can add new JSX elements within the return statement to build the game's interface.  
* **Handle User Input**: Add onClick, onChange, etc., handlers to your UI elements to call game logic functions.

### **Rule 3: Adding New Configuration Options**

To add a new setting that a game designer can tweak in the editor:

1. **system/configuration.ts**: Add the new property to the moduleConfiguration Zod schema.  
   // system/configuration.ts  
   const moduleConfiguration \= z.object({  
     resultAction: AppActionsSchema,  
     gameTitle: z.string(), // \<-- ADD NEW CONFIG PROPERTY HERE  
   });

2. **components/ConfigForm/formFields.ts**: Add a new entry to the FORM\_FIELDS array to create a UI control for the new setting.  
   // components/ConfigForm/formFields.ts  
   export const FORM\_FIELDS: FormFieldConfig\[\] \= \[  
     // ... existing fields  
     { // \<-- ADD NEW FORM FIELD CONFIGURATION HERE  
       key: "gameTitle",  
       label: "Game Title",  
       type: "text",  
       placeholder: "Enter the title for the game",  
       required: true,  
     },  
   \];

3. **Use the config in component.tsx**: The new configuration will be available in the config state object.  
   // component.tsx  
   // ...  
   return (  
       // ...  
       \<h1 className="text-2xl font-bold mb-4"\>{config.gameTitle}\</h1\>  
       // ...  
   );

### **Rule 4: Adding New Result Actions**

Result actions are the outcomes a mini-game can send back to the parent (e.g., "done", "success", "failure").

1. **system/actions.ts**: Add the new action to the CustomActions enum.  
   // system/actions.ts  
   enum CustomActions {  
     CustomAction \= 'custom-action',  
     Success \= 'success', // \<-- ADD NEW ACTION HERE  
     Failure \= 'failure', // \<-- ADD NEW ACTION HERE  
   }

2. **system/result-interpretation.ts**: In the interpretResult function, add logic to determine when to trigger your new action. You can use the incoming config or the resultData from your game logic.  
   // system/result-interpretation.ts  
   export function interpretResult(/\*...\*/) {  
     // ... (Frozen region)  
     let actionToTrigger \= BaseActions.Done  
     // ... (Frozen region)

     // YOUR LOGIC HERE  
     if (config.expectedResultType \=== ModuleResultType.Attempt) {  
       if (resultData \=== 'player\_won') {  
         actionToTrigger \= CustomActions.Success;  
       } else {  
         actionToTrigger \= CustomActions.Failure;  
       }  
     }  
     // ...  
   }

### **Rule 5: Adding New Operations from the Parent**

Operations are commands sent *from* the parent *to* the running mini-game.

1. **system/operation.ts**:  
   * Add a new type to the ModuleOperationType enum.  
   * Create a new Zod schema for the shape of the operation's data.  
   * Add the new schema to the generateOperationSchema call.

// system/operation.ts  
export enum ModuleOperationType {  
  SET\_TITLE \= 'SET\_TITLE',  
  SHOW\_HINT \= 'SHOW\_HINT', // \<-- ADD NEW OPERATION TYPE  
}

// ... (setTitleOperation schema)

// ADD NEW OPERATION SCHEMA HERE  
const showHintOperation \= z.object({  
  type: z.literal(ModuleOperationType.SHOW\_HINT),  
  hintText: z.string(),  
});

export const moduleOperation \= generateOperationSchema(  
  setTitleOperation,  
  showHintOperation // \<-- ADD SCHEMA TO FUNCTION CALL  
);

2. **component.tsx**: Add logic to the useEffect hook that listens to lastOperation to handle the new operation.  
   // component.tsx  
   const \[hint, setHint\] \= useState(''); // Example state for the hint

   useEffect(() \=\> {  
     if (\!lastOperation) return;

     if (lastOperation.type \=== ModuleOperationType.SET\_TITLE) {  
       setTitle(lastOperation.value);  
     } else if (lastOperation.type \=== ModuleOperationType.SHOW\_HINT) {  
       // HANDLE NEW OPERATION HERE  
       setHint(lastOperation.hintText);  
     } else {  
       console.warn('Unknown operation type:', lastOperation.type);  
     }  
   }, \[lastOperation\]);  