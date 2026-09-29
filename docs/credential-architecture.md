# Credential Registry Architecture

## Decision

Build a separate **metadata-only Credential Registry**, not a password manager
and not an extension of MAYA's application D1. The current MAYA Worker handles
runtime secrets and user data; mixing the registry into it would let a future
administration UI accidentally gain a path to secret values.

The registry stores only identity, ownership labels, use, location, status, and
verification evidence. It never stores a credential value, ciphertext, a token
suffix, an authorization header, password, cookie, or uploaded dotenv file.

## Proposed deployment

```text
Local repository scanner (metadata only)
        |
        v
Credential Registry API + separate D1 database
        |                         |
        |                         +-- scan findings / review queue
        v
Private registry web UI
        |
        +-- Provider / Account / Project / Credential / Application views
```

Use a dedicated Cloudflare Worker and D1 database, protected by Cloudflare
Access. It must not bind to MAYA's D1, import MAYA's runtime `Env`, or receive
runtime credential values. The scanner sends only variable names, source paths,
repository metadata, and classifications.

## Data model

```text
Provider 1--* Account 1--* Project 1--* Credential
Credential 1--* SecretLocation
Application *--* Credential (CredentialUsage)
RepositoryScan 1--* ScanFinding
ScanFinding 0..1 -> Credential (after a human links it)
```

### Core entities

| Entity | Required fields |
| --- | --- |
| Provider | `id`, `name`, `kind`, `notes` |
| Account | `id`, `provider_id`, `alias`, `type`, `email_label`, `notes` |
| Project | `id`, `provider_id`, `account_id`, `name`, `external_project_id`, `notes` |
| Credential | `id`, `provider_id`, `account_id?`, `project_id?`, `name`, `credential_type`, `status`, `created_at?`, `expires_at?`, `last_verified_at?`, `notes` |
| SecretLocation | `id`, `credential_id`, `location_type`, `location_name`, `environment`, `variable_name`, `notes` |
| Application | `id`, `name`, `repository_url?`, `local_path?`, `description`, `runtime`, `status` |
| CredentialUsage | `id`, `application_id`, `credential_id`, `environment`, `purpose`, `component`, `detected_by`, `confidence`, `last_verified_at` |
| RepositoryScan | `id`, `application_id`, `repository_commit?`, `scanner_version`, `started_at`, `completed_at`, `status` |
| ScanFinding | `id`, `scan_id`, `variable_name`, `source_path`, `line_number?`, `provider_guess`, `location_guess`, `classification`, `review_question`, `resolution` |

`credential_type` is constrained to `API_KEY`, `PAT`, `SERVICE_TOKEN`,
`CLIENT_SECRET`, `ACCESS_TOKEN`, and `OTHER`. `status` is constrained to
`ACTIVE`, `UNKNOWN`, `UNUSED`, `DEPRECATED`, `REVOKED`, and `ROTATE`.

## Scan and review workflow

1. A local scanner enumerates source/configuration filenames and secret
   *references* (`process.env`, `import.meta.env`, Wrangler bindings, Apps
   Script property names, CI configuration). It excludes `.env*`, secret
   stores, binary files, Git metadata, dependencies, and build output.
2. A detector emits a `ScanFinding`; provider/location guesses are labelled
   **INFERRED**, not facts.
3. Existing `variable_name + application + component` matches are presented as
   candidates. The scanner never auto-links two findings merely because their
   variable names match.
4. A human either links an existing credential or creates a metadata record,
   choosing account/project aliases and a status.
5. The UI records `last_verified_at`, the reviewer, and any uncertainty. A
   finding stays `NEEDS_REVIEW` until that action occurs.

## Initial records inferred from this audit

Create applications first: MAYA, Fit-Log D1, Fit-Log (Apps Script), VoiceBox,
HAKSAI Central, and Character Motion Studio. Create providers: Google Gemini,
Cloudflare, GitHub, Expo/EAS, Fit Log, VoiceBox, HAKSAI Central, and TypeSafe.

Create **findings**, not final credentials, for the variable references in
`credential-audit.md`. In particular, the two MAYA Gemini variables and the
multiple `GEMINI_API_KEY` findings must remain unlinked until their account and
project mappings are confirmed.

## UI requirements

- Dashboard: provider/application counts, status counts, and unresolved review
  findings. Counts distinguish credential records from source references.
- Credential list/detail: no value field and no reveal/copy control. Show usage,
  locations, account/project aliases, status, and verification history.
- Application view: “what must this application have to run?” via
  `CredentialUsage` and unresolved findings.
- Account/project views: reverse usage view.
- Needs Review: editable question, confidence/evidence, suggested provider, and
  explicit resolution action.
- Scanner view: repository, commit/date, excluded paths, findings, and the
  scanner version; no source contents need be retained.

## Security boundaries and acceptance tests

- Reject payload keys named `value`, `secret`, `token`, `password`,
  `authorization`, `ciphertext`, or `credential_value` (including nested keys).
- Redact these terms from application logs and audit exports.
- Authenticate registry UI/API with Cloudflare Access; authorize mutations
  separately from read access.
- Do not scan live dotenv files. The scanner may report that an ignored dotenv
  filename exists, but cannot read it.
- Do not call provider APIs to “test” keys; this would turn the registry into a
  credential-processing system.
- Add a test fixture containing fake secret-shaped text and assert the scanner
  returns only variable names and paths.

## Migration plan

1. Implement schema, API validation, immutable verification log, and manual UI.
2. Import the audit as applications plus unresolved findings.
3. Implement local scanner in dry-run mode and verify its output has no values.
4. Add review/linking workflow and duplicate-warning logic.
5. Scan all 37 enumerated worktrees, then connect Cloudflare/EAS/GitHub as
   name-only inventory sources.
6. Add rotation reminders based on `last_verified_at`; do not infer age from
   source history.
