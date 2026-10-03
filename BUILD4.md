# Build #4 — Workflow Templates and Workflow Stages

Build #4 extends the existing PostgreSQL/Prisma, session, RBAC, Client, Engagement, and AuditLog services. Read `BUILD3.md`, `BUILD2.md`, and the foundation sections of `README.md` for the preserved earlier architecture. No checklist, queries, time entry, capacity, notification, or other later module is implemented.

## Blueprints and versions

`WorkflowTemplate` belongs to one Firm and Service Line, with an optional Engagement Type. A family UUID groups numbered versions. Names/version numbers are unique within the firm; family/version numbers are also unique. Templates move from Draft to Published to Archived (an unused draft may also be archived). The builder edits only drafts and replaces their ordered stage definitions inside one transaction. Revision checks reject stale edits and lifecycle actions.

Published definitions cannot be edited. **Create New Version** copies a historical version into a new draft in its family, using the next available version number. **Duplicate Template** copies metadata and stages into a separate version-one family. Neither operation copies runtime data. Archive removes availability for new engagements and clears matching Engagement Type defaults, while preserving existing workflow instances.

`WorkflowTemplateStage` stores name, description, category, default owner type, optional specific user, target calendar days, instructions, required/optional, active, start/completion flags, and sequence. The accessible up/down builder assigns gaps of 10. Publishing validates at least two active distinctly named stages, exactly one first Start and one last Completion stage, both required, valid same-firm active reference records, and valid owner references. Names have no special engine semantics.

Database triggers protect published/archived template definitions and their stages from changes or deletion, including inserts into a historical version. Services provide the friendly validation messages. Draft hard deletion is not exposed.

## Runtime snapshots

`EngagementWorkflow` has one instance per Engagement in V1, its source template/version and name snapshot, status, revision, timestamps, and current-stage pointer. Applying a template requires Published/active status and compatible firm, Service Line, and optional Engagement Type. The apply preview shows stages, owners, and targets. Application copies every active stage into `EngagementWorkflowStage`; runtime code subsequently uses these snapshot definitions. Later template versions and archiving do not change running work.

Instantiation starts exactly one stage, resolves its owner, opens a visit, records Start movement and audit events, and moves the Engagement to In Progress. It does not automatically advance. Workflow selection is also available during Engagement creation; a compatible Engagement Type default is preselected, with an explicit confirmation checkbox and an option to use no workflow. Save as Draft preserves Draft status without starting a workflow; apply it later from the Workflow tab. Configure or clear type defaults on a published template's detail page.

Runtime snapshot fields are immutable at the database layer. Stage state and the latest operational timestamps are projections for fast display, not the complete historical record. On completion, the pointer remains on the designated final stage, but that stage is Completed, there is no Current stage or open visit, and the UI shows no current work owner. A workflow cannot be replaced or deleted in V1.

## Movements, visits, and ownership

`WorkflowMovement` is append-only structured business history: source/target stage, movement type, previous/receiving owner, actor, comment, timestamp, and workflow revision. Types are Start, Forward, Return, Reassign, Skip, Complete, and Reopen. Last Move is the highest revision. AuditLog records the corresponding operational events separately.

`StageVisit` stores stage, owner, entry/exit timestamps, and exit type. It may only be closed once and cannot be deleted. Every stage entry creates a new visit. Reassignment closes the old owner's segment and opens a new segment without resetting the stage's entry time. Summing visit segments supports future duration reporting. Returns and reopenings never overwrite past visits, movements, completion events, or Engagement status history.

Forward completes the current stage and enters the immediate next stage. Return selects an earlier non-completion stage and requires a reason. Return/reopen reset downstream *state* to Not Started, requiring the subsequent path to be worked again; immutable history is retained. Reassign changes the current owner without moving stages. Skip exits only a current optional stage and requires a reason; required Start/Completion stages cannot be skipped. Completing the designated final stage requires all other required stages to be Completed. Reopening requires a reason and an authorized manager's choice of a non-final stage.

