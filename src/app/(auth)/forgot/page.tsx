import Link from 'next/link';
import { AuthForm } from '@/components/auth-form';
import { isDemo } from '@/lib/demo';
export const dynamic = 'force-dynamic';
export default function Forgot() {
  if (isDemo()) return <><p className="eyebrow">ACCOUNT ACCESS</p><h1>No password resets in the demo</h1><p className="muted auth-intro">Every demo account shares the password shown on the login page.</p><div className="auth-links"><Link href="/login">Back to login</Link></div></>;
  return <><p className="eyebrow">ACCOUNT ACCESS</p><h1>Reset your password</h1><p className="muted auth-intro">Enter your email and we’ll send you a reset link if your account is eligible.</p><AuthForm mode="forgot"/></>;
}
