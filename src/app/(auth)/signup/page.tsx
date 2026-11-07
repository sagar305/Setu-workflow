import Link from "next/link";
import { SignupForm } from "@/components/signup-form";
import { DEMO_RESET_HOURS, isDemo } from "@/lib/demo";
export const dynamic = "force-dynamic";
export default function Signup() {
  if (isDemo()) {
    // The demo is shared and wiped every 12 hours; real trials live on the main app.
    const real = process.env.DEMO_SIGNUP_URL;
    return (
      <>
        <p className="eyebrow">SETU FOR CPA FIRMS</p>
        <h1>This is the demo</h1>
        <p className="muted auth-intro">
          Sign-up is off here because the demo resets every {DEMO_RESET_HOURS} hours.{" "}
          {real ? "Start a free 15-day trial in your own private workspace instead." : "Use one of the demo accounts on the login page."}
        </p>
        {real && <a className="button primary" href={real}>Start a free trial</a>}
        <div className="auth-links">
          <Link href="/login">Back to the demo login</Link>
        </div>
      </>
    );
  }
  return (
    <>
      <p className="eyebrow">SETU FOR CPA FIRMS</p>
      <h1>Explore at your own pace</h1>
      <p className="muted auth-intro">
        Start a 15-day trial in your firm’s own workspace. You’ll be the firm
        administrator and can invite your team.
      </p>
      <SignupForm />
      <div className="auth-links">
        <Link href="/login">Already have an account? Log in</Link>
      </div>
    </>
  );
}
