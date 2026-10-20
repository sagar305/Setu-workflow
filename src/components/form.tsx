"use client";
import Link from "next/link";
import {
  useState,
  useId,
  Children,
  isValidElement,
  cloneElement,
  type ReactNode,
  type ReactElement,
} from "react";
import { useTrialReadOnly } from "./trial-access";
import { useRouter } from "next/navigation";
export async function post(url: string, data: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Request failed.");
  return result as { message?: string; firmName?: string };
}
export function MutationForm({
  endpoint,
  children,
  label = "Save changes",
  redirectTo,
  transform,
  onSaved,
}: {
  endpoint: string;
  children: ReactNode;
  label?: string;
  redirectTo?: string;
  transform?: (
    data: Record<string, unknown>,
    form: FormData,
  ) => Record<string, unknown>;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const trialReadOnly = useTrialReadOnly();
  const readOnly = trialReadOnly && !endpoint.startsWith("/api/auth/");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        setMessage("");
        const form = new FormData(event.currentTarget);
        const data = Object.fromEntries(form.entries());
        try {
          const result = await post(
            endpoint,
            transform ? transform(data, form) : data,
          );
          setMessage(result.message ?? "Saved.");
          if (redirectTo) router.push(redirectTo);
          else {
            router.refresh();
            onSaved?.();
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : "Please try again.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy || readOnly}>{children}</fieldset>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice success" role="status">
          {message}
        </p>
      )}
      {readOnly && (
        <p className="notice">
          Your trial has ended. This workspace is read-only.{" "}
          <Link href="/trial">View trial details</Link>
        </p>
      )}
      <div className="form-footer">
        <button className="button primary" disabled={busy || readOnly}>
          {busy ? "Please wait…" : label}
        </button>
      </div>
    </form>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {Children.map(children, (child) =>
        isValidElement(child) &&
        typeof child.type === "string" &&
        ["input", "select", "textarea"].includes(child.type)
          ? cloneElement(
              child as ReactElement<{
                id?: string;
                "aria-describedby"?: string;
              }>,
              { id, "aria-describedby": hint ? `${id}-hint` : undefined },
            )
          : child,
      )}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <button
        className="text-button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await post("/api/auth/logout", {});
            router.replace("/login");
            router.refresh();
          } catch {
            setError("Logout failed. Try again.");
            setBusy(false);
          }
        }}
      >
        {busy ? "Logging out…" : "Log out"}
      </button>
      {error && <span role="alert">{error}</span>}
    </>
  );
}
