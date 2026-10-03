# Build #3 — Engagement Master

The hierarchy is Firm → Client → Engagement. Engagements are specific pieces of client work, not workflow stages or tasks. Build #3 extends Build #1 authentication, RBAC, tenant transactions, AuditLog, and Build #2 Client/ServiceLine records. Prior documentation is retained in README.md, BUILD2.md, VERIFICATION.md, and BUILD2-VERIFICATION.md.

## Architecture and models

The new service boundary is `src/lib/engagements.ts`, with validation in `engagement-validation.ts`, CSV handling in `engagement-csv.ts`, and HTTP dispatch in `engagement-api.ts` through the existing catch-all API. Protected server pages use `engagement-page.ts`; React components stay within the existing design system.

`Engagement` holds a same-firm Client, ServiceLine, EngagementType, Office, four nullable staff references, lifecycle status, explicit priority, period/year, schedule, budget hours, recurring indicator, notes, creator/updater, and optimistic version. Engagement Codes are uppercase-normalized and unique per firm. Codes are entered manually; no numbering engine is added. ServiceLine is reused, never duplicated.

`EngagementType` is a firm-owned configurable catalog, optionally linked to a ServiceLine. The link is a classification/default hint, not a tax-form-specific restriction. Deactivating types preserves existing engagement links but prevents new assignments of that type.

`EngagementAssignmentHistory` and `EngagementStatusHistory` are structured append-only application histories for future reporting. Assignment history records slot, old/new user, old/new allocation date, actor, and timestamp. Status history records old/new status, old/new completion date, comment, actor, and timestamp. These rows are inserted transactionally with the engagement and readable AuditLog event. No public API edits/deletes history. Database owner access is still governed by the existing production-hardening requirements.

`EngagementCustomFieldDefinition` and `EngagementCustomFieldValue` keep engagement definitions separate from clients. Both modules share the existing five-type enum, definition validation, typed-value validator in `custom-field-values.ts`, and field input components. Separate typed persistence avoids unsafe polymorphic foreign keys. Definition types cannot change; used dropdown choices cannot be removed; deactivated definitions retain values.

`EngagementImportJob` tracks creator, firm, staged preview, expiry, row outcomes, completion, and imported count.

## Staffing and history

One Partner, Manager, Reviewer, and Preparer are supported by fixed nullable composite foreign keys. This keeps V1 forms and tenant constraints simple. Structured history already identifies the staffing slot; a future multiple-assignee model can add an assignment join table without rewriting historical events.

All selected staff must be Active, belong to the engagement firm, and have an active role. Assignment is capability-based and does not require an exact role name. Client selection defaults Office, Partner, and Manager, with active users only. A single active client service is preselected; multiple services require a choice. Defaults can be overridden by authorized users.

Changing Preparer or Allocation Date appends history. Team editing shows the existing allocation date for explicit retention or replacement; clearing the Preparer requires clearing Allocation Date. Reassigning yourself off a restricted record can remove your access, so Team saves return to the visible engagement list.

## Status, period, and budget

Lifecycle statuses are Draft, Planned, Assigned, In Progress, On Hold, Completed, and Cancelled. They are independent of future Workflow Stages. Creation offers Save as Draft or Create Engagement (Planned). Status changes use a dedicated permission and form with an optional comment. Completed requires Completed Date; reopening clears the current completion date while retaining every completion event in structured history and AuditLog.

Priority is explicitly Low, Normal, High, or Urgent (default Normal). No AI or hidden score exists.

Periods: Monthly, Quarterly, Annual, Tax Year, Custom, Not Applicable. Monthly/Quarterly/Annual/Custom require explicit start and end dates. Tax Year accepts a reporting year and/or explicit dates. Not Applicable requires dates/year to be empty. Both period dates must be supplied together, end cannot precede start, and real calendar dates are validated. No jurisdiction-specific tax assumptions or recurrence generation are implemented.

