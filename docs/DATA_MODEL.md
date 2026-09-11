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
- created_at

### decisions

- id
- user_id
- company_id
- conversation_id nullable
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
- due_date nullable
- status: open | done | cancelled
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
