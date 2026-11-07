import { notFound } from "next/navigation";
import { LogoMark } from "@/components/logo";
import { ConsoleLogin } from "@/components/platform/forms";
import { isPlatformRoute } from "@/lib/platform";

export default async function ConsoleLoginPage({ params }: { params: Promise<{ secret: string }> }) {
  const { secret } = await params;
  if (!isPlatformRoute(secret)) notFound();
  return (
    <div className="console-login">
      <div className="card console-login-card">
        <span className="console-mark big">
          <LogoMark size={26} />
        </span>
        <h1>
          Setu Workflow <span className="saffron">Admin</span>
        </h1>
        <p className="muted small">For the Setu team. Every action here is logged.</p>
        <ConsoleLogin secret={secret} />
      </div>
    </div>
  );
}
