# Game System Context for Mini-Game Development

## 1. High-Level Overview

This document provides the necessary context for developing a mini-game module that runs within a larger, parent game application. The system is designed around a central Parent Application that manages the overall game state and narrative flow, and one or more Child Mini-Games that are loaded dynamically to provide interactive experiences.

- **Parent Application**: A web-based application that renders the main game interface. It contains a core Game Engine that manages state and logic.
- **Child Mini-Game**: An independent web application (in this case, a Next.js app) that is loaded into an `<iframe>` within the Parent Application.
- **Communication Layer**: A shared package, `wolfy-module-kit`, facilitates all communication between the Parent and the Child Mini-Game.

The primary goal for a mini-game developer is to create a child application that can communicate effectively with the parent system using the provided `wolfy-module-kit`.

## 2. The Parent System Architecture

The parent system consists of three main parts: the core game engine, a narrative scripting parser, and a component that renders the mini-game.

### 2.1. Core Game Engine (`engine.ts`)

- **Purpose**: The central brain of the game. It is responsible for managing the entire game state.
- **State Management**: The engine's state is primarily managed through "Aspects". An Aspect is a key-value pair representing a piece of game data (e.g., player score, a viewed item, a character's status).
- **Event-Driven**: The engine operates on an event-based system. Actions in the game (like a player clicking a button or a mini-game finishing) raise events, which the engine processes to update Aspects and trigger new actions.

### 2.2. Narrative Scripting and its Impact on Mini-Games

- **Purpose**: The game's narrative, logic, and flow are defined in Twine.
- **Parsing**: A parser (`map-twine-structure-to-triggers.ts`) reads the Twine script and translates its commands into actions and triggers for the Game Engine.

**What a Mini-Game Developer Needs to Know**: While you will not write Twine code, you need to know that the Twine script is where the following are defined for your mini-game:

- **Action Map** (`actions`): This is an object that maps human-readable action names (like "done", "success") to unique IDs. Your mini-game will receive this map and must use these names to tell the parent which outcome occurred.
- **Aspect Permissions** (`aspectPermissions`): This object defines which game state variables (Aspects) your mini-game is allowed to read or modify. For example, `{ "PlayerScore": "read-write", "GameProgress": "read-only" }`.
- **Module Operations**: The Twine script can trigger commands (`$executeModuleOperation`) to be sent to your running mini-game at any time.

### 2.3. The Vibe Component (`vibe.component.tsx`)

- **Purpose**: The front-end component that hosts the child mini-game's `<iframe>`.
- **Communication Hub**: Initializes the parent-side of the communication channel (`createParentCommunicator`) and is responsible for relaying data between the Game Engine and the child mini-game.

## 3. Communication: The wolfy-module-kit

This shared library is the key to parent-child interaction. It provides the SDK for initializing the module and the communicator for handling the message-passing.

### 3.1. The Module SDK

The primary entry point for any child mini-game is the `initModule` function from the SDK. It streamlines the entire setup process.

**`initModule(options)`**: This function performs several key startup tasks:
- Parses the config parameter from the mini-game's URL.
- Validates the parsed configuration against a schema provided by the developer.
- Creates and initializes the ChildModuleCommunicator.
- Returns the communicator instance, a resultHandler function, and the validated config object.

### 3.2. The Child Communicator

The communicator object returned by `initModule` is the interface for all communication with the parent.

**Key communicator Methods**:
- `communicator.sendReady()`: Signals to the parent that the child is loaded and ready to receive initialization data.
- `communicator.onOperation(callback)`: Registers a callback function that will be executed whenever the parent sends a command via (`$executeModuleOperation`). The operation data from the parent is passed to the callback.
- `communicator.onAspectUpdate(callback)`: Registers a callback that fires when an Aspect the child has permission to read is changed in the parent's Game Engine. The callback receives the key (name) and value of the updated Aspect.
- `communicator.requestAspectValueChange(key, value)`: Sends a request to the parent to update an Aspect. This will only succeed if the child has "read-write" permission for that Aspect.
- `communicator.sendResult(result)`: Sends the final result payload to the parent. This is typically handled by the resultHandler from the SDK.

### 3.3. Communication Lifecycle

1. **Initialization**: The child mini-game calls `initModule`.
2. **Ready Signal**: After its own setup is complete, the child calls `communicator.sendReady()`.
3. **Parent Response**: The parent receives the Ready signal and sends back an Init message. This message contains the `moduleUid`, the `actions` map, and the `aspectPermissions` defined in the Twine script. The `initCallback` provided to `initModule` is invoked with this data.
4. **Ongoing Communication**: The parent can now send Operation and AspectUpdate messages. The child listens for these using the `onOperation` and `onAspectUpdate` methods.
5. **Completion**: When the mini-game is finished, it calls the `resultHandler` (returned from `initModule`), which formats and sends the final result to the parent using `communicator.sendResult()`.

### 3.4. Key Data Types

