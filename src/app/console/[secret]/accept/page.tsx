import { notFound } from "next/navigation";
import { LogoMark } from "@/components/logo";
import { AcceptInvite } from "@/components/platform/forms";
import { isPlatformRoute } from "@/lib/platform";

export default async function AcceptPage({ params }: { params: Promise<{ secret: string }> }) {
  const { secret } = await params;
  if (!isPlatformRoute(secret)) notFound();
  return (
    <div className="console-login">
      <div className="card console-login-card">
        <span className="console-mark big">
          <LogoMark size={26} />
        </span>
        <h1>Set your password</h1>
        <p className="muted small">Setu Workflow Admin. You&rsquo;ll link an authenticator app at your first sign-in.</p>
        <AcceptInvite secret={secret} />
      </div>
    </div>
  );
}
