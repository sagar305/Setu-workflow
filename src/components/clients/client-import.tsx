"use client";
import { useState } from "react";
import Link from "next/link";
import { Field } from "@/components/form";
const clientColumns = [
  "Client Code",
  "Legal Name",
  "Display Name",
  "Entity Type",
  "Status",
  "Industry",
  "Office",
  "Partner Email",
  "Manager Email",
  "Service Lines",
  "Tax Year End",
  "Onboarding Date",
  "Address Line 1",
  "Address Line 2",
  "City",
  "State",
  "Postal Code",
  "Country",
  "Primary Contact First Name",
  "Primary Contact Last Name",
  "Primary Contact Email",
  "Primary Contact Phone",
];
type Preview = {
  jobId: string;
  valid: number;
  errors: number;
  warnings: number;
  rows: {
    row: number;
    code: string;
    name: string;
    errors: string[];
    warnings: string[];
  }[];
};
async function request<T>(resource: string, action: string, data: unknown): Promise<T> {
  const r = await fetch(`/api/${resource}/import/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(body.error);
  return body;
}
export function ClientImport({ resource = 'clients', columns = clientColumns, allowServiceAssociation = false }: {resource?: 'clients' | 'engagements'; columns?: readonly string[]; allowServiceAssociation?: boolean}) {
  const title = resource === 'clients' ? 'Clients' : 'Engagements';
  const [associateServices, setAssociateServices] = useState(false);
  const [csv, setCsv] = useState(""),
    [fileName, setFileName] = useState(""),
    [headers, setHeaders] = useState<string[]>([]),
    [mapping, setMapping] = useState<Record<string, string>>({}),
    [preview, setPreview] = useState<Preview | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState("");
  return (
    <>
      <Link className="back-link" href={`/${resource}`}>
        ← {title}
      </Link>
      <div className="page-heading">
        <p className="eyebrow">CONTROLLED IMPORT</p>
        <h1>Import {title}</h1>
        <p className="muted">
          Upload → map columns → validate → preview → import.
        </p>
      </div>
      <section className="card client-form-section">
        <h2>1. Upload CSV</h2>
        <p className="muted">
          UTF-8 CSV, up to 500 records and 1 MB. {resource === 'clients' ? 'Separate service names with semicolons.' : 'One Service Line per engagement.'} No records are created until you confirm the preview.
        </p>
        <a
          className="button secondary spaced"
          href={`/api/${resource}/template`}
          download
        >
          Download import template
        </a>
        <Field label={resource === 'clients' ? 'Client CSV file' : 'Engagement CSV file'}>
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setPreview(null);
              setHeaders([]);
              setDone("");
              setError("");
              if (
                !file.name.toLowerCase().endsWith(".csv") ||
                file.size > 1_000_000
              ) {
                setError("Choose a CSV file smaller than 1 MB.");
                return;
              }
              setBusy(true);
              try {
                const text = await file.text();
                const result = await request<{ headers: string[] }>(resource, "inspect", {
                  csv: text,
                });
                setCsv(text);
                setFileName(file.name);
                setHeaders(result.headers);
                setMapping(
                  Object.fromEntries(
                    columns.map((c) => [
                      c,
                      result.headers.includes(c) ? c : "",
                    ]),
                  ),
                );
              } catch (e) {
                setError(e instanceof Error ? e.message : "Upload failed.");
              } finally {
                setBusy(false);
              }
            }}
          />
        </Field>
      </section>
      {headers.length > 0 && !done && (
        <section className="card client-form-section">
          <h2>2. Map columns</h2>
          <p className="muted">
            Required: {resource === 'clients' ? 'Client Code, Legal Name, Entity Type, Status, Office.' : 'Engagement Code, Client Code, Engagement Name, Service Line, Engagement Type, Office.'}
          </p>
          <div className="mapping-grid">
            {columns.map((c) => (
              <Field label={c} key={c}>
                <select
                  value={mapping[c] ?? ""}
                  disabled={busy}
                  onChange={(e) => {
                    setMapping({ ...mapping, [c]: e.target.value });
                    setPreview(null);
                  }}
                >
                  <option value="">Not mapped</option>
                  {headers.map((h) => (
                    <option key={h}>{h}</option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
          {resource === 'engagements' && allowServiceAssociation && <label className="checkbox"><input type="checkbox" checked={associateServices} onChange={e=>{setAssociateServices(e.target.checked);setPreview(null);}}/>I permit adding a listed Service Line to its Client when not already associated. Preview warnings will identify affected rows.</label>}
          <button
            className="button primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                setPreview(
                  await request<Preview>(resource, "preview", { csv, fileName, mapping, associateServices }),
                );
              } catch (e) {
                setError(e instanceof Error ? e.message : "Validation failed.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Validating…" : "Validate & Preview"}
          </button>
        </section>
      )}
      {preview && !done && (
        <section className="card client-form-section">
          <h2>3. Review validation results</h2>
          <p className="import-summary">
            <strong>{preview.valid} valid</strong>
            <span>{preview.warnings} with warnings</span>
            <span>{preview.errors} invalid</span>
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>CSV row</th>
                  <th>Code</th>
                  <th>Legal Name</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.row}>
                    <td>{r.row}</td>
                    <td>{r.code}</td>
                    <td>{r.name}</td>
                    <td>
                      {r.errors.length
                        ? r.errors.join(" ")
                        : r.warnings.length
                          ? r.warnings.join(" ")
                          : "Valid"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            className="button secondary spaced"
            onClick={() => {
              const rows = [
                ["Row", "Code", "Errors", "Warnings"],
                ...preview.rows.map((r) => [
                  String(r.row),
                  r.code,
                  r.errors.join("; "),
                  r.warnings.join("; "),
                ]),
              ];
              const text = rows
                .map((row) =>
                  row
                    .map(
                      (s) =>
                        '"' +
                        (/^[=+\-@\t\r]/.test(s) ? "'" : "") +
                        s.replaceAll('"', '""') +
                        '"',
                    )
                    .join(","),
                )
                .join("\r\n");
              const url = URL.createObjectURL(
                new Blob(["\ufeff" + text], { type: "text/csv" }),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = `${resource}-import-report.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Download validation report
          </button>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                const result = await request<{ message: string }>(resource, "commit", {
                  jobId: preview.jobId,
                  confirmed: true,
                });
                setDone(result.message);
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "Import failed. Revalidate the file before retrying.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="checkbox">
              <input type="checkbox" required disabled={busy} />I reviewed the
              warnings and confirm importing {preview.valid} valid records.
              Invalid rows will be skipped.
            </label>
            <button
              className="button primary"
              disabled={busy || !preview.valid}
            >
              {busy ? "Importing…" : "Import Valid Records"}
            </button>
          </form>
        </section>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {done && (
        <section className="notice success" role="status">
          <p>{done}</p>
          <Link className="button secondary spaced" href={`/${resource}`}>
            View {title}
          </Link>
        </section>
      )}
    </>
  );
}
