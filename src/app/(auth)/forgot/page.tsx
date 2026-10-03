import { AuthForm } from '@/components/auth-form';
export default function Forgot() { return <><p className="eyebrow">ACCOUNT ACCESS</p><h1>Reset your password</h1><p className="muted auth-intro">Enter your email and we’ll send you a reset link if your account is eligible.</p><AuthForm mode="forgot"/></>; }
