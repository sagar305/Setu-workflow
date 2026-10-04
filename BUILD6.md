# Build #6 — Checklist Engine

Build #6 extends the existing firm, client, engagement, versioned workflow, RBAC, AuditLog and My Work architecture. It does not introduce a second workflow system or alter WorkAllocation calculations. The pre-build repository is preserved in checkpoint commit `a31066e`.

## Data and migration

`202610040001_checklists` adds `ChecklistStatus` and four models:

- `WorkflowTemplateChecklistItem`: draft-editable definitions attached to template stages, with title/code, instructions, order, default ownership, estimates, due offset, required/evidence flags and active flag.
- `EngagementChecklistItem`: independent runtime snapshots linked to engagement/workflow/stage, nullable source definition, owner, due date, revision, status, completion actor/timestamp and creation/update actors.
- `ChecklistComment`: chronological, immutable comments with authorship.
- `ChecklistAttachment`: metadata and a private storage reference reserved for a future secure storage integration. No file bytes are stored in PostgreSQL.

Composite foreign keys bind all records and employees to the same firm and bind runtime stages to their engagement workflow. Database checks enforce positive estimates, nonblank titles, status reasons, completion fields and revisions. Triggers prevent changes to published checklist definitions and deletion of operational checklist history. Comments cannot be rewritten or deleted. Existing AuditLog remains the event history store.

## Templates and instantiation

Open Templates, then create or edit a draft. Each stage has a checklist section with add/edit/remove, move up/down, ownership defaults, relative due days and required/evidence flags. Published versions remain immutable. Duplicate and Create New Version copy definitions into a new draft.

Applying a published template creates stages and checklist snapshots in the existing transaction. Only active definitions on active stages instantiate. Instructions, required flags, estimates and source references are copied. Reapplying an engagement workflow is rejected with a conflict, and a runtime source uniqueness constraint prevents duplicate snapshots. Template edits and new versions never backfill existing workflows.

Due offsets are **calendar days from the workflow application date in the firm's timezone**, not stage-entry offsets or business days. StageOwner defaults resolve from that stage's engagement staffing rule at instantiation. Checklist owners then remain independent: later workflow-owner changes do not silently reassign checklist items. Missing staffing slots leave items unassigned. A specified employee must be active, in the same firm, have checklist and engagement access, and already be able to view that engagement; otherwise application rolls back.

## Engagement interface and rules

Engagement Detail → Checklist shows totals, Completed, In Progress, Blocked, Not Started, percentage, and applicable/Not Applicable counts. Items are grouped by workflow stage. Expand an item for instructions, employee, due date, estimates, status/reasons, completion details, comments, attachments availability and activity history. Inline sections handle edits and reassignment without modal chains.

Manual items require an active workflow and an unfinished stage; they never change the template. Completion records the authenticated actor and timestamp. Blocked and Not Applicable require reasons. Completed and Not Applicable items require an explicit, reasoned Reopen before further status/requirement changes. Reopening returns to In Progress and clears current completion fields; the prior completion event remains in AuditLog. No operational delete API exists.

Progress = Completed / (Total − Not Applicable) × 100, rounded to a whole percentage. A zero denominator displays 0% with “No applicable items.” Required Not Applicable items with recorded reasons satisfy the stage gate.

Normal Forward, Skip and Complete transitions check required checklist items. Complete checks the entire workflow, including earlier overridden items. The movement form shows current-stage required completion/outstanding and blocked counts. A controlled exception needs both workflow management authority and `checklist.override_required`, plus a nonblank reason. Audit records actor, timestamp, workflow revision, stage and outstanding item IDs. Existing movement/visit history is reused.

Completed/skipped stage items cannot be changed through checklist actions until the workflow is returned/reopened to that stage. Comments remain available. Checklist status/requirement edits and creation increment the workflow revision as well as item revisions. All mutations share the existing firm lock, recheck identity/permissions, and compare revisions inside the transaction. Stale screens return 409. This serializes checklist changes against workflow movement.

## My Work and permissions

My Work includes a separate paginated **My Checklist Items** table with client, engagement, item, stage, due date and status. Estimates never create WorkAllocation records, enter allocation totals or represent actual time.

Permission catalog additions: `checklist.view/create/edit/assign/update_status/complete/reopen/override_required/comment/attach` and `checklist_templates.view/create/edit`. Recognized default management roles receive all additions. Reviewer/Preparer roles receive viewing, status, completion, comment and attachment permissions. Custom roles require explicit configuration; runtime authorization uses permission keys, not role names. Template operations additionally retain existing workflow template permissions. Checklist definitions are omitted from public template responses without checklist-template viewing permission.

Every runtime read/write/comment/attachment entry point derives firm from the session and checks engagement visibility. Assignment never grants new visibility. Cross-firm and hidden-record access is rejected server-side. Existing origin checks and bounded JSON reads protect mutations. Attachment storage references are not returned to the browser.

## API

- `GET /api/checklists/engagement/:engagementId`: scoped checklist, stages, eligible employees, progress and permissions.
- `POST /api/checklists/engagement/:engagementId`: manual item; requires current workflow revision.
- `GET /api/checklists/:itemId`: comments, attachment metadata and audit history.
- `POST /api/checklists/:itemId`: discriminated edit/assign/status/reopen/comment actions; requires item revision.
- `GET /api/checklists/mine?page=1`: authenticated employee's checklist queue, 25 rows per page.
- Attachment upload/download paths authorize the item and then return 503 while storage is unavailable.

## Attachments — explicit limitation

The repository has no persistent secure file-storage integration. **Uploads and downloads are not functional.** The UI says so and disables upload; evidence-required completion is blocked even if metadata is inserted directly. The metadata schema has a 10 MiB size ceiling and PDF/XLSX/CSV/PNG/JPEG media-type constraints. There is no endpoint accepting arbitrary storage keys, external links or fake proof of upload.

A later storage integration must add persistent private objects, content/type and safe-filename validation, server-generated keys, authorized streaming downloads, verified-evidence checks and audited soft removal. These are not claimed as implemented file-transfer capabilities.

## Demo data and operating notes

Development seeding creates editable new draft versions for the existing Monthly Close, Monthly Bookkeeping, Form 1040, Form 1065, Form 1120S and Audit / Assurance demo families where checklist definitions are absent. Existing published versions and runtime engagements are preserved. The drafts include the requested accounting examples; adapt their stages/instructions before publishing. They are examples, not accounting standards. No automatic publication occurs.

Run the existing `pnpm db:migrate`, `pnpm db:generate` and development-only `pnpm db:seed` commands when setting up another checkout. Migration grants default roles additively. No environment credential or storage secret was introduced. See `BUILD6-VERIFICATION.md` for actual checks and manual steps.

Build #7 can reuse the engagement/checklist identity, visibility, revision and audit boundaries. Checklist comments remain simple comments, not Queries/Open Points. Build #7 was not started. Actual time, billing, notifications, capacity forecasting, portals and document management remain outside this build.
