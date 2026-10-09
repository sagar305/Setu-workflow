# Build #7 verification — 4 October 2026

## Starting state

`master` was clean at `3405afece79e7f2ed4d5df86cf60aafd12a2d755`; `setu-build-6-checkpoint` resolved to the same commit. That existing, verified checkpoint was reused without discarding or rewriting work. Targeted inspection confirmed Build #6 checklist ownership, status, engagement/workflow links, AuditLog and shared firm-lock/revision handling. Its documented persistent-storage limitation remains in force. No critical missing checklist dependency required a duplicate implementation.

Read the installed Next.js page convention guide and reused the existing async page parameters, protected workspace routes and central API dispatcher.

## Executed checks

- Prisma schema validation: passed.
- Additive migration generation and Prisma Client generation: passed. The first engine access was blocked by the sandbox; elevated generation then encountered the running dev server's locked Windows DLL. Only the verified project server was stopped, generation succeeded, and the app was restarted for UI verification.
- `scripts/test-migrate.ts`: migration `202610040002_points` applied to the dedicated `setu_test` database.
- `prisma migrate deploy`: the same migration applied to the existing local `setu` development database.
- `vitest run tests/points.test.ts tests/workflows.test.ts tests/checklists.test.ts tests/allocations.test.ts`: **78 passed** (13 Points, 25 Workflow, 8 Checklist, 32 Allocation).
- `vitest run tests/points.test.ts -t 'custom roles|point override audit'`: **2 additional tests passed**; 13 previously passed tests were deliberately skipped in this targeted run. Total: **80 distinct service/database tests passed**, including 15 Points tests.
- TypeScript `tsc --noEmit`: passed after main implementation.
- Full configured ESLint scope: passed. Subsequent seed/test additions received targeted lint checks, which also passed.
- `playwright test e2e/points.spec.ts`: **1 passed**, installed headless Chrome, 1.3 minutes including development compilation; no page errors. No complete prior-build Chrome suite was run.
- Development seed: passed. A read-only verification confirmed **11 demo points per firm**, each with 3 Open, 3 Responded, 2 Resolved, 2 Reopened and 1 Active instruction, plus 7 parent-linked responses. Audit sample engagements were added because no active Audit engagements existed. Existing active clients were reused through the normal service-association workflow. Repeat seeding skipped existing point references.

- `pnpm build`: **passed on its single execution**, including Next.js TypeScript checking, page-data collection and route generation for both new point pages. The final seed/test additions were included in this build. The verified project dev server was stopped during generation/build to release Prisma's Windows DLL and restarted afterward.

## What the targeted tests cover

Point types/defaults, concurrent engagement-specific numbering, derived actor/firm identity, exact decimal references, active same-firm assignees, engagement visibility, reassignment/history, chronological parent-linked replies, foreign-parent rejection, immutable responses, non-resolution informational lifecycle, clarification, explicit resolution and closure, reasoned reopening, original resolution preservation, timezone/DST/calendar aging, overdue dates, current-stage and engagement-wide blockers, future-stage behavior, final completion rechecks, override permission/audit, combined checklist/point gate rollback, checklist link consistency, no automatic cross-engine completion, attachment authorization/unavailability, custom permission grants/revocation, cross-tenant reads/writes/history, database identity/FK/delete protection, concurrent point writes, point-vs-workflow races, search/filter pagination, summary totals and My Work without allocation-budget changes.

The Chrome test exercises Raise Point from a checklist with its item preselected, creation/reference amount/blocking, Queries navigation, two responses including a threaded reply, resolution, reopening after a page reload, workflow warning with point link, overview filtering, related checklist points and Points Assigned to Me. It asserts no browser page errors.

## Unexecuted checks and limits

No full Builds #1–#6 Chrome regression, foundation/client/engagement service suite, exhaustive browser/role/filter matrix, load test, production browser test, or persistent upload/download test was run. File storage does not exist yet, so successful uploads/downloads are not claimed. No screenshot regeneration or repeated full-repository analysis was performed. The initial existing-suite runs above are the compatibility checks; earlier verification documents remain historical rather than new results.

## Manual verification

1. Open the local app at `http://127.0.0.1:3000` using an existing demo management account. No passwords or credentials were changed.
2. Open a demo Monthly Close, Tax or `DEMO-B7-AUDIT` engagement → Queries. Inspect the summary, aging buckets, filters and point table. Select Open/Blocking/Overdue counts from Engagement Overview to verify filtered navigation.
3. Raise a Question or Review Point. Supply title, description, assignee, optional stage/checklist, due date, references and blocking flag. Check its unique engagement-prefixed number and authenticated Raised By.
4. Open it, add a response, then select that response under Reply To and add a child reply. Confirm Responded does not mean Resolved and both authors/timestamps remain visible.
5. As an authorized reviewer/manager, Resolve with a reason, Close, and Reopen with a reason. Inspect status history to see all prior transitions and the original resolution. Reassign and confirm the conversation remains intact.
6. Raise a Knowledge / Instruction point. It must stay Active after a reply, offer Archive/Reactivate and never block a workflow or contribute to open-aging totals.
7. From an unfinished checklist item, Raise Point. Verify the preselected item/stage and the related point link after returning. Resolve the point and confirm the checklist status is unaffected; complete a checklist and confirm its unresolved points remain unresolved.
8. Attempt Forward with a current-stage or engagement-wide blocker. Inspect its number/title in the warning. An authorized workflow manager can override only with the additional permission and a reason. Required checklist items still enforce their own independent gate. Final completion rechecks earlier unresolved blockers.
9. Open the same point in two tabs. Change it in one, then submit the old revision in the other: expect a refresh/conflict message. Point changes also invalidate old workflow movement forms.
10. Open My Work as the assignee. Use All Assigned Points to include informational/terminal points. Compare planned allocation totals before and after point assignment; they must remain unchanged.
11. Check the attachment notice on point detail. Upload/download controls must remain unavailable. The External classification must not expose a public page or send a message.
12. Try point URLs/response/history/attachment operations with another firm's account or an employee without engagement visibility. Access must fail. Configure custom point permissions explicitly; role names alone do not grant authority.

## Next build

The model, tenant-safe relationships and audit/revision boundaries are available for Build #8. Persistent secure attachments remain the explicit outstanding infrastructure limitation allowed by this build. Build #8 was not started.
