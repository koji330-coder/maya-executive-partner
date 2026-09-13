# Data Model — MAYA v0.1

## Core entities

### users

- id
- display_name
- created_at

### companies

- id
- user_id
- name
- industry
- employee_count
- revenue_range
- description
- goals_json
- issues_json
- created_at
- updated_at

### conversations

- id
- user_id
- company_id
- title
- created_at
- updated_at

### messages

- id
- conversation_id
- role: user | maya | system
- text
- emotion
- pose
- scene
- voice_key nullable
- response_json nullable — the whole validated `MayaResponse` for a maya message.
  The contract's structured half (options, nextAction, decision,
  followUpQuestion) has no columns of its own: the contract changes as the
  product learns, and a blob avoids a migration for each field. The columns
  above stay because they are queried.
- created_at

### decisions

Local table `cached_decisions`.

- id
- user_id
- company_id
- conversation_id nullable
- source_message_id nullable — the reply it was saved from. Without it,
  reopening the app shows every past decision card as unsaved and invites a
  second copy of the same decision. Added in migration 3.
- title
- reason
- status: active | completed | reconsider
- follow_up_date nullable
- created_at
- updated_at

### actions

- id
- decision_id nullable
- company_id
- title
- due_date nullable — `YYYY-MM-DD`. Free text like 「来週中」 is dropped at
  save time, because it cannot be compared with today and would never count
  as overdue.
- status: open | done | cancelled

Local table `cached_actions`, created in migration 3. A decision and its action
are written in one transaction: a decision stored without the action it came
with looks complete while the thing to check on is missing.
- created_at
- updated_at

### memories

Use only after v0.1 if needed.

Potential fields:

- id
- company_id
- category
- key
- value
- confidence
- source_message_id
- updated_at

## Local SQLite

Client-side tables may mirror a subset:

- app_settings
- cached_company
- cached_conversations
- cached_messages
- cached_decisions

Do not over-design sync in the first milestone.
