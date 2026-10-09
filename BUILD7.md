# Build #7 — Queries / Open Points Engine

Build #7 extends the existing Firm → Client → Engagement → Workflow Stage → Checklist / Points architecture. It reuses authenticated engagement visibility, configurable permission keys, the firm transaction lock, integer revisions, AuditLog, existing forms and navigation. It introduces no second workflow system and no scheduled/actual hours. The clean starting checkpoint is `3405afece79e7f2ed4d5df86cf60aafd12a2d755`, tagged `setu-build-6-checkpoint`.

## Data and integrity

Migration `202610040002_points` adds:

- `EngagementPoint`: one engine for Question, ReviewPoint, KnowledgeInstruction and InternalIssue; numbering, ownership, priority, classification, optional stage/checklist links, exact decimal references, due date, blocking flag, resolution/closure timestamps and revision.
- `PointResponse`: chronological responses with optional parent response. Composite foreign keys bind parents to the same firm and point.
- `PointAttachment`: point/response metadata, private storage reference, uploader, verification/removal timestamps. No binary content is stored in PostgreSQL.

New enums: `PointType`, `PointStatus`, `PointAudience`. Existing engagement priority is reused. `Reference Amount` and `Prior-Year Amount` use Decimal(18,2); the service validates decimal strings and does not round money through JavaScript floating point. No currency conversion or implied accounting posting exists.

Point numbering uses a firm-locked, engagement-specific integer sequence: `<engagementCode>-Q001`, then Q002, etc. Every type uses the same sequence. Number and sequence have engagement-scoped uniqueness constraints; the original number remains unchanged if the engagement code later changes. Existing identifier conventions and UUIDs remain intact.

Composite relationships enforce tenant membership and engagement/workflow/stage/checklist consistency. A checklist link always derives its workflow and stage; a contradictory stage is rejected. A stage without its workflow is invalid. Database checks enforce nonblank content, valid informational/actionable lifecycles, completion fields and positive revisions. Original authorship, type, engagement, number and created timestamp are immutable. Points and attachment metadata cannot be hard-deleted; responses cannot be edited/deleted. No deletion endpoints exist.

## Lifecycle and ownership

Question, Review Point and Internal Issue start Open. Unresolved statuses are Open, Responded, Clarification Required and Reopened. A reply may mark Responded; it never resolves. A separate Resolve action requires `points.resolve` and a resolution reason, records actor/time and preserves the conversation. Only Resolved actionable points can be Closed. Reopening Resolved/Closed points requires `points.reopen` and a reason, returns to Reopened and clears current resolution/closure fields while retaining all historical events.

Knowledge / Instruction uses Active → Archived, with explicit Reactivate returning to Active. It cannot be blocking or enter the actionable resolution lifecycle. Replies to an active instruction keep it Active. Closed/resolved/archived threads require reopening before further replies or content edits; reassignment remains auditable and does not erase responses.

Creation requires `points.create`, `points.assign`, `points.view` and engagement access. Assignees must be active same-firm employees with an active role, point-view permission and existing engagement visibility. Assignment does not grant record access. The authenticated actor supplies Raised By and response authorship; browser-supplied identity fields are not trusted. Reassignments require a reason and preserve old/new assignee information in AuditLog. Point type and original identity cannot be edited; descriptions, links, reference fields, priority, due date, classification and blocking may be edited with permission and a reason.

## Aging, summaries and filters

Aging is calendar days from the original raised date to today, with both dates interpreted in the firm's IANA timezone. Daylight-saving changes do not convert aging into elapsed 24-hour periods. Reopening retains the original raised-date age. Future timestamps clamp to zero. No aging counter is stored.

Buckets: 0–2, 3–5, 6–10 and over 10 days. Only unresolved actionable points enter current aging, overdue and blocking totals. Overdue means a due date before today in the firm's timezone. Resolved, Closed and all Knowledge/Instruction records are excluded. The Open indicator includes all unresolved actionable statuses; Awaiting Response excludes Responded. Resolved counts currently Resolved, not Closed. Total includes every matching type/status. Queries summaries and aging buckets follow the selected filters and cover the complete filtered result, not just the current page.

Queries supports type, status, assignee, raiser, priority, exact due date, blocking yes/no, stage, checklist, and search across number/title/description. Views additionally filter Open actionable, Overdue actionable and Unresolved blocking. Lists use 25-row server-side pagination with deterministic ordering. Point details independently paginate responses/history together: responses oldest first, audit events newest first, 25 each per page; parent excerpts remain visible across pages.

## Pages and API

- `/engagements/:id?tab=queries`: Queries tab, summary indicators, aging buckets, search, filters and Raise Point.
- `/engagements/:id/points/new`: point form, with optional `checklistItemId` preselection.
- `/engagements/:id/points/:pointId`: metadata, conversation, lifecycle actions, assignment/edit sections, attachments availability and activity/status history. The engagement in the URL must match the point.
- Engagement Overview: Open, Blocking and Overdue counts link to filtered Queries.
- Checklist detail: up to 25 recent related points, View All and Raise Point with the checklist/engagement preselected.
- My Work: separately paginated Points Assigned to Me, defaulting to unresolved actionable points. All assigned points also includes informational and terminal records. Neither points nor their assignments enter WorkAllocation totals.

