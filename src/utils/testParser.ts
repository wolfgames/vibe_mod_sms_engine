import { TweeParser } from '../parser/tweeParser';

export function testParser() {
  const testScript = `
:: StoryTitle
SMS Conversation Game

:: StoryData
{
    "ifid": "TEST-SMS-GAME",
    "format": "Harlowe",
    "format-version": "3.3.5",
    "start": "Start"
}

:: Start [start]
(set: $currentRound to 1)
(set: $alexUnlocked to false)

Welcome to the SMS game!

[[Continue|Alex Round-1]]

:: Alex Round-1 [Alex Round-1 character_starts] {"position":"100,100","size":"200,100"}
Hey! Are you free tonight?

[Action: unlock_contact:Alex]

[[Sure, sounds great!|Alex Round-1 Choice-1]]
[[Sorry, I'm busy tonight|Alex Round-1 Choice-2]]

:: Alex Round-1 Choice-1 [Alex Round-1]
Great! How about that new Italian place downtown?

[[Perfect!|Alex Round-2]]

:: Alex Round-1 Choice-2 [Alex Round-1]
No worries! Maybe next time?

[Action: end_thread]

:: Alex Round-2 [Alex Round-2]
Awesome! I'll make a reservation for 7pm.

[[Thanks!|End]]

:: End [end]
Thanks for playing!
`;

  const parser = new TweeParser();
  const result = parser.parseTweeFile(testScript);
  
      // Parser test completed
    // Game Data: Available in result.gameData
    // Errors: Available in result.errors
    // Warnings: Available in result.warnings
  
  return result;
} 