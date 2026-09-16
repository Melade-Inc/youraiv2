# Session handoff: Live.link trunk transition and slice 3

From session `session_017twst4MFpEXdY2hjihXFdf` (youraiv2 home, read-only on live-link) to the
session whose home repository is `Melade-Inc/live-link`. Written 2026-09-16 ~21:15 UTC. Everything
below was verified in the old session; nothing here is speculation. Read this, then issue #17, then
PR #68's review comment and PR #69's thread, before touching anything.

## Role and authority

You are Ryan's technical co-founder on Live.link, working in tandem with Codex (GitHub user
`agentgatewayv1`, running on Ryan's Mac in checkouts under `~/Documents/ChatGPT/`). Coordination
happens on issue #17 with `Claude:` / `Codex:` / `Ryan:` prefixed comments; a review of record is a
comment starting `Claude review:` or `Codex review:`. Ryan authorized merges into `main` for this
queue; every PR still gets the other side's review comment first. Ryan created this session so that
live-link is its home repository; act within this session's own permissions. Never force-push, never
`supabase db push`, never apply a migration or flip a flag (Codex does hosted changes from the runbooks),
never merge PR #2, never paste a credential anywhere. Prefer `git am` of the handoff patches over
re-deriving; if a patch does not apply, stop and say so on #17 rather than hand-editing.

## Decision of record (posted on #17 by Codex, relayed from Ryan)

`main` is the trunk. `codex/platform-v1` (PR #2, 427 commits) is a quarry, not an integration target.
Queue, one PR each, flag off: 0. handoff patches → 1. `codex/generation-contract-tests` → main →
2. in-agent email login (Codex, standalone migration) → 3. public CLI + skill (patches 0004/0005) →
4. guest publish + claim → 5. hosted MCP + OAuth → 6. password links + SPA viewers → 7. staged uploads.
Then new briefs: slug change with 301 redirect, Stripe plans, custom domains. D5/Astra work is paused.

## State right now

- `main` = 2d111a2 = PR #68 squash-merged (guarded agent publication, CLI `go`/`connect`/local stdio
  `mcp`, migration renamed to its applied version 20260916194613 via patch 0001). Both Vercel
  projects Ready on it; https://live.link/start.md shows `expectedPublicationRevision`.
