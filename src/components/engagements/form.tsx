"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Field } from "@/components/form";
import {
  TextField,
  CustomInputs,
  customFormValues,
} from "@/components/clients/fields";
import {
  STAFF,
  PERIODS,
  PRIORITIES,
  DATE_FIELDS,
  engagementLabel,
} from "@/lib/engagement-constants";
import type {
  EngagementOptions,
  EngagementRecord,
  EngagementRights,
  ClientChoice,
} from "./types";
export function EngagementForm({
  options,
  rights,
  record,
  initialClient,
}: {
  options: EngagementOptions;
  rights: EngagementRights;
  record?: EngagementRecord;
  initialClient?: ClientChoice;
}) {
  const router = useRouter();
  const [client, setClient] = useState(initialClient);
  const [choices, setChoices] = useState<ClientChoice[]>(
    initialClient ? [initialClient] : [],
  );
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [ownership, setOwnership] = useState<Record<string, string>>({
    officeId: record?.officeId ?? initialClient?.primaryOfficeId ?? "",
    partnerId:
      record?.partnerId ?? activeDefault(initialClient?.responsiblePartner),
    managerId:
      record?.managerId ?? activeDefault(initialClient?.responsibleManager),
    reviewerId: record?.reviewerId ?? "",
    preparerId: record?.preparerId ?? "",
  });
  const [service, setService] = useState(
    record?.serviceLineId ??
      (initialClient?.services.length === 1
        ? initialClient.services[0].serviceLineId
        : ""),
  );
  const [period, setPeriod] = useState(record?.periodType ?? "NotApplicable");
  const [engagementType, setEngagementType] = useState(
    record?.engagementTypeId ?? "",
  );
  const [selectedWorkflow, setSelectedWorkflow] = useState<string | undefined>(
    undefined,
  );
  const compatible = options.workflowTemplates.filter(
    (t) =>
      t.serviceLineId === service &&
      (!t.engagementTypeId || t.engagementTypeId === engagementType),
  );
  const typeDefault = options.types.find(
    (t) => t.id === engagementType,
  )?.defaultWorkflowTemplateId;
  const workflowTemplateId =
    (selectedWorkflow !== undefined &&
    (selectedWorkflow === "" ||
      compatible.some((t) => t.id === selectedWorkflow))
      ? selectedWorkflow
      : undefined) ??
    (compatible.some((t) => t.id === typeDefault) ? (typeDefault ?? "") : "");
  const preview = compatible.find((t) => t.id === workflowTemplateId);
  const selectClient = (next: ClientChoice) => {
    setClient(next);
    setOwnership((prev) => ({
      ...prev,
      officeId: next.primaryOffice.active ? next.primaryOfficeId : "",
      partnerId: activeDefault(next.responsiblePartner),
      managerId: activeDefault(next.responsibleManager),
    }));
    setService(
      next.services.length === 1 ? next.services[0].serviceLineId : "",
    );
  };
  const unlinked = Boolean(
    client &&
    service &&
    !client.services.some((s) => s.serviceLineId === service) &&
    !(record?.clientId === client.id && record?.serviceLineId === service),
  );
  return (
    <>
      <Link
        className="back-link"
        href={record ? `/engagements/${record.id}` : "/engagements"}
      >
        ← Engagements
      </Link>
      <div className="page-heading">
        <p className="eyebrow">ENGAGEMENT MASTER</p>
        <h1>{record ? "Edit Engagement" : "New Engagement"}</h1>
        <p className="muted">
          Define the work, its owners, schedule, and budget.
        </p>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (pending.current) return;
          pending.current = true;
          setBusy(true);
          setError("");
          const form = new FormData(e.currentTarget);
          const submitter = (e.nativeEvent as SubmitEvent)
            .submitter as HTMLButtonElement;
          const status =
            record?.status ??
            (submitter?.value === "Draft" ? "Draft" : "Planned");
          if (
            !record &&
            status !== "Draft" &&
            workflowTemplateId &&
            !form.has("confirmWorkflow")
          ) {
            setError(
              "Confirm the workflow preview, or choose No workflow yet.",
            );
            setBusy(false);
            pending.current = false;
            return;
          }
          const data = {
            ...Object.fromEntries(form),
            clientId: client?.id,
            serviceLineId: service,
            ...ownership,
            workflowTemplateId:
              !record && status !== "Draft" && rights.workflowApply
                ? workflowTemplateId
                : null,
            status,
            periodType: period,
            recurring: form.has("recurring"),
            associateService: form.has("associateService"),
            budgetHours: rights.budget
              ? form.get("budgetHours")
              : (record?.budgetHours ?? null),
            version: record?.version,
            customFields: customFormValues(form, options.definitions),
          };
          try {
            const response = await fetch(
              `/api/engagements${record ? "/" + record.id : ""}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
              },
            );
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            router.push(
              result.visible ? `/engagements/${result.id}` : "/engagements",
            );
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Unable to save.");
          } finally {
            pending.current = false;
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy}>
          <section className="card client-form-section">
            <h2>Client & Service</h2>
            <div className="eng-client-search">
              <Field label="Find Client">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search client name or code"
                />
              </Field>
              <button
                type="button"
                className="button secondary"
                onClick={async () => {
                  try {
                    const response = await fetch(
                      `/api/engagements/clients?q=${encodeURIComponent(query)}`,
                    );
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.error);
                    setChoices(result);
                  } catch (err) {
                    setError(
                      err instanceof Error ? err.message : "Search failed.",
                    );
                  }
                }}
              >
                Search Clients
              </button>
            </div>
            <div className="form-grid">
              <Field label="Client">
                <select
                  required
                  value={client?.id ?? ""}
                  onChange={(e) => {
                    const next = choices.find((c) => c.id === e.target.value);
                    if (next) selectClient(next);
                  }}
                >
                  <option value="">Select a client</option>
                  {[
                    ...(client && !choices.some((c) => c.id === client.id)
                      ? [client]
                      : []),
                    ...choices,
                  ].map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.displayName} · {c.clientCode}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Service Line">
                <select
                  required
                  value={service}
                  onChange={(e) => setService(e.target.value)}
                >
                  <option value="">Select service</option>
                  {options.serviceLines
                    .filter((s) => s.active || s.id === record?.serviceLineId)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                        {client?.services.some((c) => c.serviceLineId === s.id)
                          ? " · Client service"
                          : ""}
                        {!s.active ? " (inactive)" : ""}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Engagement Type">
                <select
                  name="engagementTypeId"
                  value={engagementType}
                  onChange={(e) => {
                    setEngagementType(e.target.value);
                    setSelectedWorkflow(undefined);
                  }}
                  required
                >
                  <option value="">Select type</option>
                  {options.types
                    .filter(
                      (t) => t.active || t.id === record?.engagementTypeId,
                    )
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                        {t.serviceLineId && t.serviceLineId !== service
                          ? " · Other service"
                          : ""}
                        {!t.active ? " (inactive)" : ""}
                      </option>
                    ))}
                </select>
              </Field>
            </div>
            {client && (
              <p className="muted">
                Client {client.clientCode} · Office:{" "}
                {client.primaryOffice.officeName} · Partner:{" "}
                {personName(client.responsiblePartner)} · Manager:{" "}
                {personName(client.responsibleManager)}
              </p>
            )}
            {unlinked &&
              (rights.associate ? (
                <label className="checkbox">
                  <input type="checkbox" name="associateService" required />I
                  confirm adding this Service Line to the Client.
                </label>
              ) : (
                <p className="notice error">
                  Choose an existing client service. You do not have permission
                  to add a service to this client.
                </p>
              ))}
          </section>
          {!record && rights.workflowApply && (
            <section className="card client-form-section">
              <h2>Workflow Template (optional)</h2>
              <Field label="Workflow Template">
                <select
                  value={workflowTemplateId}
                  onChange={(e) => setSelectedWorkflow(e.target.value)}
                >
                  <option value="">No workflow yet</option>
                  {compatible.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} – V{t.versionNumber}
                    </option>
                  ))}
                </select>
              </Field>
              {preview && (
                <div className="workflow-preview">
                  <h3>
                    {preview.name} – V{preview.versionNumber}
                  </h3>
                  <ol>
                    {preview.stages.map((s, i) => (
                      <li key={i}>
                        {s.name} · {s.defaultOwnerType}
                        {s.targetDays === null ? "" : ` · ${s.targetDays} days`}
                      </li>
                    ))}
                  </ol>
                  <label className="checkbox">
                    <input type="checkbox" name="confirmWorkflow" /> Apply this
                    workflow when creating the Engagement
                  </label>
                  <p className="muted small">
                    Save as Draft preserves Draft status without starting a
                    workflow. You can apply one later.
                  </p>
                </div>
              )}
            </section>
          )}
          <section className="card client-form-section">
            <h2>Engagement</h2>
            <div className="form-grid">
              <TextField
                label="Engagement Code"
                name="engagementCode"
                value={record?.engagementCode}
                required
                maxLength={80}
              />
              <TextField
                label="Engagement Name"
                name="engagementName"
                value={record?.engagementName}
                required
              />
              <Field label="Period Type">
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value as typeof period)}
                >
                  {PERIODS.map((p) => (
                    <option key={p} value={p}>
                      {engagementLabel(p)}
                    </option>
                  ))}
                </select>
              </Field>
              <TextField
                label="Period Start"
                name="periodStartDate"
                type="date"
                value={record?.periodStartDate?.slice(0, 10)}
              />
              <TextField
                label="Period End"
                name="periodEndDate"
                type="date"
                value={record?.periodEndDate?.slice(0, 10)}
              />
              <TextField
                label="Tax / Reporting Year"
                name="reportingYear"
                type="number"
                value={record?.reportingYear}
              />
            </div>
            <label className="checkbox">
              <input
                name="recurring"
                type="checkbox"
                defaultChecked={record?.recurring}
              />
              Recurring engagement (future records are not generated)
            </label>
          </section>
          <section className="card client-form-section">
            <h2>Ownership</h2>
            <div className="form-grid">
              <Field label="Office">
                <select
                  required
                  value={ownership.officeId}
                  onChange={(e) =>
                    setOwnership({ ...ownership, officeId: e.target.value })
                  }
                >
                  <option value="">Select office</option>
                  {options.offices
                    .filter((o) => o.active || o.id === record?.officeId)
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.officeName}
                        {!o.active ? " (inactive)" : ""}
                      </option>
                    ))}
                </select>
              </Field>
              {STAFF.map((key) => (
                <Field
                  key={key}
                  label={key[0].toUpperCase() + key.slice(1, -2)}
                >
                  <select
                    disabled={!rights.assign}
                    value={ownership[key]}
                    onChange={(e) =>
                      setOwnership({ ...ownership, [key]: e.target.value })
                    }
                  >
                    <option value="">Not assigned</option>
                    {options.users
                      .filter(
                        (u) =>
                          (u.status === "Active" && u.role.active) ||
                          u.id === ownership[key],
                      )
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {personName(u)}
                          {u.status !== "Active" || !u.role.active
                            ? " (inactive — choose another)"
                            : ""}
                        </option>
                      ))}
                  </select>
                </Field>
              ))}
            </div>
            <p className="muted small">
              Ownership defaults from the Client and can be overridden.
              Reassignments preserve history.
            </p>
          </section>
          <section className="card client-form-section">
            <h2>Schedule</h2>
            <div className="form-grid">
              {DATE_FIELDS.filter(
                (k) =>
                  !k.startsWith("period") &&
                  (record || !["actualStartDate", "completedDate"].includes(k)),
              ).map((key) => (
                <TextField
                  key={key}
                  label={key
                    .replace(/([A-Z])/g, " $1")
                    .replace(/^./, (c) => c.toUpperCase())}
                  name={key}
                  type="date"
                  value={record?.[key]?.slice(0, 10)}
                />
              ))}
            </div>
            {record && (
              <p className="muted small">
                Current status: {engagementLabel(record.status)}. Use Change
                Status on the detail page to complete or reopen.
              </p>
            )}
          </section>
          <section className="card client-form-section">
            <h2>Budget & Priority</h2>
            <div className="form-grid">
              {rights.budget ? (
                <Field label="Budget Hours">
                  <input
                    type="number"
                    name="budgetHours"
                    min="0"
                    max="1000000"
                    step="0.01"
                    defaultValue={record?.budgetHours ?? ""}
                  />
                </Field>
              ) : (
                <p>Budget: {record?.budgetHours ?? "Not set"}</p>
              )}
              <Field label="Priority">
                <select
                  name="priority"
                  defaultValue={record?.priority ?? "Normal"}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </Field>
            </div>
            <p className="muted small">Actual Hours: Not available yet.</p>
          </section>
          <section className="card client-form-section">
            <h2>Additional Information</h2>
            <Field label="Description">
              <textarea
                name="description"
                defaultValue={record?.description}
                maxLength={8000}
              />
            </Field>
            <Field label="Internal Notes">
              <textarea
                name="internalNotes"
                defaultValue={record?.internalNotes}
                maxLength={8000}
              />
            </Field>
            <h3>Custom Fields</h3>
            <CustomInputs
              definitions={options.definitions}
              values={record?.customValues}
            />
          </section>
        </fieldset>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <div className="form-footer">
          <Link
            className="button secondary"
            href={record ? `/engagements/${record.id}` : "/engagements"}
          >
            Cancel
          </Link>
          {!record && (
            <button disabled={busy} className="button secondary" value="Draft">
              Save as Draft
            </button>
          )}
          <button disabled={busy} className="button primary" value="Planned">
            {busy ? "Saving…" : record ? "Save changes" : "Create Engagement"}
          </button>
        </div>
      </form>
    </>
  );
}
export const personName = (
  person: { firstName: string; lastName: string } | null | undefined,
) => (person ? `${person.firstName} ${person.lastName}` : "Not assigned");
const activeDefault = (
  person: ClientChoice["responsiblePartner"] | undefined,
) => (person?.status === "Active" && person.role.active ? person.id : "");