Schedule includes Allocation, Planned Start, Actual Start, Due, and Completed dates. Due cannot precede Planned Start; completion cannot precede Actual Start. Late starts or late completion remain legitimate business events. Dates are stored as PostgreSQL DATE, independent of timestamp timezone conversion.

Budget Hours is optional, finite, nonnegative, and at most 1,000,000 hours, guarded by `engagements.manage_budget`. Zero remains distinct from an unknown budget. There is **no stored editable Actual Hours field**. The UI says Not available yet; future actual hours must be derived from time entries.

Recurring is only a Yes/No classification. Nullable recurrence reference reserves linkage for a future recurrence service; V1 does not expose a free-form recurrence editor or generate work.

## Permissions and precise visibility

Every operation requires `engagements.view`. Record visibility is checked in list, detail, activity, export, Client tab, and every mutation, with firm scope always applied.

| Default role | Engagement visibility | Operations |
| --- | --- | --- |
| Firm Admin | All in firm | All engagement permissions, catalogs, import/export |
| Partner | All in firm | Create/edit, assign, change status, manage budget, export |
| Manager | Records where personally Partner, Manager, Reviewer, or Preparer | Create/edit, assign, change status, manage budget, export within this scope |
| Senior / Reviewer | Personally Reviewer or Preparer | View only |
| Associate / Preparer | Personally Preparer | View only |

Runtime logic never checks role names. Scope capabilities are additive: `engagements.view_all` allows all same-firm records; `engagements.view_staffed` allows any of the four personal slots; `engagements.view_review` adds Reviewer visibility; bare `engagements.view` allows Preparer visibility. Manager's reporting hierarchy is not implicitly expanded. Custom roles require explicit engagement permissions; pre-existing generic future `visibility.*` permissions do not silently broaden engagement access.

Operation permissions: `engagements.create`, `.edit`, `.change_status`, `.assign`, `.manage_budget`, `.import`, `.export`, `.manage_custom_fields`, `.configure`. General edit cannot bypass budget/staff/status permissions; endpoint-specific requests discard unrelated fields. A scoped creator must assign themselves to a slot their visibility permits, otherwise creation is rejected. Permission and session checks repeat inside the existing firm-lock transaction.

**Client visibility remains independently controlled by Build #2.** Existing `clients.view` grants firm directory access, not new administration rights. Engagement visibility does not grant Client editing, contacts, or service administration. An engagement-only custom role receives the minimum related client code/name/entity details needed for its visible engagements; full Client links are omitted. Client picker results are capped at 30 and restricted to visible engagement clients unless the user already has directory or engagement-create permission.

## Tenant isolation and integrity

All queries derive firm from authenticated sessions. Composite foreign keys link each Engagement to same-firm Client, Office, ServiceLine, EngagementType, assigned users, creator/updater, histories, and custom field definitions. Cross-firm IDs cannot pass server validation or database constraints. Unauthorized engagement IDs return the same not-found response as missing IDs.

Mutations reuse the existing serialized firm transaction and session recheck. Version checks prevent lost updates. Bulk changes first validate the entire visible selection and then run atomically. API Origin validation, bounded streamed JSON bodies, safe errors, and no-store responses remain intact. Standard hard deletion is unavailable; use Cancelled.

AuditLog records creation, updates, assignments/allocation changes, status changes, completion/reopening/cancellation, budgets, priority, due dates, office/service/type changes, custom values, bulk changes, and imports. Material ownership/budget/status changes use readable before/after values; descriptions/notes are identified as changed without dumping their full content. Activity exposes only business descriptions, timestamp, actor, and action.

## Client integration and screens

- `/engagements`: searchable/paginated list, all requested filters, optional columns, bulk actions, import/export, and five summary cards.
- `/engagements/new`: client search (30 results; refine search), defaults, six form sections, and shared custom field inputs.
- `/engagements/{id}`: Overview, Team, Activity; Edit, Change Status, Reassign actions based on permissions.
- `/engagements/{id}/edit`: optimistic edits with independent field permissions.
- `/engagements/settings`: Engagement Types and custom-field definitions.
- `/engagements/import`: CSV upload/map/validate/preview/confirm.
- `/clients/{id}?tab=engagements`: only this client's engagements intersected with the user's engagement visibility; Active/Completed/All filters and New Engagement with preselected Client.

