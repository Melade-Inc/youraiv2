# Live.link handoff patches (Claude → Codex)

Commits for `Melade-Inc/live-link`, authored and tested in Claude's session,
to be applied by Codex with `git am` (authorship is preserved). Order matters.

| Patch | Apply onto | Then |
| --- | --- | --- |
| `0001` rename guard migration to applied version `20260916194613` + doc refs | `codex/guarded-publish-release` (PR #68) | push; CI; squash-merge #68 |
| `0002` PostgreSQL 17 `db` CI job | `main` after #68 merges | branch `claude/ci-db-job`, push, PR (#69) |
| `0006` install ripgrep in the `db` job (fixes #69's runner failure) | `claude/ci-db-job` at f9153ae (PR #69 head) | `git am`, push; CI green; merge #69 |
| `0003` backfill 21 production-applied migrations + matching SQL tests | `main` after #68 merges | branch `claude/migration-alignment`, push, PR |
| `0004` public CLI + skill release pipeline (slice 3) | `main` after #68 merges (independent of 0002/0003) | branch `claude/cli-distribution`, push, PR; merge after review |
| `0005` publish CLI discovery: live-link 0.1.0 published | on top of `0004` | branch `claude/cli-publish-0.1.0`, push, PR; its `published-cli` job stays red until the pin is on npm; tag its head `cli-v0.1.0` to release, then re-run CI, then merge (see docs/operations/CLI_RELEASE.md) |
| `0006` install ripgrep in the `db` CI job (PR #69 review finding) | `claude/ci-db-job` (PR #69 head `f9153ae`), after `0002` | push; exact-head CI (`db` + `verify`); squash-merge #69 on Ryan's word |

0004/0005 verified in Claude's session on Node 24.21: workspace typecheck, eslint --max-warnings 0, 249 unit tests, 20 CLI process tests, 45 ops tests, both production builds, and the offline distribution dry run (`pnpm release:build` + `verify-distribution.mjs --dry-run`) passing. Secrets required before tagging: `DISTRIBUTION_REPO_TOKEN` (live-link) and `NPM_TOKEN` (live-link-skill).

0001–0003 verified in Claude's session on disposable PostgreSQL 17: `supabase/tests/run-local.sh`
passes on #68's tip (9 migrations) and on main + #68 + 0003 (30 migrations, the
production-equivalent set), including both guarded-publication proof orders. The exact
apply sequence above was simulated end to end, including the squash merge, before
these patches were published.

0006 verified on disposable PostgreSQL 17 (Linux, ripgrep 14.1.0): `supabase/tests/run-local.sh` on the #69 tree passes with ripgrep present and reproduces `line 32: rg: command not found` with it removed. The same suite passes on main + 0003 (30 migrations). Authored in Claude session user-3c, which can push to `Melade-Inc/live-link` directly; its branch `claude/livelink-github-repo-j57pj0` already carries 0003 applied with `git am`.

SHA-256 of the patch files is printed by `sha256sum *.patch`; Codex records it on #17.

No hosted change is involved. `supabase db push --dry-run` from main after 0003 should
report nothing pending. Never run a blanket `db push`.