- **CommEvent** (enum): Defines the type property for all messages, such as Ready, Init, ExecuteOperation, AspectValueChange, RequestAspectValueChange, and Done.
- **AspectPermissions**: An object mapping Aspect names to their permission level ('read-only' or 'read-write'). This is received during initialization.
- **ModuleResult**: The object sent back to the parent upon completion. It includes a type ("attempt" or "choice"), a data value (e.g., 1 for success on an attempt, or an index for a choice), and an optional array of actions.
- **BaseConfig**: The basic configuration object that all mini-games receive, containing `replayAbility`, `expectedResultType`, and `integrationType`. Mini-games can extend this with their own specific configuration properties.

## 4. Mini-Game Template Architecture

The provided mini-game template is a Next.js application structured into two main parts: a configuration editor and the game itself.

### 4.1. Application Structure

- **Editor** ([`app/page.tsx`](app/page.tsx)): This is the home page of the mini-game URL. It displays a ConfigForm component that allows a game designer to set various properties for the mini-game. When the form is submitted, it generates a URL with the configuration encoded in the query string (e.g., `/game?config=...`) and navigates to it.
- **Game** ([`app/game/page.tsx`](app/game/page.tsx)): This page contains the actual mini-game, rendered by [`component.tsx`](system/component.tsx). It reads the configuration from the URL, initializes communication with the parent application, and runs the game logic.

### 4.2. System Files Overview

The `system/` directory contains the core files that handle communication, configuration, and game logic:

- **[`component.tsx`](system/component.tsx)**: The main game component with React hooks for state management and communication
- **[`configuration.ts`](system/configuration.ts)**: Zod schema definitions for module configuration
- **[`actions.ts`](system/actions.ts)**: Defines custom actions the module can trigger
- **[`operation.ts`](system/operation.ts)**: Defines operations that can be sent from parent to child
- **[`result-interpretation.ts`](system/result-interpretation.ts)**: Logic for interpreting game results and determining actions
- **[`origins.ts`](system/origins.ts)**: Configuration for allowed parent origins (security)

### 4.3. Configuration System

The configuration system uses three main files:

1. **[`system/configuration.ts`](system/configuration.ts)**: Defines the Zod schema for module configuration
2. **[`components/ConfigForm/formFields.ts`](components/ConfigForm/formFields.ts)**: Defines the form fields for the configuration editor
3. **[`components/ConfigForm/ConfigForm.tsx`](components/ConfigForm/ConfigForm.tsx)**: Generic form component that renders configuration UI

The configuration flow:
1. Designer visits the root URL (`/`)
2. Fills out the configuration form
3. Form generates encoded config URL
4. Navigates to `/game?config=...` with the configuration
5. Game component reads and validates the configuration
6. Game initializes with the provided settings

## 5. Detailed System Architecture

### 5.1. The Main Game Component ([`system/component.tsx`](system/component.tsx))

This is the heart of your mini-game. It contains both frozen regions (communication logic) and modifiable areas (game logic).

#### Frozen Regions in component.tsx

**Import Section**:
```typescript
// DO NOT MODIFY FROZEN REGION BELOW
// region Frozen
import moduleConfig, { type ModuleConfig } from './configuration';
import { ModuleOperation, ModuleOperationType } from './operation';
import { originConfig } from './origins';
import { interpretResult } from './result-interpretation';
// endregion Frozen
```

**State Initialization**:
```typescript
// DO NOT MODIFY FROZEN REGION BELOW
// region Frozen
const [moduleCommunicator, setModuleCommunicator] = useState<ChildModuleCommunicator | null>(null);
const [resultHandler, setResultHandler] = useState<((payload: ResultPayload<ModuleConfig>) => void) | null>(null);
const [config, setConfig] = useState<ModuleConfig | null>(null);
const [moduleUid, setModuleUid] = useState<string | null>(null)

const [actions, setActions] = useState<ActionMap>({})
const [aspectsPermissions, setAspectsPermissions] = useState<AspectPermissions>({});
const [lastOperation, setLastOperation] = useState<ModuleOperation | null>(null);
// endregion Frozen
```

**Module Initialization**:

