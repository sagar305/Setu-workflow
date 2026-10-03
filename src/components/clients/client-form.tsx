"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Field } from "@/components/form";
import { CLIENT_STATUSES, statusLabel } from "@/lib/client-constants";
import {
  TextField,
  CustomInputs,
  customFormValues,
  ServiceChoices,
} from "./fields";
import type { ClientOptions, ClientRecord, Rights } from "./types";
export function ClientForm({
  options,
  client,
  rights,
}: {
  options: ClientOptions;
  client?: ClientRecord;
  rights: Rights;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [duplicate, setDuplicate] = useState(false);
  const submitting = useRef(false);
  const selected = client?.services.map((s) => s.serviceLineId) ?? [];
  const primary = client?.contacts.find(p => p.isPrimary && p.active);
  return (
    <form
      className="client-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (submitting.current) return;
        submitting.current = true;
        setBusy(true);
        setError("");
        const form = new FormData(e.currentTarget);
        const get = (key: string) => String(form.get(key) ?? "");
        const address = Object.fromEntries(
          [
            "addressLine1",
            "addressLine2",
            "city",
            "stateProvince",
            "postalCode",
            "country",
          ].map((key) => [key, get(`address.${key}`)]),
        );
        const primaryContact = Object.fromEntries(
          ["firstName", "lastName", "jobTitle", "email", "phone", "mobile"].map(
            (key) => [key, get(`contact.${key}`)],
          ),
        );
        const payload = {
          ...Object.fromEntries(form),
          address,
          serviceLineIds: rights.services
            ? form.getAll("serviceLineIds")
            : selected,
          customFields: customFormValues(form, options.definitions),
          acknowledgeDuplicate: form.has("acknowledgeDuplicate"),
          ...(client ? { version: client.version } : {}),
          ...(rights.contacts
            ? { primaryContact: {...primary, ...primaryContact, isPrimary:true, active:true} }
            : {}),
        };
        try {
          const response = await fetch(
            `/api/clients${client ? `/${client.id}` : ""}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            },
          );
          const result = await response.json();
          if (!response.ok) {
            if (result.error.includes("similar name")) setDuplicate(true);
            throw new Error(result.error);
          }
          router.push(`/clients/${result.id}`);
          router.refresh();
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Unable to save client.",
          );
        } finally {
          submitting.current = false;
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy}>
        <section className="card client-form-section">
          <h2>Basic information</h2>
          <div className="form-grid">
            <TextField
              label="Client Code"
              name="clientCode"
              value={client?.clientCode}
              required
              maxLength={40}
            />
            <TextField
              label="Legal Name"
              name="legalName"
              value={client?.legalName}
              required
            />
            <TextField
              label="Display Name"
              name="displayName"
              value={client?.displayName}
            />
            <Field label="Entity Type">
              <select
                name="entityTypeId"
                defaultValue={client?.entityTypeId ?? ""}
                required
              >
                <option value="">Select entity type</option>
                {options.entityTypes
                  .filter((t) => t.active || t.id === client?.entityTypeId)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {!t.active && " (inactive)"}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Status">
              <select name="status" defaultValue={client?.status ?? "Prospect"}>
                {CLIENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </select>
            </Field>
            <TextField
              label="Industry"
              name="industry"
              value={client?.industry}
              maxLength={100}
            />
            <TextField
              label="Website"
              name="website"
              value={client?.website}
              type="url"
              maxLength={500}
            />
          </div>
        </section>
        {rights.contacts ? <section className="card client-form-section client-primary-contact">
          <h2>Primary contact</h2>
          <p className="muted">Email is the main channel for input requests and reminders. Email and phone are required.</p>
          <div className="form-grid">
            <TextField label="Contact Email" name="contact.email" type="email" required value={primary?.email} maxLength={254}/>
            <TextField label="Contact Phone" name="contact.phone" type="tel" required value={primary?.phone} maxLength={50}/>
            <TextField label="Contact First Name" name="contact.firstName" required value={primary?.firstName} maxLength={100}/>
            <TextField label="Contact Last Name" name="contact.lastName" required value={primary?.lastName} maxLength={100}/>
            <TextField label="Contact Job Title" name="contact.jobTitle" value={primary?.jobTitle} maxLength={100}/>
            <TextField label="Contact Mobile" name="contact.mobile" type="tel" value={primary?.mobile} maxLength={50}/>
          </div>
        </section> : !client && <p className="notice">Creating a client requires permission to maintain its primary contact. Ask your Firm Admin to grant contact management access.</p>}
        <section className="card client-form-section">
          <h2>Ownership</h2>
          <div className="form-grid">
            <Field label="Primary Office">
              <select
                name="primaryOfficeId"
                defaultValue={client?.primaryOfficeId ?? ""}
                required
              >
                <option value="">Select office</option>
                {options.offices
                  .filter((o) => o.active || o.id === client?.primaryOfficeId)
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.officeName}
                      {!o.active && " (inactive)"}
                    </option>
                  ))}
              </select>
            </Field>
            {[
              ["responsiblePartnerId", "Responsible Partner"],
              ["responsibleManagerId", "Responsible Manager"],
            ].map(([key, label]) => (
              <Field label={label} key={key}>
                <select
                  name={key}
                  defaultValue={
                    client?.[
                      key as "responsiblePartnerId" | "responsibleManagerId"
                    ] ?? ""
                  }
                >
                  <option value="">Not assigned</option>
                  {options.users
                    .filter(
                      (u) =>
                        u.status === "Active" ||
                        u.id ===
                          client?.[
                            key as
                              "responsiblePartnerId" | "responsibleManagerId"
                          ],
                    )
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.firstName} {u.lastName}
                        {u.status !== "Active" &&
                          " (inactive — choose another)"}
                      </option>
                    ))}
                </select>
              </Field>
            ))}
          </div>
        </section>
        <section className="card client-form-section">
          <h2>Services</h2>
          {rights.services ? (
            <ServiceChoices
              options={options.serviceLines}
              selected={selected}
            />
          ) : (
            <p className="muted">
              Your role cannot change service associations.
            </p>
          )}
        </section>
        <details className="card client-form-section" open>
          <summary>Key dates</summary>
          <div className="form-grid">
            <Field label="Tax year-end month">
              <input
                type="number"
                min={1}
                max={12}
                name="taxYearEndMonth"
                defaultValue={client?.taxYearEndMonth ?? ""}
              />
            </Field>
            <Field label="Tax year-end day">
              <input
                type="number"
                min={1}
                max={31}
                name="taxYearEndDay"
                defaultValue={client?.taxYearEndDay ?? ""}
              />
            </Field>
            <TextField
              label="Onboarding Date"
              name="onboardingDate"
              type="date"
              value={client?.onboardingDate?.slice(0, 10)}
            />
            <TextField
              label="Termination Date"
              name="terminationDate"
              type="date"
              value={client?.terminationDate?.slice(0, 10)}
            />
          </div>
        </details>
        <details className="card client-form-section" open>
          <summary>Primary address</summary>
          <div className="form-grid">
            {[
              ["addressLine1", "Address Line 1"],
              ["addressLine2", "Address Line 2"],
              ["city", "City"],
              ["stateProvince", "State / Province"],
              ["postalCode", "Postal Code"],
              ["country", "Country"],
            ].map(([key, label]) => (
              <TextField
                key={key}
                label={label}
                name={`address.${key}`}
                value={client?.address?.[key as "city"]}
              />
            ))}
          </div>
        </details>
        <section className="card client-form-section">
          <h2>Additional information</h2>
          <Field label="Description / Internal Notes">
            <textarea
              name="internalNotes"
              rows={4}
              maxLength={10000}
              defaultValue={client?.internalNotes ?? ""}
            />
          </Field>
          <CustomInputs
            definitions={options.definitions}
            values={client?.customValues}
          />
        </section>
        {duplicate && (
          <label className="checkbox notice">
            <input name="acknowledgeDuplicate" type="checkbox" required />I have
            reviewed the similar-name warning and want to continue.
          </label>
        )}
      </fieldset>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <div className="client-form-actions">
        <Link
          href={client ? `/clients/${client.id}` : "/clients"}
          className="button secondary"
        >
          Cancel
        </Link>
        <button className="button primary" disabled={busy}>
          {busy ? "Saving…" : client ? "Save changes" : "Save Client"}
        </button>
      </div>
    </form>
  );
}
