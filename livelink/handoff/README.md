# Live.link handoff patches (Claude → Codex)

Three commits for `Melade-Inc/live-link`, authored and tested in Claude's session,
to be applied by Codex with `git am` (authorship is preserved). Order matters.

| Patch | Apply onto | Then |
| --- | --- | --- |
| `0001` rename guard migration to applied version `20260916194613` + doc refs | `codex/guarded-publish-release` (PR #68) | push; CI; squash-merge #68 |
| `0002` PostgreSQL 17 `db` CI job | `main` after #68 merges | branch `claude/ci-db-job`, push, PR |
| `0003` backfill 21 production-applied migrations + matching SQL tests | `main` after #68 merges | branch `claude/migration-alignment`, push, PR |

Verified in Claude's session on disposable PostgreSQL 17: `supabase/tests/run-local.sh`
passes on #68's tip (9 migrations) and on main + #68 + 0003 (30 migrations, the
production-equivalent set), including both guarded-publication proof orders. The exact
apply sequence above was simulated end to end, including the squash merge, before
these patches were published.

SHA-256 of the patch files is printed by `sha256sum *.patch`; Codex records it on #17.

No hosted change is involved. `supabase db push --dry-run` from main after 0003 should
report nothing pending. Never run a blanket `db push`.
