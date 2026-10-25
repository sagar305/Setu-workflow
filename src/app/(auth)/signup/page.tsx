import Link from "next/link";
import { SignupForm } from "@/components/signup-form";
export default function Signup() {
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
