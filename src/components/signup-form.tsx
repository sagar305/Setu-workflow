"use client";
import { Field, MutationForm } from "./form";
export function SignupForm() {
  return (
    <MutationForm endpoint="/api/auth/signup" label="Email my activation link">
      <Field label="Firm name">
        <input
          name="firmName"
          required
          maxLength={100}
          autoComplete="organization"
        />
      </Field>
      <div className="form-grid">
        <Field label="Your first name">
          <input
            name="firstName"
            required
            maxLength={100}
            autoComplete="given-name"
          />
        </Field>
        <Field label="Your last name">
          <input
            name="lastName"
            required
            maxLength={100}
            autoComplete="family-name"
          />
        </Field>
      </div>
      <Field label="Administrator email">
        <input
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="email"
        />
      </Field>
      <Field
        label="Firm timezone"
        hint="Used for deadlines and work dates. You can change this in firm settings."
      >
        <select name="timezone" defaultValue="America/New_York">
          {[
            "America/New_York",
            "America/Chicago",
            "America/Denver",
            "America/Los_Angeles",
            "America/Phoenix",
            "America/Anchorage",
            "Pacific/Honolulu",
            "Europe/London",
            "Asia/Kolkata",
            "Australia/Sydney",
            "UTC",
          ].map((zone) => (
            <option key={zone} value={zone}>
              {zone.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </Field>
      <p className="muted small">
        We’ll email you a secure link to set your password. Your trial begins
        after activation, lasts 15 days, and requires no payment details.
        Afterwards, your workspace becomes read-only and your data is preserved.
      </p>
    </MutationForm>
  );
}
