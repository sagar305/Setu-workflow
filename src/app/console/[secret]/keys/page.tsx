import Link from "next/link";
import { consolePage } from "@/lib/platform-page";
import { listKeys, listRedemptions } from "@/lib/platform";
import { ConsoleShell, Section } from "@/components/platform/shell";
import { shortDate } from "@/components/platform/badges";
import { QuickAction, RevealKey } from "@/components/platform/forms";

const what = (days: number, seats: number) => (days === 0 ? `+${seats} users` : `${days} days · ${seats} users`);

export default async function Keys({ params }: { params: Promise<{ secret: string }> }) {
  const { admin, base } = await consolePage(params);
  const [issued, redeemed] = await Promise.all([listKeys(), listRedemptions()]);
  return (
    <ConsoleShell
      base={base}
      admin={admin}
      current="keys"
      title="Keys"
      description="Contact-sales keys are issued from an account's page. Website keys appear here once redeemed."
    >
      <Section title="Contact-sales keys issued" empty={!issued.length}>
        <ul className="console-rows">
          {issued.map((k) => (
            <li key={k.id}>
              <span>
                <strong>{what(k.days, k.seats)}</strong>
                <small>
                  {k.orderRef}
                  {k.amount ? ` · ${k.currency} ${k.amount}` : ""}
                  {k.note ? ` · ${k.note}` : ""} · {k.issuedBy} · {shortDate(k.createdAt)}
                </small>
              </span>
              <span>
                {(k.redeemedBy ?? k.intendedFirm) && (
                  <Link className="firm-link" href={`${base}/accounts/${(k.redeemedBy ?? k.intendedFirm)!.id}`}>
                    {(k.redeemedBy ?? k.intendedFirm)!.displayName}
                  </Link>
                )}
              </span>
              <span className="row-end">
                <span className={`status ${k.status === "redeemed" ? "active" : k.status === "cancelled" ? "ended" : "trial"}`}>
                  {k.status === "redeemed" ? "Used" : k.status === "cancelled" ? "Cancelled" : "Not used"}
                </span>
                {k.status === "unused" && (
                  <>
                    <RevealKey issueId={k.id} />
                    <QuickAction url={`/api/platform/keys/${k.id}/cancel`} label="Cancel" danger confirm="Cancel this key? It will no longer redeem." />
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="All redeemed keys" empty={!redeemed.length}>
        <ul className="console-rows">
          {redeemed.map((r) => (
            <li key={r.id}>
              <span>
                <strong>{what(r.days, r.seats)}</strong>
                <small>
                  {r.source} · {shortDate(r.createdAt)}
                  {r.newExpiresAt ? ` · paid through ${shortDate(r.newExpiresAt)}` : ""}
                </small>
              </span>
              <span className="row-end">
                {r.firm && (
                  <Link className="firm-link" href={`${base}/accounts/${r.firm.id}`}>
                    {r.firm.displayName}
                  </Link>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </ConsoleShell>
  );
}