API routes:

- `GET/POST /api/points/engagement/:engagementId`: filtered list or creation.
- `GET /api/points/engagement/:engagementId/options`: scoped employees and link choices.
- `GET /api/points/mine`: employee-pinned queue; forged employee filters are rejected.
- `GET /api/points/:pointId?page=1`: point, responses, parent excerpts, attachment metadata and AuditLog history.
- `POST /api/points/:pointId`: revision-checked reply, assign, edit, status, resolve, reopen or close action.
- Point/response attachment endpoints check record/response authorization and then report unavailable storage.

Point timestamps render with an explicit UTC label; raised-date/age/overdue calculations use the firm's timezone. Classification is Internal or Client-facing / External, but both remain internal authenticated data. There are no public point routes, client logins, external email or notifications.

## Workflow and checklist boundaries

Normal Forward and Skip transitions inspect unresolved blockers with no stage (engagement-wide), or linked to the current stage. Future-stage blockers do not prematurely stop earlier stages. Final Complete checks every unresolved blocker in the engagement, including earlier-stage exceptions. The movement panel identifies the blocking points when the employee has point-view permission; otherwise it exposes only the blocking count.

An override requires the existing workflow-management authority **and** `points.override_blocking`, a nonblank reason, and the ordinary movement permission. It records actor, timestamp, reason, point identifiers, stage and workflow revision in AuditLog; the reason is also retained in movement comments. The Build #6 required-checklist gate remains independent. If either gate refuses movement, the transaction rolls back both movement and any tentative override audit entries.

Creating/editing/responding/resolving/reopening/closing points uses the same firm lock as workflow movement, and increments the workflow revision when a workflow exists. Point writes compare their own revisions too. Stale screens return 409 rather than overwriting newer data. New or reopened blockers on already completed/skipped stages require returning/reopening the workflow first; an existing prior-stage blocker may still be resolved after an override. Completed/cancelled engagements cannot receive new or reopened points until their lifecycle is resumed.

Point resolution never completes a checklist item. Checklist completion never resolves a point. These are explicit relationships and independent responsibilities.

## Permissions and audit

Keys: `points.view/create/reply/assign/edit/resolve/reopen/close/override_blocking/attach`. Runtime decisions use these keys, not role-name strings. The additive migration grants recognized default roles; custom roles remain explicitly configurable. All default operational roles receive view/create/reply/assign/attach. Reviewer and management defaults additionally receive edit/resolve/reopen/close. Management defaults receive override_blocking. Linking a stage or checklist additionally requires the respective viewing permission.

Every point read, response, history access, mutation and attachment operation derives firm from the session and checks engagement visibility. Every write revalidates identity inside the transaction. Existing bounded JSON request handling and origin checks are reused. Point identities never grant otherwise missing engagement visibility.

AuditLog is the single status/event history store; no redundant PointStatusHistory table was introduced. Created, replied, reassigned, edited, status_changed, resolved, reopened, closed, archived and blocking_override events include meaningful before/after values and reasons. Responses store their text/authorship once; reply audits refer to the response ID. Prior resolution events remain available after reopening.

## Attachments limitation

Build #6 supplied metadata and a disabled interface, not persistent secure storage. Build #7 follows the same explicit limitation: **no working point or response uploads/downloads**. Metadata reserves private references, same-point response relationships and soft removal. The database permits PDF/XLSX/CSV/PNG/JPEG and a 10 MiB ceiling. There is no API accepting arbitrary storage keys or reporting fabricated upload success.

A future provider must implement private persistence, actual file-size/content-type checks, safe filename handling, server-generated references, authorized streaming, evidence verification and audit on add/removal. These are not claimed as working file-transfer capabilities in this build.

## Demo data and subsequent builds

The existing development seed adds Monthly Close (four examples), Tax (three), Audit (three) and one Knowledge/Instruction point per demo firm. It includes Open, Responded, Resolved and Reopened states, blockers, overdue dates and parent-linked responses. Original raised dates are deliberately backdated in development seeding to demonstrate aging; the HTTP API cannot set them. References `DEMO-B7-*` make seeding repeatable without duplicating points.

The existing demo dataset had no active Audit engagements. One `DEMO-B7-AUDIT` engagement was added per firm, reusing an active demo client and the existing audited service-association workflow. Existing engagements, published templates, checklist snapshots and allocation records were preserved.

Use existing `pnpm db:generate`, `pnpm db:migrate` and development-only `pnpm db:seed` for another checkout. See `BUILD7-VERIFICATION.md` for actual tests and manual steps. Build #8 has not been started. Client Portal, external communication, notifications, actual time, budgets versus actuals, capacity, billing and document management remain outside scope.
