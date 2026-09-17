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

### The stage yields to the keyboard

35% is the resting size. It cannot hold while the keyboard is up.

On an 844pt screen: 59pt safe area, 295pt stage, 60pt composer and a 336pt
Japanese keyboard leave **94pt of conversation, about three lines**. Measured,
not estimated. The screen is unusable for its own purpose in the state the user
is in whenever they are actually talking to her.

So the stage drops to **88pt while the keyboard is up**, which leaves 301pt,
about ten lines.

At that height it crops to her face rather than scaling the whole figure down.
A thumbnail of a standing figure reads as nothing; the face is what carries the
expression, and the expression is the point of keeping her on screen at all.

The user can also collapse and expand the stage by hand, with the control on the
stage itself. `docs/ACCEPTANCE_CRITERIA.md` requires MAYA to stay visible during
normal use, so the compact state keeps her present rather than hiding her.

Middle:

- current MAYA response
- short conversation history

Bottom:

- text composer
- attach controls for an image and for a text file
- microphone button reserved for later/optional recording
- send button

### Attachments

A consultation about real numbers needs the real numbers. The composer takes a
screenshot or photo, and a text file: markdown, CSV, JSON, plain text, PDF.
Up to three per message, and they travel with that message only.

**No spreadsheet parser.** `README.md` excludes finance document ingestion from
v0.1, and a parser is that. An `.xlsx` is refused with the two things that do
work: export CSV, or screenshot the sheet. A screenshot of a spreadsheet read
correctly in testing.

An attachment may be sent with no text, which asks MAYA what she notices.

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
