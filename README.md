# SMS Conversation Game Engine

An iPhone SMS conversation game engine that parses Twee files to generate interactive text-based adventures. The game looks and behaves exactly like iOS Messages, with multiple simultaneous conversation threads, dynamic unlocking of contacts, and custom actions.

## Features

- **iOS Messages Replica**: Exact iOS Messages appearance and behavior
- **Twee Script Support**: Parse and execute Twee files with Harlowe syntax
- **Multiple Conversations**: Handle multiple simultaneous conversation threads
- **Dynamic Contact Unlocking**: Contacts unlock based on game progression
- **Custom Actions**: Support for photos, videos, locations, notifications, and more
- **Auto-save**: Game state persists across sessions
- **Hot Reloading**: Reload scripts during development
- **Debug Panel**: Variable inspector and game state monitoring

## Quick Start

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start the development server**:
   ```bash
   npm run dev
   ```

3. **Open your browser** and navigate to `http://localhost:3000`

4. **The game will automatically load** the sample script and display the SMS interface

## Twee Script Format

### Contact Definition
Contacts are defined by their passage titles:
- `ContactName-Round-X` - defines contact name and round number in the passage title
- `[initial_contact]` - contact sends initial message when game starts
- `[unlocked]` - contact starts unlocked (default: locked)

### Passage Structure
```
:: ContactName-Round-X [tags] {"position":"x,y","size":"w,h"}
Dialogue text here
[[Choice 1]]
[[Choice 2|Alternative Link Text]]
```

### Variable System
- Variables use Harlowe syntax: `(set: $variableName to value)`
- Support complex conditionals: `(if: $var1 is true and $var2 > 5)`
- Logical operators: AND, OR, NOT combinations
- Comparison operators: `>`, `<`, `>=`, `<=`, `is`, `is not`
- String matching and numeric comparisons
- Array/list variables: `(set: $items to (array: "key", "phone", "wallet"))`
- Array operations: `(if: $items contains "key")`
- Variables are global across all contacts
- Initialize variables in the starting passage

### Custom Actions
Actions are embedded in passages as: `[Action: action_name:parameters]`

**Available Actions:**
- `unlock_contact:ContactName` - Makes contact available in message list
- `end_thread` - Locks thread progression until conditions unlock it
- `end_thread:delay` - Locks thread with optional delay before locking
- `delayed_message:milliseconds message:"text"` - Send message after delay
- `send_photo:file:"filename.png" caption:"description" delay:milliseconds` - Send image
- `send_video:file:"filename.mp4" caption:"description" delay:milliseconds` - Send video
- `drop_pin:location,description,mapfile.png` - Send location pin (green bubble)
- `call_911` - Trigger emergency call sequence (game end)
- `set_typing_delay:milliseconds` - Set global typing indicator delay
- `typing_indicator:duration` - Show typing indicator without sending message
- `mark_read:ContactName` - Mark conversation as read
- `notification:title:body` - Show browser notification
- `vibrate:pattern` - Mobile vibration if supported (comma-separated ms pattern)
- `set_contact_status:ContactName:status` - Set online/offline/away status

## File Structure

```
/public/scripts/          - Twee script files
/public/assets/images/    - Game images and maps
/public/assets/videos/    - Video files for send_video action
/src/parser/             - Twee parsing logic
/src/engine/             - Game state and flow management
/src/actions/            - Action handler implementations
/src/ui/                 - React components for iOS interface
/src/utils/              - Asset management and optimization utilities
```

## Architecture

### Parser Module
- Parses Twee files into structured JSON
- Extracts contacts, rounds, passages, and actions
- Validates script syntax and structure
- Generates warnings for missing image files

### Engine Module
- Game state management and flow control
- Message queue management with proper timing
- Variable state tracking
- Auto-save functionality

### UI Module
- iOS Messages replica interface
- Contact list with real-time updates
- Message bubbles with media support
- Typing indicators and animations

## Development

### Adding New Scripts
1. Place your `.twee` file in `/public/scripts/`
2. Update the script name in `app/game/page.tsx`
3. The game will automatically load and parse the new script

### Hot Reloading
- Use the "Reload Script" button to reload the current script
- Changes to the script file will be reflected immediately
- Game state is preserved during reload

### Debug Tools
- Toggle the debug panel to view:
  - Current variable states
  - Thread states and progression
  - Game state information
  - Parser errors and warnings

## Example Script

See `/public/scripts/sample-sms-game.twee` for a complete example of a working SMS game script.

## Browser Support

- Modern browsers with ES6+ support
- Mobile browsers for touch interaction
- Notification API for browser notifications
- Vibration API for mobile vibration (if supported)

## Performance

- Lazy loading for images/media
- Efficient re-rendering for message updates
- Smooth animations for typing indicators and message appearance
- Auto-save functionality preserves game state

## License

This project is licensed under the MIT License.

