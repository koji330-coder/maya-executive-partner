# Credential Audit

Date: 2026-09-30  
Classification: metadata-only audit. Secret values, token values, passwords,
cookies, and authorization-header values were neither read nor recorded.

## Scope and method

The accessible `Documents` workspace contains 37 local Git worktrees. Their
names/remotes were enumerated without treating them as proof of deployment or
ownership. Static inspection then prioritized the applications that the MAYA
server directly calls: MAYA, Fit-Log / Fit-Log D1, VoiceBox, HAKSAI Central,
and Character Motion Studio. `.env*` contents, local secret stores, and
Cloudflare/GitHub dashboards were deliberately out of scope.

Evidence levels used below:

- **CONFIRMED** — a declaration or use site exists in checked-out source.
- **INFERRED** — a purpose follows directly from the surrounding code/comments.
- **UNKNOWN** — source cannot establish it.
- **NEEDS_REVIEW** — requires dashboard/account-owner confirmation.

## Summary

| Measure | Result | Evidence level |
| --- | ---: | --- |
| Local Git worktrees enumerated | 37 | CONFIRMED |
| Priority applications statically inspected | 5 | CONFIRMED |
| Providers/services with credential references | 7 | CONFIRMED |
| MAYA Worker secret variable names | 13 | CONFIRMED |
| Direct client public configuration names | 2 | CONFIRMED |
| Repositories with an ignored local dotenv file found in priority scan | 2 | CONFIRMED |
| GitHub Actions workflow files in MAYA | 0 | CONFIRMED |
| Credential identities mapped to an account/project | 0 | CONFIRMED |

The counts are **references**, not counts of unique secret values. Two variables
with the same name must not be assumed to contain the same credential.

## Providers and applications

| Application | Provider/service | Credential reference | Environment / location | Runtime | Purpose | Status |
| --- | --- | --- | --- | --- | --- | --- |
| MAYA | Google Gemini | `GEMINI_API_KEY_FREE`, `GEMINI_API_KEY_PAID` | Cloudflare Worker secret; client may also keep user-entered keys in device keychain | Worker / Expo | Chat generation, tier fallback | NEEDS_REVIEW |
| MAYA | Cloudflare | `KEY_ENCRYPTION_KEY` | Cloudflare Worker secret | Worker + D1 | Encrypts user-entered provider keys before D1 storage | CONFIRMED |
| MAYA | Fit Log | `FITLOG_API_KEY` or `FITLOG_CLIENT_ID` + `FITLOG_CLIENT_SECRET` | Cloudflare Worker secret | Worker | Read health/fitness data | CONFIRMED |
| MAYA | HAKSAI Central | `HAKSAI_MCP_CLIENT_ID` + `HAKSAI_MCP_CLIENT_SECRET` | Cloudflare Worker secret | Worker | Read-only MCP calls | CONFIRMED |
| MAYA | Keepa via HAKSAI | `HAKSAI_KEEPA_CLIENT_ID` + `HAKSAI_KEEPA_CLIENT_SECRET`, or HAKSAI fallback pair | Cloudflare Worker secret | Worker | Product-data MCP calls | CONFIRMED |
| MAYA | VoiceBox | `VOICEBOX_VAULT_CLIENT_ID` + `VOICEBOX_VAULT_CLIENT_SECRET` | Cloudflare Worker secret | Worker | Read-only vault access | CONFIRMED |
| MAYA | TypeSafe / Jev | `TYPESAFE_API_KEY` | Cloudflare Worker secret; encrypted user entry may take precedence in D1 | Worker | Tool-route classification | CONFIRMED |
| Fit-Log D1 | Google Gemini | `GEMINI_API_KEY` | Worker secret / local development secret file | Cloudflare Worker | AI text generation | CONFIRMED |
| Fit-Log D1 | MAYA / internal client | `FITLOG_API_KEY` | Worker secret | Cloudflare Worker | API request authentication | CONFIRMED |
| Fit-Log D1 | GPS Log | `GPS_LOG_WEBHOOK_KEY` | Worker secret | Cloudflare Worker | Webhook authentication | CONFIRMED |
| Fit-Log (Apps Script) | Google Gemini | `Gemini_API_KEY` | Apps Script Properties Service | Apps Script | Text/comment generation | CONFIRMED |
| Character Motion Studio | Google Gemini | `GEMINI_API_KEY` | local `.env.local` (ignored); `.env.example` tracked | Node CLI | Image-generation pipeline | CONFIRMED |
| VoiceBox | Cloudflare Access | `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` | deployment/local configuration, exact location UNKNOWN | Worker / app | Authenticated vault access | INFERRED |

