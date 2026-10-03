import Link from "next/link";
import { currentUser, sessionToken } from "@/lib/session";
import { hasPermission } from "@/lib/auth";
import { notFound } from "next/navigation";
import { listTemplates, templateOptions } from "@/lib/workflow-templates";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const actor = await currentUser();
  if (!hasPermission(actor, "workflow_templates.view")) notFound();
  const token = await sessionToken(),
    query = await searchParams;
  const [data, options] = await Promise.all([
    listTemplates(token, query),
    templateOptions(token),
  ]);
  const url = (page: number) =>
    "?" + new URLSearchParams({ ...query, page: String(page) });
  return (
    <>
      <div className="page-heading client-heading">
        <div>
          <p className="eyebrow">WORKFLOW TEMPLATES</p>
          <h1>Workflow Templates</h1>
          <p className="muted">
            Reusable blueprints. Preserved versions. Independent Engagement
            workflows.
          </p>
        </div>
        {hasPermission(actor, "workflow_templates.create") && (
          <Link className="button primary" href="/templates/new">
            + New Workflow Template
          </Link>
        )}
      </div>
      <form className="card client-form-section">
        <div className="form-grid">
          <label>
            Search
            <input
              name="q"
              defaultValue={data.filters.q}
              placeholder="Template name"
            />
          </label>
          <label>
            Service Line
            <select
              name="serviceLineId"
              defaultValue={data.filters.serviceLineId ?? ""}
            >
              <option value="">All</option>
              {options.serviceLines.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Engagement Type
            <select
              name="engagementTypeId"
              defaultValue={data.filters.engagementTypeId ?? ""}
            >
              <option value="">All</option>
              {options.types.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select name="status" defaultValue={data.filters.status}>
              <option value="">All</option>
              {["Draft", "Published", "Archived"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
        <button className="button secondary">Filter Templates</button>
      </form>
      <section className="card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {[
                  "Template",
                  "Service Line",
                  "Engagement Type",
                  "Version",
                  "Stages",
                  "Status",
                  "Last Updated",
                  "Action",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link href={`/templates/${t.id}`}>{t.name}</Link>
                  </td>
                  <td>{t.serviceLine.name}</td>
                  <td>{t.engagementType?.name ?? "Any"}</td>
                  <td>V{t.versionNumber}</td>
                  <td>{t.stages.filter((s) => s.active).length}</td>
                  <td>{t.status}</td>
                  <td>
                    {t.updatedAt.toLocaleDateString("en-US", {
                      timeZone: actor.firm.timezone,
                    })}
                  </td>
                  <td>
                    <Link href={`/templates/${t.id}`}>
                      {t.status === "Draft" ? "Edit Draft" : "View"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.total && (
          <p className="empty-state">
            No templates found. Create your first workflow template.
          </p>
        )}
        <div className="pagination">
          <span>
            {data.total} templates · Page {data.filters.page}
          </span>
          {data.filters.page > 1 && (
            <Link href={url(data.filters.page - 1)}>Previous</Link>
          )}
          {data.filters.page * 25 < data.total && (
            <Link href={url(data.filters.page + 1)}>Next</Link>
          )}
        </div>
      </section>
    </>
  );
}