```typescript
// DO NOT MODIFY FROZEN REGION BELOW
// region Frozen
useEffect(() => {
  let communicator: ChildModuleCommunicator | null = null;
  try {
    let currentAspectPermissions: AspectPermissions = {};

    const initCallback = (uid: string, actions: ActionMap, aspects: AspectPermissions) => {
      setModuleUid(uid)
      setActions(actions)
      setAspectsPermissions(aspects)
      currentAspectPermissions = aspects;
    };

    const handleAspectUpdate = (key: string, value: any) => {
      if (currentAspectPermissions && key in currentAspectPermissions) {
        console.log(`✅ Aspect updated: ${key} =`, value);
        setAspects(prev => ({ ...prev, [key]: value }));
      } else {
        console.warn(`🚨 Ignored aspect update for "${key}". Not in permitted aspects for this module.`);
      }
    };
  
    const handleOperation = (operation: ModuleOperation) => {
      setLastOperation(operation);
    };

    const {
      communicator: effectCommunicator,
      resultHandler,
      config
    } = initModule({
      window,
      initCallback,
      configSchema: moduleConfig,
      interpretResult,
      originConfig,
    });

    communicator = effectCommunicator;

    communicator.onOperation(handleOperation);
    communicator.onAspectUpdate(handleAspectUpdate);

    communicator.sendReady();

    setModuleCommunicator(communicator);
    setResultHandler(() => resultHandler);
    setConfig(config);
  }
  catch (error) {
    console.error('Error initializing module:', error);
  }

  return () => {
    communicator?.cleanup()
  }
}, []);
// endregion Frozen
```

#### Modifiable Areas in component.tsx

**Custom State**:
```typescript
// state affected by operations
const [title, setTitle] = useState<string>("Module Template");

// aspects record
const [aspects, setAspects] = useState<Record<string, any>>({});
```
*You can add your own state variables here for game logic.*

**Operation Handling**:
```typescript
useEffect(() => {
  if (!lastOperation) {
    return;
  }

  // Custom operations logic
  if (lastOperation.type === ModuleOperationType.SET_TITLE) {
    setTitle(lastOperation.value);
  } else {
    console.warn('Unknown operation type:', lastOperation.type);
  }
}, [lastOperation]);
```
*Add your custom operation handling logic here.*

**Game Logic Functions**:
```typescript
const requestAspectChange = useCallback((aspectToChange: string, valueToSet: any) => {
  if (!moduleCommunicator || !aspectsPermissions) return;

  if (aspectsPermissions[aspectToChange] === AspectPermissionType.ReadWrite) {
    moduleCommunicator.requestAspectValueChange(aspectToChange, valueToSet);
  } else {
    console.log(`Module does not have write permission for aspect: ${aspectToChange}`);
  }
}, [moduleCommunicator, aspectsPermissions]);

const reportExecutionResult = useCallback(() => {
  if (!resultHandler || !config || !moduleCommunicator || !actions) {
    const missingComponents = [];
    if (!resultHandler) missingComponents.push('Result handler');
    if (!config) missingComponents.push('Config');
    if (!moduleCommunicator) missingComponents.push('Communicator');
    if (!actions) missingComponents.push('Actions');
    console.error(`The following components are not initialized: ${missingComponents.join(', ')}`);
    return;
  }

  if (config.expectedResultType === ModuleResultType.Attempt) {
    resultHandler({
      data: 1,
      config,
      actions
    });
  }

  if (config.expectedResultType === ModuleResultType.Choice) {
    resultHandler({
      data: 0,
      config,
      actions
    });
  }
}, [actions, config, resultHandler, moduleCommunicator]);
```
*Add your custom game logic functions here.*

**UI Rendering**:
```typescript
return (
  <div className="w-full h-full flex items-center justify-center relative">
    {config ? (
      <div className="text-center max-w-2xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6 text-gray-800">{title}</h1>
        
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-700">Module Template</h2>
            <p className="text-gray-600 mb-4">
              This is a template mini-game module. Replace this content with your game implementation.
            </p>
            <p className="text-sm text-gray-500">
              Expected result type: <span className="font-mono bg-gray-100 px-2 py-1 rounded">{config.expectedResultType}</span>
            </p>
          </div>

          <div className="space-y-4">
            <button
              className="w-full px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
              onClick={reportExecutionResult}
            >
              Complete Module
            </button>
            
          </div>
        </div>
      </div>
    ) : (
      <div className="flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <span className="ml-3 text-gray-600">Loading module...</span>
      </div>
    )}

  </div>
);
```
*Replace the main content area with your game UI.*

### 5.2. Configuration System

#### Configuration Schema ([`system/configuration.ts`](system/configuration.ts))

**Modifiable Section**:
```typescript
const moduleConfiguration = z.object({
  resultAction: AppActionsSchema,
  // ADD NEW CONFIG PROPERTIES HERE
});
```

**Frozen Section**:
```typescript
// region Generated
export const DEFAULT_CONFIG: ConfigFormData = {
  replayAbility: ModuleReplayAbility.Once,
  expectedResultType: ModuleResultType.Attempt,
  integrationType: ModuleIntegrationType.Standalone,
  resultAction: BaseActions.Done
}
// endregion Generated
```

#### Form Fields ([`components/ConfigForm/formFields.ts`](components/ConfigForm/formFields.ts))

**Modifiable Section**:
```typescript
export const FORM_FIELDS: FormFieldConfig[] = [
  {
    key: "resultAction",
    label: "Module Result Action",
    type: "select",
    options: [AppActionsSchema.enum.Done, AppActionsSchema.enum.CustomAction],
    required: true,
  },
  {
    key: 'expectedResultType',
    label: 'Expected Result Type',
    type: 'select',
    options: Object.values(ModuleResultType) as string[],
    required: true,
  },
  // ADD NEW FORM FIELDS HERE
]
```