Workflow, Checklist, Queries, Deliverables, and Time tabs are disabled. No partial workflow engine is present.

Overdue means Due Date < today's calendar date in the Firm timezone, excluding Completed and Cancelled. It is a derived label, never a status, and includes visible text as well as color. Due This Week means Monday through Sunday in that timezone, also excluding Completed/Cancelled. Summary cards cover all engagements the user can view; list filters separately narrow rows. Due/period ranges are inclusive, and period filters find overlapping explicit periods (year-only records have no explicit interval).

## CSV import and export

Download the template from Import Engagements. Required columns: Engagement Code, Client Code, Engagement Name, Service Line, Engagement Type, Office. Optional columns: Period Type, Period Start, Period End, Reporting Year, Partner Email, Manager Email, Reviewer Email, Preparer Email, Allocation Date, Planned Start Date, Due Date, Budget Hours, Priority, Status, Recurring, Description, Completed Date.

Use UTF-8 CSV, ISO `YYYY-MM-DD` dates, configured labels, and exact active user emails. Recurring accepts Yes/No or true/false. Blank Status defaults Planned; blank Priority defaults Normal; blank Period Type defaults Not Applicable. Completed Date permits historical completed work to be imported without inventing a completion date. Unknown users/catalogs are never created or mapped outside the firm.

Upload up to 500 rows / 1 MB, optionally map headers, validate, review per-row errors/warnings, and explicitly confirm valid rows. Preview creates no Engagements. Valid rows commit in one transaction; known invalid rows are reported and skipped. References and permissions are revalidated on commit, and a changed reference rolls back the whole valid batch. Previews are creator-bound, expire after one hour, and successful commits are idempotent. Completed previews discard normalized payloads.

A service not already associated with a client requires explicit approval and `clients.manage_services`. In a form, check the confirmation checkbox. During import, optionally permit associations before preview; affected rows show warnings. Without that approval, these rows are invalid. Existing associations are never silently replaced.

Filtered CSV export honors firm, record visibility, search, filters, and sorting across pages. Formula-leading cells are escaped. Exports above 10,000 rows are rejected with instructions to narrow filters, never silently truncated. CSV reports are directory/work trackers, not full backups of notes, fields, and all histories. XLSX remains deferred; Excel can save CSV UTF-8.

## Migration, seed, performance, and verification

Migration `202609290001_engagement_master` adds seven models, composite relationships, unique firm/code constraints, DATE/completion/budget/typed-value checks, staff/client/status/due indexes, and pg_trgm code/name indexes using the extension installed in Build #2. It grants default role capabilities to existing firms and seeds 18 engagement types. Internal provisioning now seeds these defaults for new firms; existing custom roles are not automatically granted engagement access.

Run `npm run db:migrate`, `npm run db:generate`, and `npm run db:seed`. Exact direct Node commands used on this machine are in BUILD3-VERIFICATION.md. Prisma remains pinned to 6.19.3. Back up a deployed database and use the established migration process; do not substitute db push.

The idempotent seed adds eight engagements per demo firm with different clients, statuses, dates, staff, offices, services, budgets, and priorities, plus a Complexity field. It skips existing engagement codes and preserves user edits. Explicit seed service associations are audited. Existing demo passwords remain in the private `.env`; no passwords are changed.

List pages load at most 100 records (25 by default), using server-side search/filter/sort/counts and batched related-record reads. Client selectors use server search rather than loading every client. An automated test exercises 10,000 historical engagements and stable first/last-page ordering. This is a correctness/architecture check, not a production load benchmark.

Known limits: one user per staffing slot, manual codes, optional-column choices last for the current page session, CSV-only import/export, bounded batches, and no recursive reporting-team visibility. Expired uncommitted import payloads require a deployment cleanup/retention job. Existing Build #1 production-hardening requirements still apply. No Build #4 features have been started.
