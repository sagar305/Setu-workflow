# Build #2 — Client Master

This module extends Build #1's Next.js App Router, Prisma/PostgreSQL, session authentication, roles, tenant relationships, and AuditLog. No engagement or workflow implementation is included.

## Architecture

Protected server pages load through `src/lib/client-page.ts`. The existing catch-all API delegates client requests to `client-api.ts`; `clients.ts` owns authorization and business transactions. `client-validation.ts` validates typed input. `client-csv.ts` handles import staging and filtered exports. Client components use the existing shared forms and styling, with `src/app/clients.css` for Client Master layouts.

Every resource query is scoped by the authenticated user's firm. Browser-supplied firm IDs never select a tenant. Mutation transactions reuse Build #1's firm lock and recheck the session and permissions after acquiring it. Composite foreign keys prevent a client from referencing another firm's office, user, entity, service, contact, address, or field. Missing and foreign records have safe not-found responses. This preserves application-enforced tenancy; PostgreSQL row-level security is not enabled.

Mutations retain Origin checks and bounded request bodies. Client edits carry a version to reject stale saves. Contact primary changes are serialized and protected by a partial unique database index. Bulk changes and valid import batches are atomic. Audits use the existing AuditLog and readable descriptions, with no credentials or full sensitive field contents in the client activity response.

## Database

New models: `Client`, `ClientAddress`, `ClientContact`, `EntityType`, `ServiceLine`, `ClientServiceLine`, `ClientCustomFieldDefinition`, `ClientCustomFieldValue`, and `ClientImportJob`.

`202609280001_client_master` adds these models, tenant foreign keys, code uniqueness, primary-contact and typed-value constraints, filter indexes, audit lookup index, and pg_trgm GIN indexes for substring search. It installs Client Master permissions and default catalogs in existing firms. The migration account needs permission to install `pg_trgm` (or an administrator must provision it first).

`202609280002_client_date_constraint` explicitly rejects partly specified tax year ends; SQL CHECK otherwise permits an unknown/null expression. The original Build #1 migration is retained.

Client Code is normalized to uppercase and unique within the firm. Similar normalized legal/display names trigger a warning requiring acknowledgment, rather than a uniqueness restriction. Tax year end is month/day (February 29 allowed); onboarding and termination are calendar dates. Inactive or Terminated clients retain contacts, services, values, and audit history. Standard APIs expose no client/contact deletion.

List filtering, stable sorting, pagination (default 25, maximum 100), and counts execute on the server. Related data uses batched Prisma includes, not one query per displayed client. An integration test exercises 1,000 clients across first and last pages.

## Permissions and temporary visibility

All client operations require `clients.view`, plus the relevant operation permission. For Build #2, a user with this permission can view **all clients in their own firm**. Team/assigned engagement visibility is reserved for Build #3 and is not approximated here.

| Operation | Admin | Partner | Manager | Senior / Associate |
| --- | --- | --- | --- | --- |
| View | Yes | Yes | Yes | Yes |
| Create | Yes | Yes | No | No |
| Edit / bulk changes / field values | Yes | Yes | Yes | No |
| Manage contacts and service associations | Yes | Yes | Yes | No |
| CSV export | Yes | Yes | No | No |
| CSV import | Yes | No | No | No |
| Configure entity types/service lines | Yes | No | No | No |
| Configure custom field definitions | Yes | No | No | No |

Permission keys: `clients.view`, `clients.create`, `clients.edit`, `clients.manage_contacts`, `clients.manage_services`, `clients.import`, `clients.export`, `clients.manage_custom_fields`, `clients.configure`. Custom roles use the existing role editor. Import also requires create permission, and contact/service permissions when those columns are populated. Defining a custom field is separate from editing its client value.

## Screens and daily use

- `/clients`: summary cards, code/name search, status/entity/service/office/partner/manager filters, sorting, pagination, saved per-user column choices, filtered export, and selected-record bulk updates.
- `/clients/new`: core details, ownership, multiple services, primary address, dates, optional primary contact, notes, and custom fields.
- `/clients/{id}`: Overview, Contacts, Services, Custom Fields, Activity. Engagements is disabled with the Build #3 message.
- `/clients/{id}/edit`: edit with duplicate-name warning and optimistic concurrency checks.
- `/clients/settings`: entity types, service lines, and custom-field definitions; deactivate/reactivate without deleting history.
- `/clients/import`: CSV template, upload, mapping, validation preview, error report, and explicit confirmation.

