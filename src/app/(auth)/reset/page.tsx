import { AuthForm } from '@/components/auth-form';
export default function Reset() { return <><p className="eyebrow">ACCOUNT ACCESS</p><h1>Choose a new password</h1><p className="muted auth-intro">You’ll use this password the next time you log in.</p><AuthForm mode="reset"/></>; }
