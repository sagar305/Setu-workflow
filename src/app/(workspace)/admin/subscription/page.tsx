import Link from "next/link";
import { currentUser, sessionToken } from "@/lib/session";
import { canViewSubscription, readSubscription } from "@/lib/subscription";
import { AdminTabs } from "@/components/admin-tabs";
import { SubscriptionPanel } from "@/components/subscription-panel";

export const metadata = { title: "Subscription" };

export default async function SubscriptionPage() {
  const user = await currentUser();
  if (!canViewSubscription(user))
    return (
      <section className="card placeholder">
        <h1>Access restricted</h1>
        <p>Only your firm&rsquo;s super admin and administrators can view the subscription.</p>
        <Link href="/dashboard">Return to dashboard</Link>
      </section>
    );
  const data = JSON.parse(JSON.stringify(await readSubscription(await sessionToken())));
  const support = process.env.TRIAL_CONTACT_EMAIL ?? "hello@setutechnology.com";
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">FIRM ADMINISTRATION</p>
        <h1>Subscription</h1>
        <p className="muted">Your Setu Workflow plan, license keys and who has access.</p>
      </div>
      <AdminTabs user={user} current="subscription" />
      <SubscriptionPanel
        {...data}
        timezone={user.firm.timezone}
        salesEmail={support}
        firmName={user.firm.displayName}
        ownId={user.id}
      />
    </>
  );
}