`EXPO_PUBLIC_API_BASE_URL` and `EXPO_PUBLIC_ENV` are configuration, not secrets.
They are intentionally bundled into the client and are not registry credentials.

## Credential relationship detail: MAYA

```text
Credential reference
  -> MAYA Worker component
  -> purpose

GEMINI_API_KEY_FREE / GEMINI_API_KEY_PAID
  -> server/src/chat.ts and server/src/memory/apiKeys.ts
  -> Gemini conversation requests; Worker values are fallback when no encrypted
     per-user key is saved.

FITLOG_API_KEY or FITLOG_CLIENT_ID + FITLOG_CLIENT_SECRET
  -> server/src/fitlog.ts
  -> server-to-server Fit Log requests.

HAKSAI_MCP_CLIENT_ID + HAKSAI_MCP_CLIENT_SECRET
  -> server/src/haksai.ts
  -> Cloudflare Access-authenticated, read-only HAKSAI MCP calls.

VOICEBOX_VAULT_CLIENT_ID + VOICEBOX_VAULT_CLIENT_SECRET
  -> server/src/voicebox.ts
  -> Cloudflare Access-authenticated, read-only VoiceBox vault calls.

KEY_ENCRYPTION_KEY
  -> server/src/memory/apiKeys.ts and server/src/memory/typesafeKey.ts
  -> encryption key for registry-adjacent, user-entered keys held in D1.
```

## Account and project mapping

| Provider | Account | Project | Mapping status | Required human action |
| --- | --- | --- | --- | --- |
| Google / Gemini (MAYA) | UNKNOWN | UNKNOWN | NEEDS_REVIEW | Map each free/paid key reference to an account alias and project alias in Google AI Studio / Cloud Console. |
| Google / Gemini (Fit-Log D1) | UNKNOWN | UNKNOWN | NEEDS_REVIEW | Confirm the labels configured for tier/project/billing are current; do not infer from variable names. |
| Google / Gemini (Apps Script / motion studio) | UNKNOWN | UNKNOWN | NEEDS_REVIEW | Identify the account and project that created each deployed key. |
| Cloudflare | UNKNOWN | MAYA D1 database is configured, account UNKNOWN | NEEDS_REVIEW | Add a Cloudflare account alias and Worker/project aliases. |
| GitHub | UNKNOWN | repositories enumerated locally | NEEDS_REVIEW | Inspect organization/user secrets and Actions environments separately. |

## Risks and review queue

1. **Account and project identity are unknown for every credential reference.**
   Source names cannot prove who created a key or which account owns it.
2. **Same-variable-name collision.** `GEMINI_API_KEY` occurs in more than one
   application. It is a *possible duplicate*, never proof that one key is reused.
3. **Secret-location coverage is incomplete.** This audit can confirm source
   contracts, but cannot list actual Cloudflare Secrets, EAS secrets, GitHub
   Secrets, Google Secret Manager entries, or Apps Script property values.
4. **MAYA has two legitimate key paths.** A Worker fallback and a device-keychain
   user key are distinct locations and must be represented separately.
5. **Encrypted D1 is not a vault substitute.** It is an existing application
   behavior. A registry must store only metadata and location records, never
   the encrypted key blob or its value.
6. **Repository coverage is staged.** The remaining 32 enumerated local
   worktrees need the same scanner before they are marked “scanned”.

## Git hygiene

MAYA's `.gitignore` excludes `.env` and `.env.*` while allowing `.env.example`.
Its template contains public Expo configuration only. Character Motion Studio
tracks only `.env.example`; its local `.env.local` is ignored. No change was
made because the inspected ignore rules cover these known local dotenv files.

## Next verification steps

1. Export **names only** from Cloudflare Workers secrets, EAS environments,
   GitHub Actions secrets, and Apps Script properties; do not export values.
2. Create account aliases and project aliases, then attach each credential
   reference through the proposed review workflow.
3. Run the future scanner over every enumerated repository and record scan date,
   commit SHA, and excluded paths.
4. Rotate any credential whose owner, purpose, or last verification date cannot
   be established after review.
