import Link from "next/link";
import { Logo } from "@/components/logo";
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <Link className="brand" href="/login">
          <Logo />
        </Link>
        <div>
          <p className="eyebrow">YOUR FIRM. CONNECTED.</p>
          <h1>
            A shared place.
            <br />A clearer picture.
          </h1>
          <p>
            A secure workspace for the people
            <br />
            behind your accounting practice.
          </p>
        </div>
        <span className="auth-caption">Setu Workflow · Firm workspace</span>
      </section>
      <section className="auth-panel">
        <div className="auth-card">{children}</div>
        <footer>15-day firm trials · Secure firm workspaces</footer>
      </section>
    </main>
  );
}