### 5.3. Actions System ([`system/actions.ts`](system/actions.ts))

**Modifiable Section**:
```typescript
enum CustomActions {
  // add custom module actions here
  CustomAction = 'custom-action'
  // ADD MORE ACTIONS HERE
}
```

**Frozen Section**:
```typescript
// DO NOT MODIFY FROZEN REGION BELOW
// region Frozen
export const AppActionsSchema = z.nativeEnum({
  ...BaseActions,
  ...CustomActions,
} as const);

export type AppActions = z.TypeOf<typeof AppActionsSchema>;
// endregion Frozen
```

### 5.4. Operations System ([`system/operation.ts`](system/operation.ts))

**Modifiable Sections**:
```typescript
export enum ModuleOperationType {
  SET_TITLE = 'SET_TITLE',
  // Add other operation types here as needed
}

const setTitleOperation = z.object({
  type: z.literal(ModuleOperationType.SET_TITLE),
  value: z.string(),
});

// ADD NEW OPERATION SCHEMAS HERE

export const moduleOperation = generateOperationSchema(
  setTitleOperation,
  // Add other operations here
);
```

### 5.5. Result Interpretation ([`system/result-interpretation.ts`](system/result-interpretation.ts))

**Frozen Sections**:
```typescript
// DO NOT MODIFY FROZEN REGION BELOW
// region Frozen
export interface CustomModuleResult {
  data?: any,
  actions: string[],
  type: ModuleResultType
}
// endregion Frozen

// DO NOT MODIFY FROZEN REGION BELOW
// region Frozen
let actionToTrigger = BaseActions.Done
// endregion Frozen

// DO NOT MODIFY FROZEN REGION BELOW
// region Frozen
const actionUid = actions?.[actionToTrigger];

if (!actionUid) {
  throw new Error(`Action key "${actionToTrigger}" not found in config.actions map.`)
}

return {
  type: config.expectedResultType,
  data: resultData,
  actions: [actionUid]
};
// endregion Frozen
```

**Modifiable Section**:
```typescript
// Example:
// if (config.expectedResultType === ModuleResultType.Attempt) {
//   actionToTrigger = BaseActions.AnotherAction
// }
// ADD YOUR RESULT INTERPRETATION LOGIC HERE
```

### 5.6. Origins Configuration ([`system/origins.ts`](system/origins.ts))

**Modifiable Section**:
```typescript
const customOriginConfig: OriginConfig = {
  allowedOrigins: [
    // locals
    "http://localhost:9005",
    "http://localhost:9007",
    "http://localhost:3000",

    // qa
    "https://public-eye-qa.casescope.com",
    "https://casemaker-qa.casescope.com",
    
    // production
    "https://public-eye.casescope.com",
    "https://casemaker.casescope.com"
    // ADD MORE ALLOWED ORIGINS HERE
  ]
};
```

**Frozen Section**:
```typescript
// DO NOT MODIFY FROZEN REGION BELOW
// region Frozen
export const originConfig: OriginConfig = {
  ...DEFAULT_ORIGIN_CONFIG,
  ...customOriginConfig
};
// endregion Frozen
```

## 6. Rules for LLM Developers

To safely modify the mini-game template, you must follow these rules. This ensures the core communication logic remains intact and the module continues to function within the parent system.

### Rule 1: Respect "Frozen" Regions

**DO NOT** modify or delete any code within frozen regions marked with:

```typescript
// DO NOT MODIFY FROZEN REGION BELOW
// region Frozen
...
// endregion Frozen
```

These regions handle critical communication and initialization logic.

### Rule 2: Modifying Game Logic

The primary file for implementing game logic and UI is [`component.tsx`](system/component.tsx).

- **Add State**: You can add new React state using `useState` to manage the game's internal state (e.g., player position, score, timer).
- **Create UI**: You can add new JSX elements within the return statement to build the game's interface.
- **Handle User Input**: Add `onClick`, `onChange`, etc., handlers to your UI elements to call game logic functions.

### Rule 3: Adding New Configuration Options

To add a new setting that a game designer can tweak in the editor:

1. **[`system/configuration.ts`](system/configuration.ts)**: Add the new property to the `moduleConfiguration` Zod schema.

```typescript
// system/configuration.ts
const moduleConfiguration = z.object({
  resultAction: AppActionsSchema,
  gameTitle: z.string(), // <-- ADD NEW CONFIG PROPERTY HERE
});
```

2. **[`components/ConfigForm/formFields.ts`](components/ConfigForm/formFields.ts)**: Add a new entry to the `FORM_FIELDS` array to create a UI control for the new setting.

