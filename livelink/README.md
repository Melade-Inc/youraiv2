# Live.link publishing

Publishes the static site in `livelink/site/` to a single Live.link address and keeps
that same address on every later revision.

- Target slug: **`test-123.live.link`** (slug `test-123`, assigned once and preserved)
- Artifact kind: `app` (built frontend files)
- Entrypoint: `index.html`
- Contract: <https://live.link/start.md>, <https://app.live.link/api/v1/openapi>

## Outcome

One stable public URL for a simple YourAI marketing page, revisable from this repo
without the URL changing.

## Architecture

`livelink/publish.mjs` is a dependency-free Node client (Node 18+) against
`https://app.live.link/api/v1`.

| Step | Call | Notes |
| --- | --- | --- |
| Create draft | `POST /artifacts` | private; `artifact.id` saved to state |
| Save version | `POST /artifacts/:id/versions` | immutable; `baseVersionId` = server's current latest |
| Preview | `POST /artifacts/:id/preview` | single-use URL, shown once, never written to disk |
| Publish | `POST /artifacts/:id/publish` | gated behind `--confirm` + explicit `--audience` |
| Restore | `POST /artifacts/:id/publish` | republish an earlier version at the same slug |
| Revoke | `POST /artifacts/:id/revoke` | turns off reader access, slug stays reserved |

`livelink/.live-link-state.json` holds the artifact id, the locked slug, and the
draft/publication version pointers. It contains no credentials. It is committed so the
slug survives a fresh container.

## Authentication

The client reads the credential **only** from the `LIVE_LINK_TOKEN` secret environment
variable. Create a revocable one at <https://app.live.link/settings> (Settings → AI
connections) with scopes `artifact:read`, `artifact:write`, `artifact:publish`
(write and publish do not imply read).

Never place the token in a project file, a prompt, a URL, or a command argument.
Browser sign-in does not authorize an agent, and reading a guide URL does not either.

## Commands

```bash
node livelink/publish.mjs doctor    # verify credential, scopes, payload size
node livelink/publish.mjs save      # save a PRIVATE version + mint a preview
node livelink/publish.mjs status    # show draft and publication pointers
node livelink/publish.mjs publish --audience=public --confirm
node livelink/publish.mjs revoke --confirm
```

`save` never publishes. Publication requires the explicit `publish` command.

## Acceptance

- [x] Guide, capability document and OpenAPI schema read from source
- [x] Manifest builds within transport limits (30 files / 3 MiB decoded / 4 MiB request)
- [x] Unauthenticated and invalid-credential requests fail closed (401 `INVALID_CREDENTIAL`)
- [x] Credential read only from the secret environment; never logged or persisted
- [x] Authorization is never forwarded across a redirect (`redirect: 'manual'`)
- [x] Idempotency key persisted before each create/save
- [ ] Private draft saved and previewed — **blocked: no `LIVE_LINK_TOKEN` in this environment**
- [ ] First publication — requires owner approval, then the token

## Transport limits

30 files, 3145728 decoded bytes per version, 4194304 UTF-8 JSON request bytes.
Frontend only: no backend processes, no `node_modules`, no hidden files, no source secrets.
Hosted MCP, agent OAuth and public CLI distribution are not available from Live.link yet.
