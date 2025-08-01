# SMS Game Engine v2.0 - Script Creation Guide

## Unified Delay System

The engine uses a unified delay system that provides predictable and script-controlled timing for all actions and responses.

### Core Principles:
- **Global typing delay** controls response timing across all contacts
- **All delays are additive** to the global delay
- **All actions have a `delay` parameter** (defaults to 0 if not specified)
- **Typing indicators** only appear when there's a global delay (> 0ms)
- **Response-triggered actions** display after the response with the same delay
- **`end_thread` actions** always execute last regardless of script order

### Delay Calculation Examples:

#### With 2000ms Global Delay:
```
0ms: Typing indicator appears
400ms: Typing indicator disappears
2400ms: Response appears (400ms + 2000ms)
```

#### With 0ms Global Delay:
```
0ms: Response appears immediately (no typing indicator)
```

#### With 5000ms Global Delay + 1000ms Action Delay:
```
0ms: Typing indicator appears
400ms: Typing indicator disappears
5400ms: Response appears (400ms + 5000ms)
6400ms: Action appears (5400ms + 1000ms)
```

### Typing Indicators
- **Contact responses**: Show typing indicator for 400ms before response
- **Delayed messages**: Show typing indicator during delay period
- **Other actions**: No typing indicators (photos, locations, etc.)

## Script Structure

### Required Passages

#### Story Metadata
```
:: StoryTitle
Your Story Title

:: StoryData
{
  "ifid": "unique-id-here",
  "format": "Harlowe",
  "format-version": "3.3.9",
  "start": "ContactName-Round-1.0",
  "tag-colors": {
    "DROP_PIN": "green",
    "END_GAME": "red",
    "NEW_CONTACT": "green",
    "SEND_PHOTO": "green",
    "SEND_VIDEO": "green",
    "CALL_911": "green"
  },
  "zoom": 0.6
}
```

#### Initial Variables (Required)
```
:: Initial Variables [initial_variables]
(set: $variable_name to false)
(set: $another_variable to true)
```

#### Contact Passages
```
:: ContactName-Round-1.0 [initial_contact]
Initial message from this contact.

[[Player choice 1|ContactName-Round-2.1]]
[[Player choice 2|ContactName-Round-2.2]]
```

## Available Actions

### Message Actions

#### Delayed Message
```
[Action: delayed_message: message: "This message appears after global delay" delay: 500]
```
- **Parameters:**
  - `message`: The text to display
  - `delay`: Optional additional delay in milliseconds (adds to global delay)
- **Behavior:** Shows typing indicator during delay, then displays message

#### Add Chat History
```
[Action: add_chat_history:contact: "Hey neighbor! Thanks for the lawn mower last week"]
[Action: add_chat_history:player: "No problem at all!"]
[Action: add_chat_history:contact: "Yeah, it's looking much better now. Thanks again!"]
```
- **Parameters:**
  - `contact`: Contact's messages (use | to separate multiple messages)
  - `player`: Player's responses (use | to separate multiple messages)
- **Purpose:** Adds past conversation bubbles to chat history with realistic timestamps

#### Send Photo
```
[Action: send_photo: file: "image.png" caption: "Photo description" delay: 2000]
```
- **Parameters:**
  - `file`: Image filename (place in `public/assets/images/`)
  - `caption`: Text description of the photo
  - `delay`: Optional delay in milliseconds (adds to global delay)
- **Behavior:** Displays after response with same delay + custom delay

#### Send Video
```
[Action: send_video: file: "video.mp4" caption: "Video description" delay: 1000]
```
- **Parameters:** Same as send_photo
- **Behavior:** Displays after response with same delay + custom delay

### Location Actions

#### Drop Pin
```
[Action: drop_pin: Location Name,Description of location,map.png delay: 1500]
```
- **Parameters:**
  - `location`: Name of the location
  - `description`: Description text
  - `file`: Map image filename
  - `delay`: Optional delay in milliseconds (adds to global delay)
- **Behavior:** Displays after response with same delay + custom delay

### Contact Management

#### Unlock Contact
```
[Action: unlock_contact: NewContactName delay: 2000]
```
- **Parameters:**
  - `contactName`: Name of contact to unlock
  - `delay`: Optional delay in milliseconds (adds to global delay)
- **Behavior:** Displays after response with same delay + custom delay

#### End Thread
```
[Action: end_thread: 1 delay: 0]
```
- **Parameters:**
  - `showMessage`: 0 = no message, 1 = show "Conversation has ended"
  - `delay`: Optional delay in milliseconds (adds to global delay)
- **Behavior:** Always executes last, regardless of script order

### Special Actions