Owner defaults resolve from the Engagement's Partner, Manager, Reviewer, or Preparer, from a configured specific user, or to Unassigned/Manual. Every non-null receiving owner must be active, have an active role, belong to the firm, have Engagement/workflow view permission, and already have record visibility. Current ownership **does not grant otherwise-hidden Engagement access**. Staff the Engagement appropriately before assigning it to a restricted user. Authorized overrides may recover work if a default owner has become inactive. Missing default staffing resolves to Unassigned; a manager can reassign it.

## Engagement lifecycle and dates

Engagement Status and Workflow Stage remain separate. Applying/starting changes an eligible Draft/Planned/Assigned/In Progress Engagement to In Progress. Applying to Completed, Cancelled, or On Hold is rejected. Completing a workflow changes the Engagement to Completed with its firm-local completion date. Reopening changes it to In Progress, clears the operational completed date, and preserves earlier completion dates in status history and movements. The workflow's `completedAt` retains its most recent completion even after reopening.

Use the Workflow tab to complete/reopen an Engagement with an instance; direct lifecycle updates cannot bypass the stage engine. Service Line and Engagement Type cannot be changed after application because they define compatibility. Engagement staffing remains editable and resolves on the next stage entry; editing staffing does not silently reassign an already-current stage.

On Hold and Cancelled are still Engagement lifecycle actions, audited by Build #3. They block workflow movement until the Engagement resumes. Cancelled work is excluded from My Work; On Hold work remains visible with an explicit label. History and current assignment are retained. Calendar stage age includes hold time. No workflow hold status, pause-duration calculator, or automatic transition is introduced.

Days in Stage counts firm-local calendar midnight boundaries from the current entry timestamp. DST therefore does not turn a calendar day into a 23/25-hour calculation. Reassignment does not reset age. Target Days is optional, and an age strictly greater than target shows “Stage target exceeded.” Due This Week remains Monday–Sunday in the firm timezone. No holiday calendar, business-day calculation, or escalation is implemented.

## Permissions and record visibility

Template permissions: `workflow_templates.view`, `.create`, `.edit`, `.publish`, `.archive`.

Runtime permissions: `workflows.view`, `.apply`, `.start`, `.move`, `.return`, `.reassign`, `.skip`, `.complete`, `.reopen`, `.manage`.

Every action independently checks its permission and Build #3 Engagement visibility. `workflows.manage` allows ownership override **within that visibility**, not firm-wide access by itself. Without it, the current owner or Engagement Partner/Manager can perform only actions their role permits. Reopen/apply additionally require Engagement Partner/Manager or workflow-manager authority. Applying requires both apply and start.

| Default role | Engagement visibility | Workflow permissions |
| --- | --- | --- |
| Firm Admin | All in firm | All template and runtime permissions |
| Partner | All in firm | View templates; all runtime operations including manage/reopen |
| Manager | Any of their four Engagement staffing slots | View templates; all runtime operations including manage/reopen, within visible records |
| Senior / Reviewer | Reviewer or Preparer | View templates/workflows; move and return only when current owner (or explicit Engagement managerial assignment) |
| Associate / Preparer | Preparer | View workflows; move forward when current owner |

Custom roles use these capabilities, never exact role-name strings at runtime. Names are used only when provisioning/migrating default grants. Template edit alone cannot publish; workflow-manager permission alone cannot move, reassign, reopen, or view hidden work. Workflow summary fields/filters require workflow view permission. Minimal Client information remains available through visible Engagements without granting Client administration.

## Tenant, concurrency, and transaction boundaries

All services derive Firm from the opaque authenticated session. Request `firmId` fields are ignored by parsed inputs. Scoped Engagement lookup runs before workflow/history reads and mutations; scoped template lookup protects all template actions. Foreign IDs receive the same missing-record response as unknown IDs. Owners and template references are checked server-side, and composite tenant foreign keys provide a second layer of protection. Movement and current-stage references include workflow ID so a stage from another workflow cannot be substituted.