```typescript
// components/ConfigForm/formFields.ts
export const FORM_FIELDS: FormFieldConfig[] = [
  // ... existing fields
  { // <-- ADD NEW FORM FIELD CONFIGURATION HERE
    key: "gameTitle",
    label: "Game Title",
    type: "text",
    placeholder: "Enter the title for the game",
    required: true,
  },
];
```

3. **Use the config in [`component.tsx`](system/component.tsx)**: The new configuration will be available in the config state object.

```typescript
// component.tsx
// ...
return (
    // ...
    <h1 className="text-2xl font-bold mb-4">{config.gameTitle}</h1>
    // ...
);
```

### Rule 4: Adding New Result Actions

Result actions are the outcomes a mini-game can send back to the parent (e.g., "done", "success", "failure").

1. **[`system/actions.ts`](system/actions.ts)**: Add the new action to the `CustomActions` enum.

```typescript
// system/actions.ts
enum CustomActions {
  CustomAction = 'custom-action',// <-- ADD NEW ACTION HERE
}
```

2. **[`system/result-interpretation.ts`](system/result-interpretation.ts)**: In the `interpretResult` function, add logic to determine when to trigger your new action. You can use the incoming config or the resultData from your game logic.

```typescript
// system/result-interpretation.ts
export function interpretResult(/*...*/) {
  // ... (Frozen region)
  let actionToTrigger = BaseActions.Done
  // ... (Frozen region)

  // YOUR LOGIC HERE
  if (config.expectedResultType === ModuleResultType.Attempt) {
    if (resultData === 'player_won') {
      actionToTrigger = CustomActions.Success;
    } else {
      actionToTrigger = CustomActions.Failure;
    }
  }
  // ...
}
```

### Rule 5: Adding New Operations from the Parent

Operations are commands sent from the parent to the running mini-game.

1. **[`system/operation.ts`](system/operation.ts)**:
   - Add a new type to the `ModuleOperationType` enum.
   - Create a new Zod schema for the shape of the operation's data.
   - Add the new schema to the `generateOperationSchema` call.

```typescript
// system/operation.ts
export enum ModuleOperationType {
  SET_TITLE = 'SET_TITLE',
  SHOW_HINT = 'SHOW_HINT', // <-- ADD NEW OPERATION TYPE
}

// ... (setTitleOperation schema)

// ADD NEW OPERATION SCHEMA HERE
const showHintOperation = z.object({
  type: z.literal(ModuleOperationType.SHOW_HINT),
  hintText: z.string(),
});

export const moduleOperation = generateOperationSchema(
  setTitleOperation,
  showHintOperation // <-- ADD SCHEMA TO FUNCTION CALL
);
```

2. **[`component.tsx`](system/component.tsx)**: Add logic to the `useEffect` hook that listens to `lastOperation` to handle the new operation.

```typescript
// component.tsx
const [hint, setHint] = useState(''); // Example state for the hint

useEffect(() => {
  if (!lastOperation) return;

  if (lastOperation.type === ModuleOperationType.SET_TITLE) {
    setTitle(lastOperation.value);
  } else if (lastOperation.type === ModuleOperationType.SHOW_HINT) {
    // HANDLE NEW OPERATION HERE
    setHint(lastOperation.hintText);
  } else {
    console.warn('Unknown operation type:', lastOperation.type);
  }
}, [lastOperation]);
```

## 7. Practical Development Examples

### 7.1. Complete Game Implementation Example

Here's a complete example of implementing a simple number guessing game:

#### Step 1: Add Game Configuration
```typescript
// system/configuration.ts
const moduleConfiguration = z.object({
  resultAction: AppActionsSchema,
  maxNumber: z.number().min(10).max(1000).default(100),
  maxAttempts: z.number().min(1).max(20).default(5),
  gameTitle: z.string().min(1).default("Number Guessing Game"),
});
```

#### Step 2: Add Form Fields
```typescript
// components/ConfigForm/formFields.ts
export const FORM_FIELDS: FormFieldConfig[] = [
  {
    key: "resultAction",
    label: "Module Result Action",
    type: "select",
    options: [AppActionsSchema.enum.Done, AppActionsSchema.enum.CustomAction],
    required: true,
  },
  {
    key: 'expectedResultType',
    label: 'Expected Result Type',
    type: 'select',
    options: Object.values(ModuleResultType) as string[],
    required: true,
  },
  {
    key: "gameTitle",
    label: "Game Title",
    type: "text",
    placeholder: "Enter game title",
    required: true,
  },
  {
    key: "maxNumber",
    label: "Maximum Number",
    type: "number",
    min: 10,
    max: 1000,
    required: true,
  },
  {
    key: "maxAttempts",
    label: "Maximum Attempts",
    type: "number",
    min: 1,
    max: 20,
    required: true,
  },
];
```

#### Step 3: Add Custom Actions
```typescript
// system/actions.ts
enum CustomActions {
  CustomAction = 'custom-action',
  Won = 'won',
  Lost = 'lost',
  GaveUp = 'gave-up',
}
```