- Production Supabase `fieqjhnbucwigyjsyrgc` has 30 applied migrations; `main`'s directory has 9.
  Patch 0003 closes that gap (21 files, byte-identical, hashes match Codex's evidence) and brings
  the matching SQL tests; `main`'s current `tests/sql/delivery.sql` fails against production's schema.
- PR #69 (`claude/ci-db-job`, patch 0002) is open; its `db` job failed only because the runner lacks
  ripgrep. Patch 0006 fixes it (cut against #69 head f9153ae). Codex may already have applied it:
  check `git ls-remote origin claude/ci-db-job` before doing anything.
- Codex's remaining queue from Ryan's prompt: apply 0006, merge #69, apply 0003 as
  `claude/migration-alignment` + PR + `supabase db push --dry-run` (expect nothing pending), open the
  recovery PR from `codex/generation-contract-tests` (merge `main` in; only `CODEX_CHECKPOINT.md`
  conflicts, keep both), restore Vercel Ignored Build Step settings, push local checkpoint branches as
  `backup/*`, then slice 2, then 0004/0005.

## Artifacts

All on `Melade-Inc/youraiv2`, branch `claude/live-link-integration-mxfwxr`, directory `livelink/handoff/`
(README.md there has bases, order and hashes):

| Patch | Applies onto | Purpose |
| --- | --- | --- |
| 0001 | applied, merged in #68 | rename guard migration to applied version |
| 0002 | main → PR #69 | PostgreSQL 17 `db` CI job |
| 0006 | `claude/ci-db-job` @ f9153ae | install ripgrep in the `db` job |
| 0003 | main after #68 | backfill 21 production migrations + SQL tests (30-migration suite: exit 0) |
| 0004 | main after #68 (independent of 0002/0003) | public CLI + skill release pipeline (slice 3) |
| 0005 | on top of 0004 | flip discovery to published for live-link 0.1.0; `published-cli` CI gate |

Reviews posted by the old session: PR #68 comment 5704021804 (approve with rename; two follow-ups),
PR #69 comment 5704553053 (0006 instructions). Codex's status: #17 comment 5704320182.

## Working in tandem without collisions

Before any push: read the last ~10 comments on #17 and list open PRs. Post one `Claude:` comment on #17
saying this session now owns pushing `claude/*` branches and opening their PRs; Codex reviews, merges,
and does everything hosted (Vercel, migrations, backups, Codex-owned branches). If Codex has already
pushed a given patch (branch exists with the patch's commit subject), do not push it again; review it
instead. Branch names to use: `claude/ci-db-job` (exists), `claude/migration-alignment`,
`claude/cli-distribution`, `claude/cli-publish-0.1.0`. Your session's default branch is
`claude/livelink-github-repo-j57pj0`; Ryan must explicitly permit pushing to the branch names above
in your session before you do (ask him once, in one line).

## Slice 3 release sequence (docs/operations/CLI_RELEASE.md in patch 0004/0005)

The bundle inlines the registry, so the release commit is the flip commit: open the 0005 PR (its
`published-cli` job is red until the pin is on npm; that is the gate); Ryan adds `DISTRIBUTION_REPO_TOKEN`
(live-link Actions secret, fine-grained PAT with contents:write on `Melade-Inc/live-link-skill`) and
`NPM_TOKEN` (live-link-skill Actions secret, npm granular token, read+write, bypass 2FA); confirm the
skill repo is public; on the 0005 PR head run `pnpm release:build && node scripts/release/verify-distribution.mjs --dry-run dist/distribution`
(must be `ok: true`), tag it `cli-v0.1.0`, push the tag; `release-cli.yml` pushes the tree and tag
`v0.1.0` to the skill repo, whose `publish.yml` publishes to npm with provenance; then
`node scripts/release/verify-distribution.mjs 0.1.0`, `npx -y live-link@0.1.0 doctor` from an empty
directory, `npx skills add Melade-Inc/live-link-skill --skill live-link --list`; re-run CI, merge,
deploy management, confirm https://live.link/start.md shows the install command. `live-link` on npm
was unclaimed (404) at 2026-09-16 20:30 UTC. Never `npm publish` from a laptop.

## Verification already done (do not redo unless a base changes)

Node 24.21: workspace typecheck, `eslint . --max-warnings 0`, 249 unit tests / 23 files, 33 CLI process
tests, 45 ops tests, both production builds, offline distribution dry run (16 public files, 6 package
files, 881,780-byte bundle, no runtime imports outside `node:*`). SQL suite on disposable PostgreSQL 17:
#68 tip (9 migrations) and main+#68+0003 (30 migrations) both exit 0. `git am` of the full sequence
simulated including the #68 squash merge; the real `main` tree equals the simulated one.

To run the SQL suite locally: install PostgreSQL 17 from PGDG and ripgrep; `initdb` refuses root, so
run as an unprivileged user with `PG_BIN=/usr/lib/postgresql/17/bin bash supabase/tests/run-local.sh`.

## Open review duties for this session

- `Claude review:` on the recovery PR (`codex/generation-contract-tests` → main) when Codex opens it.
- `Claude review:` on Codex's slice-2 PR (in-agent email login): standalone migration extracting
  `live_issue_agent_credential`, `live_agent_credential_lookup`, `live_touch_agent_credential`,
  `agent_credentials.expires_at` and the two small functions from 20260906173000/20260906200000, re-timestamped
  after 20260916194613, `live_publish` and `workspaces` untouched, flag `LIVE_LINK_AGENT_AUTH_ENABLED=false`.
- Follow-ups noted on #68: server should require `expectedPublicationRevision` for agent-credential
  principals once the guide is deployed; `mapArtifact` hardcodes `publicationGuardVersion: 1`.
- Hygiene after 0003 lands: replace `rg -q` with `grep -q` in `supabase/tests/run-local.sh` (platform-v1
  already did this), then drop the ripgrep CI step.

## Acceptance test after slice 3 ships

Fresh Claude Code session, paste `https://live.link` with a small built folder, no other input from
Ryan: expect `npx skills add`, a private draft with preview, then a published link after one explicit
confirmation. That is the test that failed on 2026-09-16 morning for lack of a credential path.

## What is NOT built anywhere (Ryan's stated phase-1 paid layer)

Slug change with redirect, Stripe plans, custom domains (contract only in PRs #64/#65). Schedule as
new briefs after slice 5; do not let them block beta.
