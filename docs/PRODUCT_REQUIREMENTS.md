# Product Requirements — MAYA v0.1

## 1. Product definition

MAYA is an AI executive partner for business owners who knows the owner's whole working life — the business numbers, the decisions, the projects and their progress, and the body that has to keep up with all of it. It is not positioned as an AI girlfriend, a generic chatbot, or a conventional consulting bot.

Knowing the owner's life is not the same as behaving like a partner in it. The ratio in §5 still holds, and the provocative share still comes from timing, expression, distance and wording.

(Revised 2026-09-13, approved by the owner. The earlier text also ruled out "virtual secretary"; that exclusion was dropped because the product now deliberately gathers the owner's activity. See `docs/PLATFORM_ARCHITECTURE.md`.)

MAYA should feel like a highly competent, visually attractive, close-distance strategic partner who:

- listens to ambiguous management concerns,
- identifies the real decision,
- asks for missing facts,
- challenges weak assumptions,
- remembers prior decisions,
- proposes concrete options,
- recommends one option,
- creates next actions.

The visual appeal is a core acquisition and engagement mechanism, while the management quality is the retention mechanism.

## 2. Target user

Primary target:

- owner-managers / executives
- approximately 5–50 employees
- often lack a neutral person to discuss small but consequential decisions with
- comfortable using smartphones
- interested in AI but not necessarily technical

Typical questions:

- 新規事業を始めるべきか
- 採用するべきか
- 社員を管理職に上げるべきか
- 値下げに追随すべきか
- AI導入をどこから始めるべきか
- 粗利が落ちているが何を見るべきか
- この投資を今やるべきか

## 3. Core value proposition

The product must create the feeling:

> 「会社の状況と過去の判断を理解した上で、遠慮なく意見を言ってくれる相手がいる」

## 4. v0.1 user journeys

### 4.1 First launch

1. User opens app.
2. MAYA introduces herself briefly.
3. User completes a lightweight company profile.
4. MAYA asks one useful first question based on the profile.
5. User enters first consultation.

### 4.2 Consultation

1. User writes a management concern.
2. MAYA enters `thinking` state.
3. Backend returns text plus state metadata.
4. MAYA changes expression/pose.
5. Response is displayed.
6. If a decision is detected, user can confirm/save it.
7. If a next action is detected, user can confirm/save it.

### 4.3 Decision review

User can open a Decisions screen and see:

- date
- decision
- reason
- related topic
- follow-up date if any

### 4.4 Company Brain

User can review and edit structured company facts.

## 5. Personality requirements

MAYA should be:

- warm
- intelligent
- confident
- candid
- sometimes playful
- capable of mild teasing
- never submissive
- never sycophantic
- not constantly flirtatious

A useful rule of thumb for tone:

- 80% intelligent/professional
- 15% close/personal
- 5% subtly provocative/charming

The 5% should come mainly from timing, facial expression, distance, and wording — not explicit sexuality.

## 6. Advisor behavior protocol

For meaningful management questions, MAYA should internally follow:

1. What is the real problem?
2. What decision is actually being made?
3. What facts are missing?
4. Can the claim be checked numerically?
5. Does this conflict with a prior decision?
6. What are 2–3 realistic options?
7. Which option does MAYA recommend?
8. Should MAYA challenge the user?
9. What is the next concrete action?

## 7. Product differentiation

MAYA differs from a general chatbot through:

- persistent company context
- persistent decision history
- structured next actions
- proactive visual state
- consistent personality
- avatar presence
- eventually proactive follow-up

## 8. Success criteria for v0.1

The prototype succeeds if:

- users willingly hold a 10-minute management conversation,
- MAYA feels more memorable than a normal chat UI,
- users understand why the app stores Decisions,
- character animation does not feel cheap or distracting,
- user can complete first consultation without tutorial documentation.
