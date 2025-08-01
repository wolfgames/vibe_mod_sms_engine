# SMS Game Engine v1.0 - Script Creation Guide

## **Script Structure**

### **Required Passages**

#### **Story Metadata**
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

#### **Initial Variables (Required)**
```
:: Initial Variables [initial_variables]
(set: $variable_name to false)
(set: $another_variable to true)
```

#### **Contact Passages**
```
:: ContactName-Round-1.0 [initial_contact]
Initial message from this contact.

[[Player choice 1|ContactName-Round-2.1]]
[[Player choice 2|ContactName-Round-2.2]]
```

## **Available Actions**

### **Message Actions**

#### **Delayed Message**
```
[Action: delayed_message:3000 message: "This message appears after 3 seconds"]
```
- **Parameters:**
  - `delay`: Time in milliseconds before message appears
  - `message`: The text to display

#### **Add Chat History**
```
[Action: add_chat_history:contact: "Hey neighbor! Thanks for the lawn mower last week"]
[Action: add_chat_history:player: "No problem at all!"]
[Action: add_chat_history:contact: "Yeah, it's looking much better now. Thanks again!"]
```
- **Parameters:**
  - `contact`: Contact's messages (use | to separate multiple messages)
  - `player`: Player's responses (use | to separate multiple messages)
- **Purpose:** Adds past conversation bubbles to chat history with realistic timestamps

#### **Send Photo**
```
[Action: send_photo:file: "image.png" caption: "Photo description" delay: 2000]
```
- **Parameters:**
  - `file`: Image filename (place in `public/assets/images/`)
  - `caption`: Text description of the photo
  - `delay`: Optional delay in milliseconds

#### **Send Video**
```
[Action: send_video:file: "video.mp4" caption: "Video description" delay: 1000]
```
- **Parameters:** Same as send_photo

### **Location Actions**

#### **Drop Pin**
```
[Action: drop_pin:Location Name,Description of location,map.png]
```
- **Parameters:**
  - `location`: Name of the location
  - `description`: Description text
  - `file`: Map image filename

### **Contact Management**

#### **Unlock Contact**
```
[Action: unlock_contact:NewContactName]
```
- **Parameters:**
  - `contactName`: Name of contact to unlock

#### **End Thread**
```
[Action: end_thread:1]
```
- **Parameters:**
  - `showMessage`: 0 = no message, 1 = show "Conversation has ended"

### **Special Actions**

#### **Call 911**
```
[Action: call_911]
```
- Triggers emergency call animation
- No parameters needed

#### **Set Variable**
```
[Action: set_variable:variable_name:true]
```
- **Parameters:**
  - `variableName`: Name of variable to set
  - `value`: true/false or string value

#### **Set Typing Delay**
```
[Action: set_typing_delay:2000]
```
- **Parameters:**
  - `delay`: Global typing delay in milliseconds

### **Notification Actions**

#### **Show Notification**
```
[Action: show_notification:title: "Title" body: "Notification message"]
```
- **Parameters:**
  - `title`: Notification title
  - `body`: Notification message

#### **Vibrate**
```
[Action: vibrate:100,200,100]
```
- **Parameters:**
  - `pattern`: Comma-separated vibration pattern in milliseconds

## **Variables System**

### **Variable Types**
- **Boolean:** `$variable_name` (true/false)
- **String:** `$variable_name` ("text value")

### **Conditional Content**
```
(if: $variable_name is true)
This content only shows if variable is true
```

### **Thread Unlocking**
When `$eli_thread_1_complete` becomes `true`, it automatically unlocks conditional threads for other contacts.

## **Passage Naming Convention**

### **Contact Rounds**
```
:: ContactName-Round-1.0 [initial_contact]
:: ContactName-Round-2.1 [ContactName]
:: ContactName-Round-3.0 [ContactName]
```

### **Round Numbering**
- `X.0` = Initial/conditional rounds (unlock when conditions met)
- `X.1`, `X.2`, etc. = Regular conversation rounds
- Use hyphens: `ContactName-Round-1.0`

## **Choice Format**

### **Basic Choice**
```
[[Player choice text|TargetRoundName]]
```

### **Choice with Embedded Action**
```
[[Send location [Action: drop_pin:Warehouse,Old building,map.png]|ContactName-Round-4.1]]
```

## **Image Requirements**

### **File Locations**
- **Photos:** `public/assets/images/`
- **Maps:** `public/assets/images/`
- **Avatars:** `public/assets/images/avatars/`

### **Supported Formats**
- PNG, JPG, JPEG
- Recommended size: 300x400px for photos

## **Example Script Structure**

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

[Action: drop_pin:Warehouse,Old building by tracks,map.png]
[Action: delayed_message:2000 message: "Let me know what you find"]

[[I'll go check|Eli-Round-3.1]]
[[Send me more info|Eli-Round-3.2]]

:: Eli-Round-3.1 [Eli]
Great! I'm heading there now.

[Action: delayed_message:3000 message: "I'm at the location"]
[Action: send_photo:file: "warehouse.png" caption: "The building looks abandoned"]
[Action: delayed_message:2000 message: "I found something..."]
[Action: call_911]

[[Call the police|Eli-Round-4.1]]
```

## **Tips for Script Creation**

1. **Always include Initial Variables passage**
2. **Use consistent naming for contacts and rounds**
3. **Test conditional logic thoroughly**
4. **Place images in correct folders**
5. **Use delays for realistic timing**
6. **Embed actions in choices for player-initiated actions**

## **Engine Features**

### **Core Engine**
- ✅ Twee script parsing with conditional logic
- ✅ Dynamic round management with `number.number` format
- ✅ Action system (delayed messages, photos, location pins, 911 calls)
- ✅ Variable management and conditional thread unlocking
- ✅ State persistence with localStorage

### **UI/UX**
- ✅ iPhone-style interface with realistic SMS design
- ✅ Auto-scrolling conversation view
- ✅ New message indicators (blue dots) for unread messages
- ✅ Contact list with thread states
- ✅ Photo and location message support
- ✅ 911 emergency call animation

### **Game Mechanics**
- ✅ Branching narrative with player choices
- ✅ Conditional content based on variables
- ✅ Thread unlocking/locking system
- ✅ Typing indicators with configurable delays
- ✅ Embedded actions in choice options

This engine supports complex branching narratives with realistic SMS interactions, location sharing, photo sharing, and emergency scenarios. 