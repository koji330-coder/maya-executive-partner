# UX Specification — MAYA v0.1

## 1. Navigation

Bottom navigation:

- Today
- Talk
- Decisions
- Company

Settings can be accessed from top-right.

## 2. Today screen

Purpose: make MAYA feel present before the user starts a chat.

Elements:

- date/time context
- MAYA medium/large character
- one short MAYA prompt
- unresolved decisions/actions summary
- CTA: 「MAYAに相談する」

Example:

> おはようございます、社長。今日は何を決めます？

No long dashboard in v0.1.

## 3. Talk screen

### Layout priority

Top ~35%:

- MAYA character stage

Middle:

- current MAYA response
- short conversation history

Bottom:

- text composer
- microphone button reserved for later/optional recording
- send button

### Response display

MAYA's main recommendation should be visually prominent.

Avoid rendering every answer as a huge wall of chat bubbles.

Preferred content structure:

- MAYA's main statement
- reasoning
- options if useful
- recommended next action

## 4. Thinking state

Immediately after user sends:

1. disable duplicate send
2. MAYA enters thinking state
3. subtle motion continues
4. show lightweight status: 「考えています…」
5. on response, transition expression smoothly

Do not use a generic loading spinner as the primary feedback.

## 5. Voice playback

When a voice clip is played:

- lip sync starts
- speaking state is active
- user can stop audio
- after completion, mouth returns closed and character returns to response state

## 6. Decisions screen

Each card:

- date
- decision title
- reason summary
- status
- optional follow-up date

Status:

- active
- completed
- reconsider

## 7. Company screen

Editable structured facts:

- company name / alias
- industry
- employee count
- revenue range
- business description
- management goals
- current issues

The user must be able to see what MAYA “knows”.

## 8. Interaction details

- no excessive modal dialogs
- important MAYA actions should be one-tap confirm
- save Decision as a card from the response
- user can correct extracted decisions
- character animation must remain 60fps target where practical
