import { AuthForm } from '@/components/auth-form';
import { DemoLogin } from '@/components/demo';
import { DEMO_RESET_HOURS, demoAccounts, demoPassword, isDemo } from '@/lib/demo';
export const dynamic = 'force-dynamic';
export default function Login() {
  return <>
    <p className="eyebrow">SETU WORKFLOW</p><h1>Welcome back</h1><p className="muted auth-intro">Log in to your firm’s workspace.</p>
    {isDemo() && <DemoLogin firms={demoAccounts()} password={demoPassword()} hours={DEMO_RESET_HOURS} signupUrl={process.env.DEMO_SIGNUP_URL || undefined}/>}
    <AuthForm mode="login" demo={isDemo()}/>
  </>;
}