#### Step 4: Implement Game Logic
```typescript
// system/component.tsx - Add after the existing state declarations
const [targetNumber, setTargetNumber] = useState<number>(0);
const [currentGuess, setCurrentGuess] = useState<string>('');
const [attempts, setAttempts] = useState<number>(0);
const [gameStatus, setGameStatus] = useState<'playing' | 'won' | 'lost' | 'gave-up'>('playing');
const [feedback, setFeedback] = useState<string>('');
const [guessHistory, setGuessHistory] = useState<number[]>([]);

// Initialize game when config is available
useEffect(() => {
  if (config && gameStatus === 'playing' && targetNumber === 0) {
    const newTarget = Math.floor(Math.random() * (config.maxNumber || 100)) + 1;
    setTargetNumber(newTarget);
    setFeedback(`Guess a number between 1 and ${config.maxNumber || 100}!`);
  }
}, [config, gameStatus, targetNumber]);

// Game logic functions
const makeGuess = useCallback(() => {
  if (!config || gameStatus !== 'playing') return;
  
  const guess = parseInt(currentGuess);
  if (isNaN(guess) || guess < 1 || guess > (config.maxNumber || 100)) {
    setFeedback(`Please enter a number between 1 and ${config.maxNumber || 100}`);
    return;
  }

  const newAttempts = attempts + 1;
  setAttempts(newAttempts);
  setGuessHistory(prev => [...prev, guess]);
  setCurrentGuess('');

  if (guess === targetNumber) {
    setGameStatus('won');
    setFeedback(`🎉 Congratulations! You guessed ${targetNumber} in ${newAttempts} attempts!`);
    endGame('won', newAttempts);
  } else if (newAttempts >= (config.maxAttempts || 5)) {
    setGameStatus('lost');
    setFeedback(`😞 Game over! The number was ${targetNumber}. You used all ${config.maxAttempts || 5} attempts.`);
    endGame('lost', newAttempts);
  } else {
    const remaining = (config.maxAttempts || 5) - newAttempts;
    if (guess < targetNumber) {
      setFeedback(`📈 Too low! ${remaining} attempts remaining.`);
    } else {
      setFeedback(`📉 Too high! ${remaining} attempts remaining.`);
    }
  }
}, [currentGuess, attempts, targetNumber, config, gameStatus]);

const giveUp = useCallback(() => {
  setGameStatus('gave-up');
  setFeedback(`You gave up! The number was ${targetNumber}.`);
  endGame('gave-up', attempts);
}, [targetNumber, attempts]);

const resetGame = useCallback(() => {
  if (!config) return;
  
  setTargetNumber(Math.floor(Math.random() * (config.maxNumber || 100)) + 1);
  setCurrentGuess('');
  setAttempts(0);
  setGameStatus('playing');
  setGuessHistory([]);
  setFeedback(`Guess a number between 1 and ${config.maxNumber || 100}!`);
}, [config]);

const endGame = useCallback((result: 'won' | 'lost' | 'gave-up', finalAttempts: number) => {
  if (!resultHandler || !config || !actions) return;

  let resultData: any;
  switch (result) {
    case 'won':
      resultData = { result: 'won', attempts: finalAttempts, efficiency: finalAttempts / (config.maxAttempts || 5) };
      break;
    case 'lost':
      resultData = { result: 'lost', attempts: finalAttempts };
      break;
    case 'gave-up':
      resultData = { result: 'gave-up', attempts: finalAttempts };
      break;
  }

  resultHandler({
    data: resultData,
    config,
    actions
  });
}, [resultHandler, config, actions]);
```

#### Step 5: Update Result Interpretation
```typescript
// system/result-interpretation.ts
// Replace the example comment with:
if (config.expectedResultType === ModuleResultType.Attempt) {
  if (resultData?.result === 'won') {
    actionToTrigger = CustomActions.Won;
  } else if (resultData?.result === 'lost') {
    actionToTrigger = CustomActions.Lost;
  } else if (resultData?.result === 'gave-up') {
    actionToTrigger = CustomActions.GaveUp;
  }
}
```

