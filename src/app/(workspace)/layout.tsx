import Link from 'next/link';
import { currentUser } from '@/lib/session';
import { hasPermission } from '@/lib/auth';
import { Navigation } from '@/components/navigation';
import { LogoutButton } from '@/components/form';
import { sectionPermission, type Section } from '@/lib/admin';
export const dynamic = 'force-dynamic';
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const firstAdmin = (Object.keys(sectionPermission) as Section[]).find(s => hasPermission(user, sectionPermission[s]));
  return <div className="app-shell"><a href="#main" className="skip-link">Skip to content</a><Navigation reports={hasPermission(user, "reports.view") && hasPermission(user, "engagements.view")} capacity={hasPermission(user, "capacity.view_team") && hasPermission(user, "engagements.view")} time={hasPermission(user, "time.view_own") && hasPermission(user, "engagements.view")} assignments={hasPermission(user, "allocations.manage_team")} adminHref={firstAdmin ? `/admin/${firstAdmin}` : undefined}/><div className="workspace"><header className="topbar"><div className="firm-identity"><strong>{user.firm.displayName}</strong><span>{user.primaryOffice?.officeName ?? 'Firm workspace'}</span></div><div className="account"><span className="avatar">{user.firstName[0]}{user.lastName[0]}</span><Link className="account-name" href="/profile"><strong>{user.firstName} {user.lastName}</strong><small>{user.role.roleName}</small></Link><Link href="/profile" className="profile-link">Profile</Link><LogoutButton/></div></header><main id="main" className="main-content">{children}</main><footer className="workspace-footer">Setu Workflow <span>One firm. One connected workspace.</span></footer></div></div>;
}