Responsible Partner and Manager must be active same-firm users. An inactive existing owner remains visible in the edit selector and must be explicitly reassigned or cleared. Contacts support multiple entries, optional primary designation, deactivate/reactivate, and reassignment of primary. Deactivating the primary clears the designation; it does not automatically choose another contact.

Custom fields support Text, Number, Date, Boolean, and Dropdown with typed database columns. A definition's type cannot change; used dropdown choices cannot be removed. Deactivating a definition retains existing values. These restrictions protect historical data.

## CSV import

1. Open Import Clients and download the CSV template. XLSX is deferred; use Excel's **CSV UTF-8** save format.
2. Replace the example row. Required columns are Client Code, Legal Name, Entity Type, Status, and Office. Office/entity/service labels must match active records in your firm; partner/manager emails must identify active users.
3. Optional columns: Display Name, Industry, Partner Email, Manager Email, Service Lines, Tax Year End, Onboarding Date, Address Line 1, Address Line 2, City, State, Postal Code, Country, Primary Contact First Name, Primary Contact Last Name, Primary Contact Email, Primary Contact Phone.
4. Separate Service Lines with semicolons. Use `MM-DD` for tax year end and `YYYY-MM-DD` for onboarding. Status accepts Prospect, Onboarding, Active, On Hold (or OnHold), Inactive, Terminated. Quote commas/newlines according to normal CSV rules.
5. Upload up to 500 rows, at most 1 MB. Map alternative headers if necessary, then Validate & Preview. No clients are created during preview.
6. Review warnings/errors and download the row report if useful. Confirm Import Valid Records. Invalid rows are reported and skipped; all valid rows commit together. References are revalidated at commit; a changed reference fails the whole valid batch safely.

Duplicate codes are rejected both against stored clients and within the file. Duplicate names are warnings acknowledged by the import confirmation. Previews are tied to both user and firm, expire after one hour, and successful commit is idempotent. Completed jobs discard normalized staged payloads and retain row outcomes/counts. Uncommitted expired previews require a deployment cleanup/retention policy; they cannot be committed after expiry.

## CSV export

Export CSV uses the current list filters and sorting across all matching pages, checks export permission, and only returns the current firm. Exports include the template columns and active primary contact. Formula-leading spreadsheet values are escaped, including downloadable error reports. The limit is 10,000 clients; larger requests fail with a prompt to narrow filters, never silently truncate. Export is a client directory, not a full database backup (notes, all contacts, and custom values are not included).

## Seed, migrations, and local database

Run `npm run db:migrate`, `npm run db:generate`, and `npm run db:seed` with the existing local configuration. On this machine npm is not on PATH; equivalent direct Node commands are in the verification report.

The seed adds five sample clients per demo firm, contacts, addresses, several statuses/services, and all five custom-field types. It reuses existing users/offices and skips existing client codes. Both demo firms remain isolated even where their client codes match. `SEED_PASSWORD` remains in the private `.env`; this build does not replace passwords. Browser tests create additional clearly named fixture records in the local development database; integration tests use `setu_test`.

The old local Windows database used WIN1252. `scripts/local-utf8.ts` converted the local development and test databases to UTF-8 while preserving rows. It retains the originals as `setu_backup_1790617557561` and `setu_test_backup_1790617565347`, plus private JSON backups under `.local/backups`. No original database was dropped. New local database initialization explicitly uses UTF-8. This repair script is local-only, refuses non-loopback/nonstandard database targets, and should run with the application stopped if ever needed; current databases already use UTF-8.

## Verification and limitations

See `BUILD2-VERIFICATION.md` for exact commands, results, changed modules, and manual checks. CSV-only import/export, bounded batch sizes, firm-wide client visibility, and manual cleanup of expired staged imports are explicit limitations. Existing Build #1 production-hardening notes still apply. Build #3 has not been started.