#### Step 6: Create Game UI
```typescript
// system/component.tsx - Replace the return statement
return <div className="w-full h-full flex items-center justify-center p-4">
  {config ? (
    <div className="max-w-md mx-auto bg-white rounded-lg shadow-lg p-6">
      <h1 className="text-2xl font-bold text-center mb-4">{config.gameTitle}</h1>
      
      {gameStatus === 'playing' ? (
        <div className="space-y-4">
          <div className="text-center">
            <p className="text-lg mb-2">{feedback}</p>
            <p className="text-sm text-gray-600">
              Attempts: {attempts}/{config.maxAttempts}
            </p>
          </div>

          <div className="flex space-x-2">
            <input
              type="number"
              value={currentGuess}
              onChange={(e) => setCurrentGuess(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && makeGuess()}
              placeholder="Enter your guess"
              min="1"
              max={config.maxNumber}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={makeGuess}
              disabled={!currentGuess.trim()}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Guess
            </button>
          </div>

          <div className="flex justify-center">
            <button
              onClick={giveUp}
              className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600"
            >
              Give Up
            </button>
          </div>

          {guessHistory.length > 0 && (
            <div className="mt-4 p-3 bg-gray-100 rounded-md">
              <h3 className="font-semibold mb-2">Previous Guesses:</h3>
              <div className="flex flex-wrap gap-2">
                {guessHistory.map((guess, index) => (
                  <span
                    key={index}
                    className={`px-2 py-1 rounded text-sm ${
                      guess < targetNumber ? 'bg-red-200 text-red-800' :
                      guess > targetNumber ? 'bg-yellow-200 text-yellow-800' :
                      'bg-green-200 text-green-800'
                    }`}
                  >
                    {guess}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center space-y-4">
          <div className={`text-6xl ${
            gameStatus === 'won' ? 'text-green-500' :
            gameStatus === 'lost' ? 'text-red-500' :
            'text-yellow-500'
          }`}>
            {gameStatus === 'won' ? '🎉' : gameStatus === 'lost' ? '😞' : '🤷‍♂️'}
          </div>
          
          <p className="text-lg">{feedback}</p>
          
          <div className="space-y-2">
            <p className="text-sm text-gray-600">Final Stats:</p>
            <p className="text-sm">Attempts Used: {attempts}</p>
            <p className="text-sm">Target Number: {targetNumber}</p>
            {guessHistory.length > 0 && (
              <p className="text-sm">Your Guesses: {guessHistory.join(', ')}</p>
            )}
          </div>

          <button
            onClick={resetGame}
            className="px-6 py-2 bg-green-500 text-white rounded-md hover:bg-green-600"
          >
            Play Again
          </button>
        </div>
      )}

      {/* Debug Info */}
      <div className="mt-6 p-3 bg-gray-50 rounded-md text-xs">
        <h3 className="font-semibold mb-2">Debug Info:</h3>
        <p>Module ID: {moduleUid}</p>
        <p>Max Number: {config.maxNumber}</p>
        <p>Max Attempts: {config.maxAttempts}</p>
        <p>Game Status: {gameStatus}</p>
        <p>Aspects: {JSON.stringify(aspects)}</p>
      </div>
    </div>
  ) : (
    <div className="flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      <span className="ml-2">Loading game...</span>
    </div>
  )}
</div>;
```

### 7.2. Common Development Patterns

#### Timer Implementation
```typescript
// Add timer state
const [timeLeft, setTimeLeft] = useState<number>(60);
const [isTimerActive, setIsTimerActive] = useState<boolean>(false);

// Timer effect
useEffect(() => {
  let interval: NodeJS.Timeout | null = null;
  
  if (isTimerActive && timeLeft > 0) {
    interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          setIsTimerActive(false);
          // Handle timeout
          endGame('timeout');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }
  
  return () => {
    if (interval) clearInterval(interval);
  };
}, [isTimerActive, timeLeft]);

// Timer controls
const startTimer = useCallback(() => setIsTimerActive(true), []);
const pauseTimer = useCallback(() => setIsTimerActive(false), []);
const resetTimer = useCallback((newTime: number = 60) => {
  setTimeLeft(newTime);
  setIsTimerActive(false);
}, []);
```

#### Score Management
```typescript
// Score state
const [score, setScore] = useState<number>(0);
const [multiplier, setMultiplier] = useState<number>(1);
const [combo, setCombo] = useState<number>(0);

// Score functions
const addScore = useCallback((basePoints: number) => {
  const points = basePoints * multiplier;
  setScore(prev => prev + points);
  setCombo(prev => prev + 1);
  
  // Increase multiplier based on combo
  if (combo > 0 && combo % 5 === 0) {
    setMultiplier(prev => Math.min(prev + 0.5, 5)); // Max 5x multiplier
  }
}, [multiplier, combo]);

const resetCombo = useCallback(() => {
  setCombo(0);
  setMultiplier(1);
}, []);

const resetScore = useCallback(() => {
  setScore(0);
  setCombo(0);
  setMultiplier(1);
}, []);
```

#### Aspect Integration for Persistence
```typescript
// Save game progress to aspects
const saveProgress = useCallback(() => {
  if (!aspectsPermissions.GameProgress || aspectsPermissions.GameProgress !== AspectPermissionType.ReadWrite) {
    return;
  }

  const progressData = {
    level: currentLevel,
    score: score,
    highScore: Math.max(score, aspects.GameProgress?.highScore || 0),
    gamesPlayed: (aspects.GameProgress?.gamesPlayed || 0) + 1,
    lastPlayed: Date.now(),
  };

  requestAspectChange('GameProgress', progressData);
}, [currentLevel, score, aspects.GameProgress, aspectsPermissions.GameProgress, requestAspectChange]);

// Load progress from aspects
useEffect(() => {
  if (aspects.GameProgress) {
    const progress = aspects.GameProgress;
    // Only load if this is a new session
    if (progress.lastPlayed && Date.now() - progress.lastPlayed > 60000) { // 1 minute
      setCurrentLevel(progress.level || 1);
      setHighScore(progress.highScore || 0);
    }
  }
}, [aspects.GameProgress]);

// Auto-save progress periodically
useEffect(() => {
  const interval = setInterval(() => {
    if (gameStatus === 'playing') {
      saveProgress();
    }
  }, 30000); // Save every 30 seconds

  return () => clearInterval(interval);
}, [gameStatus, saveProgress]);
```