#### Call 911
```
[Action: call_911 delay: 0]
```
- **Parameters:**
  - `delay`: Optional delay in milliseconds (adds to global delay)
- **Behavior:** Triggers emergency call animation

#### Set Variable
```
[Action: set_variable: variable_name,true delay: 0]
```
- **Parameters:**
  - `variableName`: Name of variable to set
  - `value`: true/false or string value
  - `delay`: Optional delay in milliseconds (adds to global delay)
- **Behavior:** Executes immediately with global delay + custom delay

#### Set Typing Delay
```
[Action: set_typing_delay: delay: 2000]
```
- **Parameters:**
  - `delay`: Global typing delay in milliseconds
- **Behavior:** Changes global delay for all subsequent actions

### Notification Actions

#### Show Notification
```
[Action: show_notification: title: "Title" body: "Notification message" delay: 0]
```
- **Parameters:**
  - `title`: Notification title
  - `body`: Notification message
  - `delay`: Optional delay in milliseconds (adds to global delay)

#### Vibrate
```
[Action: vibrate: pattern: "100,200,100" delay: 0]
```
- **Parameters:**
  - `pattern`: Comma-separated vibration pattern in milliseconds
  - `delay`: Optional delay in milliseconds (adds to global delay)

### Advanced Actions

#### Open Thread
```
[Action: open_thread: character: "ContactName" delay: 0]
```
- **Parameters:**
  - `character`: Name of contact to unlock
  - `delay`: Optional delay in milliseconds (adds to global delay)

#### Trigger Eli Needs Code
```
[Action: trigger_eli_needs_code: delay: 0]
```
- **Parameters:**
  - `delay`: Optional delay in milliseconds (adds to global delay)

#### Typing Indicator
```
[Action: typing_indicator: duration: 1000 delay: 0]
```
- **Parameters:**
  - `duration`: How long to show typing indicator
  - `delay`: Optional delay in milliseconds (adds to global delay)

#### Set Contact Status
```
[Action: set_contact_status: delay: 0]
```
- **Parameters:**
  - `delay`: Optional delay in milliseconds (adds to global delay)

#### Trigger Emergency Call
```
[Action: trigger_emergency_call: delay: 0]
```
- **Parameters:**
  - `delay`: Optional delay in milliseconds (adds to global delay)

## Variables System

### Variable Types
- **Boolean:** `$variable_name` (true/false)
- **String:** `$variable_name` ("text value")

### Conditional Content
The engine supports Harlowe conditional syntax for dynamic content:

```
(if: $variable_name is true)
This content only shows if variable is true
(else:)
This content shows if variable is false
```

**Conditional Round Mechanism:**
- Rounds with `.0` numbering (e.g., `ContactName-Round-5.0`) are conditional rounds
- These rounds are only accessible when their conditions are met
- The engine automatically evaluates conditionals and unlocks threads when variables change

### Thread Unlocking
When `$eli_thread_1_complete` becomes `true`, it automatically unlocks conditional threads for other contacts by:

1. **Scanning all contacts** for rounds with `.0` numbering
2. **Evaluating conditional content** using the current variable state
3. **Checking if content becomes visible** when conditions are met
4. **Changing thread state** from `locked` or `ended` to `active`

**Example:**
```
:: Jamie-Round-5.0 [Jamie]
(if: $eli_thread_1_complete is true)
Hey, I heard about what happened with Eli. Can you help me with something?

[[Sure, what's up?|Jamie-Round-6.1]]
[[I'm busy|Jamie-Round-6.2]]
```

This round will only become available when `$eli_thread_1_complete` is `true`.

## Passage Naming Convention

### Contact Rounds
```
:: ContactName-Round-1.0 [initial_contact]
:: ContactName-Round-2.1 [ContactName]
:: ContactName-Round-3.0 [ContactName]
```

### Round Numbering
- `X.0` = Initial/conditional rounds (unlock when conditions met)
- `X.1`, `X.2`, etc. = Regular conversation rounds
- Use hyphens: `ContactName-Round-1.0`

## Choice Format

### Basic Choice
```
[[Player choice text|TargetRoundName]]
```

### Choice with Embedded Action
```
[[Send location [Action: drop_pin:Warehouse,Old building,map.png]|ContactName-Round-4.1]]
```

## Image Requirements

### File Locations
- **Photos:** `public/assets/images/`
- **Maps:** `public/assets/images/`
- **Avatars:** `public/assets/images/avatars/`

### Supported Formats
- PNG, JPG, JPEG
- Recommended size: 300x400px for photos

## Example Script Structure