The existing `tenantMutation` boundary acquires the firm's PostgreSQL row lock, reloads session/role state, checks permissions, and executes one transaction. A transition requires both expected workflow revision and expected current-stage ID. Two requests from the same revision cannot both commit; the loser receives HTTP 409 with a refresh message. This also prevents same-stage reassignment from evading stale-screen checks.

Close visit, update old/new stage, resolve owner, open visit, append movement, update workflow, synchronize Engagement/status history, and append AuditLog all commit or roll back together. Partial unique indexes allow at most one Current stage and one open visit. Deferred database constraint triggers validate exactly one matching current stage/open owner visit at commit for Active workflows, and zero for Completed workflows. This permits the intermediate transaction steps but rejects partially committed states. Completed date validation failure rolls back all movement changes too.

The existing firm lock deliberately serializes same-firm writes, matching Builds #1–#3. It can be refined to narrower locks after measured contention; no distributed lock or background worker is needed in V1.

## UI, queries, and reporting foundation

- `/templates`: server-paginated search and Service Line/Engagement Type/status filters; template details/builder at `/templates/new` and `/templates/[id]`.
- `/engagements/[id]?tab=workflow`: apply preview; ordered stage state; current-stage card; forward/return/reassign/skip/complete/reopen confirmations; Last Move, paginated movement history and visit segments.
- `/engagements`: Workflow Template, Current Owner, Current Stage filters; optional Current Stage/Owner/Days in Stage/Last Move columns. Existing sorting, pagination, filters and CSV export remain intact; export respects workflow filters but retains the Build #3 CSV column contract.
- `/my-work`: a limited current-stage queue, server-paginated at 25, with due-today/week/overdue, exact stage-name, and Client filters. It is not a task/checklist module.

History pages load 25 movements and 25 visit segments; stage definitions are bounded at 60 per template. Current-stage list queries use batched Prisma relations, not per-row service calls. Tenant/source/status/current-owner/time indexes support these queries. Structured visits/movements support later stage durations, returns, handoffs, bottlenecks, throughput, and cycle-time reports; no Reports module is built here.

## Demo data, migration, and verification

Run migrations and generate Prisma before starting the updated app. Stop/restart a development server if Windows holds the generated Prisma DLL. Do not reset an existing database.

```powershell
node node_modules/prisma/build/index.js generate
node node_modules/prisma/build/index.js migrate deploy
node node_modules/tsx/dist/cli.mjs scripts/test-migrate.ts
node node_modules/tsx/dist/cli.mjs prisma/seed.ts
node node_modules/eslint/bin/eslint.js src scripts tests e2e prisma *.ts *.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run
node node_modules/@playwright/test/cli.js test
node node_modules/next/dist/bin/next build
```

Migrations `202609290002_workflow_engine` and `202610010001_workflow_management` add six models, the optional Engagement Type default, database invariants and permission grants. Existing data is retained. The old UTF-8 conversion helper deliberately refuses unknown new tables; use native PostgreSQL backup/restore for Build #4, not that one-time legacy conversion script.

The idempotent seed adds six Demo CPA Firm blueprints: Monthly Close, Monthly Bookkeeping, Form 1040, Form 1065, Form 1120S, Audit / Assurance. These are data, not product rules. Compatible untouched demo tax engagements receive instances; reruns never reset ongoing work. The other firm's data remains separate. Tests provision separate firms and templates for adversarial tenant checks.

See `BUILD4-VERIFICATION.md` for final command outcomes and manual review steps. Known V1 boundaries: one lifetime instance per Engagement; exact-name stage filtering; accessible up/down ordering instead of drag-and-drop; no required-stage override; calendar days including holds; no notifications or automatic advancement. Later modules remain disabled.