#### Advanced Operation Handling
```typescript
// Add operation-specific state
const [hints, setHints] = useState<string[]>([]);
const [isPaused, setIsPaused] = useState<boolean>(false);
const [powerUps, setPowerUps] = useState<string[]>([]);

// Enhanced operation handling
useEffect(() => {
  if (!lastOperation) return;

  switch (lastOperation.type) {
    case ModuleOperationType.SET_TITLE:
      setTitle(lastOperation.value);
      break;
      
    case ModuleOperationType.SHOW_HINT:
      setHints(prev => [...prev, lastOperation.hintText]);
      // Auto-remove hint after duration
      if (lastOperation.duration) {
        setTimeout(() => {
          setHints(prev => prev.slice(1));
        }, lastOperation.duration * 1000);
      }
      break;
      
    case ModuleOperationType.PAUSE_GAME:
      setIsPaused(prev => !prev);
      if (isTimerActive) {
        pauseTimer();
      }
      break;
      
    case ModuleOperationType.GIVE_POWERUP:
      setPowerUps(prev => [...prev, lastOperation.powerUpType]);
      break;
      
    case ModuleOperationType.UPDATE_DIFFICULTY:
      // Adjust game parameters based on difficulty
      const difficulty = lastOperation.difficulty;
      if (difficulty === 'easy') {
        setTimeLeft(prev => prev + 30); // Add 30 seconds
        setMultiplier(prev => prev * 1.5); // Increase score multiplier
      } else if (difficulty === 'hard') {
        setTimeLeft(prev => Math.max(prev - 15, 10)); // Remove 15 seconds, min 10
        setMultiplier(prev => prev * 0.8); // Decrease score multiplier
      }
      break;
      
    default:
      console.warn('Unknown operation type:', lastOperation.type);
  }
}, [lastOperation, isTimerActive, pauseTimer]);
```

#### Error Handling and Validation
```typescript
// Error state
const [error, setError] = useState<string | null>(null);

// Validation function
const validateGameState = useCallback(() => {
  if (!config) {
    setError('Configuration not loaded');
    return false;
  }
  
  if (!actions || Object.keys(actions).length === 0) {
    setError('Actions not available');
    return false;
  }
  
  if (!resultHandler) {
    setError('Result handler not initialized');
    return false;
  }
  
  setError(null);
  return true;
}, [config, actions, resultHandler]);

// Safe result reporting with error handling
const safeReportResult = useCallback((resultData: any) => {
  try {
    if (!validateGameState()) {
      console.error('Cannot report result: Invalid game state');
      return;
    }

    resultHandler!({
      data: resultData,
      config: config!,
      actions: actions!
    });
  } catch (error) {
    console.error('Error reporting result:', error);
    setError('Failed to report game result');
  }
}, [validateGameState, resultHandler, config, actions]);

// Error display in UI
{error && (
  <div className="mb-4 p-3 bg-red-100 border border-red-400 rounded">
    <p className="text-red-800">⚠️ Error: {error}</p>
    <button
      className="mt-2 px-3 py-1 bg-red-500 text-white rounded text-sm"
      onClick={() => setError(null)}
    >
      Dismiss
    </button>
  </div>
)}
```

### 7.3. Testing and Debugging

Use the browser's developer tools and console logging to debug your mini-game during development.

## 8. Best Practices and Tips

### 8.1. Performance Optimization
- Use `useCallback` for event handlers to prevent unnecessary re-renders
- Use `useMemo` for expensive calculations
- Debounce user input for real-time features
- Clean up timers and intervals in useEffect cleanup functions

### 8.2. User Experience
- Always provide loading states
- Show clear feedback for user actions
- Handle edge cases gracefully
- Provide helpful error messages
- Make the game responsive to different screen sizes

### 8.3. Communication Best Practices
- Always validate data before sending to parent
- Handle communication errors gracefully
- Use meaningful action names that describe the outcome
- Document your custom operations and their expected data

### 8.4. Security Considerations
- Validate all configuration data
- Never trust data from operations without validation
- Use the origins configuration to restrict parent domains
- Sanitize user input before displaying

### 8.5. Debugging Tips
- Use the browser's developer tools to inspect messages
- Add console.log statements in operation handlers
- Test with different configurations
- Verify aspect permissions are working correctly
