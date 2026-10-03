"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MutationForm, Field, post } from "@/components/form";
import {
  TextField,
  CustomInputs,
  customFormValues,
  ServiceChoices,
} from "./fields";
import { CONTACT_TYPES, statusLabel } from "@/lib/client-constants";
import { clientReminderLink } from '@/lib/client-reminder';
import type { ClientRecord, ClientOptions, Rights, Activity } from "./types";
const tabs = ["Overview", "Contacts", "Services", "Custom Fields", "Activity"];
const slug = (s: string) => s.toLowerCase().replaceAll(" ", "-");
function DefinitionList({
  values,
}: {
  values: Record<string, React.ReactNode>;
}) {
  return (
    <dl className="client-details">
      {Object.entries(values).map(([key, value]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>{value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
export function ClientDetail({
  client: c,
  options,
  rights,
  tab,
  activity,
  engagementPanel,
  canViewEngagements = false,
}: {
  client: ClientRecord;
  options: ClientOptions;
  rights: Rights;
  tab: string;
  activity?: Activity;
  engagementPanel?: React.ReactNode;
  canViewEngagements?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const contact = c.contacts.find((p) => p.id === editing);
  const primary = c.contacts.find((p) => p.isPrimary && p.active);
  const reminder = clientReminderLink(primary?.email, c.displayName, primary?.firstName);
  const person = (p: ClientRecord["responsiblePartner"]) =>
    p
      ? `${p.firstName} ${p.lastName}${p.status !== "Active" ? " (inactive)" : ""}`
      : "Not assigned";
  const changeContact = async (
    record: ClientRecord["contacts"][number],
    changes: Record<string, boolean>,
  ) => {
    setBusy(true);
    try {
      await post(`/api/clients/${c.id}/contacts/${record.id}`, {
        ...record,
        ...changes,
      });
      setMessage("Contact updated.");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to update contact.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Link className="back-link" href="/clients">
        ← All clients
      </Link>
      <div className="page-heading client-heading">
        <div>
          <p className="eyebrow">
            {c.clientCode} · {c.entityType.name}
          </p>
          <h1>{c.displayName}</h1>
          <p className="muted">{c.legalName}</p>
        </div>
        <div className="actions">
          {rights.contacts && (reminder ? <a className="button primary" href={reminder} title="Opens an editable draft in your email app">Email Reminder</a> : <button className="button primary" disabled title="Add a valid primary email in Contacts first">Email Reminder</button>)}
          <span className={`status ${c.status.toLowerCase()}`}>
            {statusLabel(c.status)}
          </span>
          {rights.edit && (
            <Link href={`/clients/${c.id}/edit`} className="button secondary">
              Edit Client
            </Link>
          )}
        </div>
      </div>
      <section className="client-contact-banner" aria-label="Primary contact details">
        <div><span className="eyebrow">PRIMARY EMAIL</span><strong>{reminder ? <a href={`mailto:${encodeURIComponent(primary!.email)}`}>{primary!.email}</a> : 'Email required'}</strong><small>{primary ? `${primary.firstName} ${primary.lastName}` : 'Primary contact required'}</small></div>
        <div><span className="muted small">Phone</span><strong>{primary?.phone || 'Phone required'}</strong></div>
        {rights.contacts && <p className="muted small">Email Reminder opens an editable draft in your email app. Add the required inputs and due date before sending.</p>}
      </section>
      {(!reminder || !primary?.phone.trim()) && <p className="notice">Complete the primary contact&apos;s email and phone. {rights.contacts && <Link href={`/clients/${c.id}?tab=contacts`}>Update Contacts →</Link>}</p>}
      <div className="client-owner-strip">
        <span>
          <small>Partner</small>
          {person(c.responsiblePartner)}
        </span>
        <span>
          <small>Manager</small>
          {person(c.responsibleManager)}
        </span>
        <span>
          <small>Office</small>
          {c.primaryOffice.officeName}
        </span>
      </div>
      <nav className="tabs client-tabs" aria-label="Client details">
        {tabs.map((label) => (
          <Link
            key={label}
            href={`/clients/${c.id}?tab=${slug(label)}`}
            className={tab === slug(label) ? "active" : ""}
          >
            {label}
          </Link>
        ))}
        {canViewEngagements && <Link href={`/clients/${c.id}?tab=engagements`} className={tab === 'engagements' ? 'active' : ''}>Engagements</Link>}
      </nav>
      {tab === 'engagements' && engagementPanel}
      {tab === "overview" && (
        <div className="client-overview-grid">
          <section className="card detail-card">
            <h2>Basic information</h2>
            <DefinitionList
              values={{
                "Client Code": c.clientCode,
                "Legal Name": c.legalName,
                "Display Name": c.displayName,
                "Entity Type": c.entityType.name,
                Status: statusLabel(c.status),
                Industry: c.industry,
                Website: c.website ? (
                  <a href={c.website} target="_blank" rel="noopener noreferrer">
                    {c.website}
                  </a>
                ) : (
                  "—"
                ),
              }}
            />
          </section>
          <section className="card detail-card">
            <h2>Ownership & key dates</h2>
            <DefinitionList
              values={{
                Partner: person(c.responsiblePartner),
                Manager: person(c.responsibleManager),
                Office: c.primaryOffice.officeName,
                "Tax year end": c.taxYearEndMonth
                  ? `${c.taxYearEndMonth}/${c.taxYearEndDay}`
                  : "—",
                Onboarding: c.onboardingDate?.slice(0, 10),
                Termination: c.terminationDate?.slice(0, 10),
              }}
            />
          </section>
          <section className="card detail-card">
            <h2>Primary address</h2>
            {c.address &&
            [c.address.addressLine1, c.address.city, c.address.country].some(
              Boolean,
            ) ? (
              <p className="address-block">
                {[
                  c.address.addressLine1,
                  c.address.addressLine2,
                  [
                    c.address.city,
                    c.address.stateProvince,
                    c.address.postalCode,
                  ]
                    .filter(Boolean)
                    .join(", "),
                  c.address.country,
                ]
                  .filter(Boolean)
                  .join("\n")}
              </p>
            ) : (
              <p className="muted">No address recorded.</p>
            )}
          </section>
          <section className="card detail-card">
            <h2>Primary contact</h2>
            {primary ? (
              <DefinitionList
                values={{
                  Name: `${primary.firstName} ${primary.lastName}`,
                  Title: primary.jobTitle,
                  Email: primary.email,
                  Phone: primary.phone || primary.mobile,
                }}
              />
            ) : (
              <p className="muted">
                No active primary contact. Choose one in Contacts.
              </p>
            )}
          </section>
          <section className="card detail-card full-width">
            <h2>Internal notes</h2>
            <p className="preserve-lines">
              {c.internalNotes || "No internal notes."}
            </p>
          </section>
        </div>
      )}
      {tab === "contacts" && (
        <>
          <section className="card table-card">
            <div className="table-toolbar">
              <h2>Contacts</h2>
              {rights.contacts && (
                <button
                  className="button primary"
                  onClick={() => setEditing("new")}
                >
                  Add Contact
                </button>
              )}
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {[
                      "Name",
                      "Title / Type",
                      "Email",
                      "Phone",
                      "Primary",
                      "Status",
                      "Actions",
                    ].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {c.contacts.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <strong>
                          {p.firstName} {p.lastName}
                        </strong>
                      </td>
                      <td>
                        {p.jobTitle}
                        <small>{p.contactType}</small>
                      </td>
                      <td>{p.email || "—"}</td>
                      <td>{p.phone || p.mobile || "—"}</td>
                      <td>{p.isPrimary ? "Primary" : "—"}</td>
                      <td>
                        <span
                          className={`status ${p.active ? "active" : "inactive"}`}
                        >
                          {p.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td>
                        {rights.contacts && (
                          <div className="contact-actions">
                            <button
                              disabled={busy}
                              className="text-button"
                              onClick={() => setEditing(p.id)}
                            >
                              Edit
                            </button>
                            {p.active && !p.isPrimary && (
                              <button
                                disabled={busy}
                                className="text-button"
                                onClick={() =>
                                  changeContact(p, { isPrimary: true })
                                }
                              >
                                Set as Primary
                              </button>
                            )}
                            <button
                              disabled={busy}
                              className="text-button"
                              onClick={() =>
                                changeContact(p, {
                                  active: !p.active,
                                  isPrimary: p.active ? false : p.isPrimary,
                                })
                              }
                            >
                              {p.active ? "Deactivate" : "Reactivate"}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!c.contacts.length && (
                <p className="client-empty muted">No contacts yet.</p>
              )}
            </div>
          </section>
          {editing && rights.contacts && (
            <section className="card client-form-section">
              <div className="editor-heading">
                <h2>{contact ? "Edit Contact" : "Add Contact"}</h2>
                <button
                  className="button secondary"
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </button>
              </div>
              <MutationForm
                key={editing}
                endpoint={`/api/clients/${c.id}/contacts${contact ? `/${contact.id}` : ""}`}
                label="Save Contact"
                onSaved={() => setEditing(null)}
                transform={(data, form) => ({
                  ...data,
                  isPrimary: form.has("isPrimary"),
                  active: form.has("active"),
                })}
              >
                <div className="form-grid">
                  <TextField
                    label="First Name"
                    name="firstName"
                    value={contact?.firstName}
                    required
                  />
                  <TextField
                    label="Last Name"
                    name="lastName"
                    value={contact?.lastName}
                    required
                  />
                  <TextField
                    label="Job Title"
                    name="jobTitle"
                    value={contact?.jobTitle}
                  />
                  <TextField
                    label="Contact Email"
                    name="email"
                    type="email"
                    value={contact?.email}
                    required={contact?.isPrimary}
                  />
                  <TextField
                    label="Phone"
                    name="phone"
                    value={contact?.phone}
                    type="tel"
                    required={contact?.isPrimary}
                  />
                  <TextField
                    label="Mobile"
                    name="mobile"
                    value={contact?.mobile}
                  />
                  <Field label="Contact Type">
                    <select
                      name="contactType"
                      defaultValue={contact?.contactType ?? "Other"}
                    >
                      {CONTACT_TYPES.map((type) => (
                        <option key={type}>{type}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Notes">
                    <textarea
                      name="notes"
                      defaultValue={contact?.notes}
                      maxLength={2000}
                    />
                  </Field>
                </div>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    name="isPrimary"
                    defaultChecked={contact?.isPrimary}
                  />
                  Primary contact (replaces the current primary)
                </label>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    name="active"
                    defaultChecked={contact?.active ?? true}
                  />
                  Active contact
                </label>
              </MutationForm>
            </section>
          )}
        </>
      )}
      {tab === "services" && (
        <section className="card client-form-section">
          <h2>Service lines</h2>
          {rights.services ? (
            <MutationForm
              endpoint={`/api/clients/${c.id}/services`}
              label="Save Services"
              transform={(_data, form) => ({
                ids: form.getAll("serviceLineIds"),
              })}
            >
              <ServiceChoices
                options={options.serviceLines}
                selected={c.services.map((s) => s.serviceLineId)}
              />
            </MutationForm>
          ) : (
            <div className="client-tags">
              {c.services.map((s) => (
                <span key={s.serviceLineId} className="pill">
                  {s.serviceLine.name}
                </span>
              ))}
              {!c.services.length && (
                <p className="muted">No services assigned.</p>
              )}
            </div>
          )}
          <p className="muted small">
            Removing a service preserves the firm’s service-line master and the
            client’s history.
          </p>
        </section>
      )}
      {tab === "custom-fields" && (
        <section className="card client-form-section">
          <h2>Custom fields</h2>
          {rights.edit ? (
            <MutationForm
              endpoint={`/api/clients/${c.id}/fields`}
              label="Save Custom Fields"
              transform={(_data, form) => ({
                values: customFormValues(form, options.definitions),
              })}
            >
              <CustomInputs
                definitions={options.definitions}
                values={c.customValues}
              />
            </MutationForm>
          ) : (
            <DefinitionList
              values={Object.fromEntries(
                options.definitions
                  .filter((d) => d.active)
                  .map((d) => {
                    const v = c.customValues.find(
                      (v) => v.definitionId === d.id,
                    );
                    return [
                      d.name,
                      v
                        ? (v.textValue ??
                          v.numberValue ??
                          v.dateValue?.slice(0, 10) ??
                          (v.booleanValue === null
                            ? "—"
                            : v.booleanValue
                              ? "Yes"
                              : "No"))
                        : "—",
                    ];
                  }),
              )}
            />
          )}
          <h3 className="spaced">Retained inactive fields</h3>
          <DefinitionList
            values={Object.fromEntries(
              c.customValues
                .filter((v) => !v.definition.active)
                .map((v) => [
                  v.definition.name,
                  v.textValue ??
                    v.numberValue ??
                    v.dateValue?.slice(0, 10) ??
                    String(v.booleanValue),
                ]),
            )}
          />
        </section>
      )}
      {tab === "activity" && activity && (
        <section className="card table-card">
          <div className="table-toolbar">
            <h2>Activity</h2>
            <span className="muted small">{activity.total} events</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Timestamp (UTC)</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {activity.items.map((a) => (
                  <tr key={a.id}>
                    <td>{a.timestamp.replace("T", " ").slice(0, 19)}</td>
                    <td>{a.user}</td>
                    <td>
                      {a.action.replace("client.", "").replaceAll("_", " ")}
                    </td>
                    <td>{a.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-footer pagination">
            <span>Page {activity.page}</span>
            <div className="actions">
              {activity.page > 1 && (
                <Link
                  href={`/clients/${c.id}?tab=activity&page=${activity.page - 1}`}
                >
                  Previous
                </Link>
              )}
              {activity.page * 25 < activity.total && (
                <Link
                  href={`/clients/${c.id}?tab=activity&page=${activity.page + 1}`}
                >
                  Next
                </Link>
              )}
            </div>
          </div>
        </section>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
    </>
  );
}