```
:: StoryTitle
Missing Person Investigation

:: StoryData
{...}

:: Initial Variables [initial_variables]
(set: $eli_thread_1_complete to false)
(set: $has_code to false)

:: Eli-Round-1.0 [initial_contact]
Hey, I need your help finding someone.

[[I can help|Eli-Round-2.1]]
[[Not interested|Eli-Round-2.2]]

:: Eli-Round-2.1 [Eli]
Thanks! Can you check this location?

[Action: drop_pin: Warehouse,Old building by tracks,map.png delay: 1500]
[Action: delayed_message: message: "Let me know what you find" delay: 500]

[[I'll go check|Eli-Round-3.1]]
[[Send me more info|Eli-Round-3.2]]

:: Eli-Round-3.1 [Eli]
Great! I'm heading there now.

[Action: delayed_message: message: "I'm at the location" delay: 3000]
[Action: send_photo: file: "warehouse.png" caption: "The building looks abandoned" delay: 1000]
[Action: delayed_message: message: "I found something..." delay: 2000]
[Action: call_911 delay: 0]

[[Call the police|Eli-Round-4.1]]
```

## Timeline Examples

### Example 1: Response with Actions
```typescript
// Global delay: 1000ms, Typing duration: 400ms

// Timeline:
0ms: Typing indicator appears
400ms: Response appears
1400ms: Response complete
3400ms: Drop pin appears (2000ms additional delay)
4400ms: Delayed message appears (3000ms additional delay)
```

### Example 2: Multiple Delayed Messages
```typescript
// Global delay: 1000ms, Typing duration: 400ms

// Timeline:
0ms: Typing indicator appears
400ms: Response appears
1400ms: Response complete
1900ms: First delayed message typing starts
2300ms: First delayed message appears
3300ms: Second delayed message typing starts
3700ms: Second delayed message appears
```

## Tips for Script Creation

1. **Always include Initial Variables passage**
2. **Use consistent naming for contacts and rounds**
3. **Test conditional logic thoroughly**
4. **Place images in correct folders**
5. **Use delays for realistic timing**
6. **Embed actions in choices for player-initiated actions**
7. **Remember that all delays are additive to global delay**
8. **Typing indicators appear automatically for responses and delayed messages**
9. **Response-triggered actions (unlock_contact, send_photo, drop_pin) display after response**
10. **end_thread always executes last regardless of script order**
11. **Use `.0` numbering for conditional rounds that unlock based on variables**
12. **Conditional content is evaluated in real-time when variables change**
13. **The engine automatically extracts choices from conditional content**

## Engine Features

### Core Engine
- ✅ **Unified delay system** with predictable timing
- ✅ Twee script parsing with Harlowe conditional logic
- ✅ Dynamic round management with `number.number` format
- ✅ Action system with configurable delays
- ✅ Variable management and conditional thread unlocking
- ✅ State persistence with localStorage
- ✅ Typing indicators for responses and delayed messages
- ✅ **Conditional content evaluation** with real-time variable processing
- ✅ **Automatic thread unlocking** based on variable state changes
- ✅ **Dynamic choice extraction** from conditional content

### UI/UX
- ✅ iPhone-style interface with realistic SMS design
- ✅ Auto-scrolling conversation view
- ✅ New message indicators (blue dots) for unread messages
- ✅ Contact list with thread states
- ✅ Photo and location message support
- ✅ 911 emergency call animation
- ✅ Realistic typing indicators

### Game Mechanics
- ✅ Branching narrative with player choices
- ✅ Conditional content based on variables
- ✅ Thread unlocking/locking system
- ✅ Unified delay system with global + custom delays
- ✅ Embedded actions in choice options
- ✅ Response-triggered action sequencing

## Parsing and Evaluation Process

### Initial Parsing
1. **Script Loading**: Twee files are parsed into structured `GameData`
2. **Variable Replacement**: `{{variable}}` syntax is processed
3. **Conditional Detection**: Harlowe conditionals are identified but not evaluated
4. **Choice Extraction**: Player choices are extracted from passage content

### Runtime Evaluation
1. **Variable Changes**: When variables are modified via actions
2. **Conditional Re-evaluation**: Affected rounds are re-parsed with current variables
3. **Content Visibility**: Conditional content is evaluated for visibility
4. **Thread State Updates**: Thread states change based on conditional results
5. **Choice Regeneration**: New choices are extracted from visible content

### Conditional Processing
- **Harlowe Syntax**: `(if: $variable is true)` blocks are evaluated
- **Else Blocks**: `(else:)` content is processed when conditions are false
- **Nested Conditionals**: Multiple conditional blocks are supported
- **Variable Context**: All variables are available during evaluation

This engine supports complex branching narratives with realistic SMS interactions, location sharing, photo sharing, and emergency scenarios. The unified delay system ensures predictable and script-controlled timing for all actions. 