import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentUser, sessionToken } from '@/lib/session';
import { hasPermission } from '@/lib/auth';
import { readAdmin, userOptions, sectionPermission, type Section } from '@/lib/admin';
import { AdminPanel } from '@/components/admin-panel';
const titles = { users: 'Users', offices: 'Offices', roles: 'Roles', firm: 'Firm Settings' };
const descriptions = { users: 'Manage the people who make your firm work.', offices: 'A shared workspace, across every location.', roles: 'Give each person the access they need.', firm: 'Set the defaults for your firm’s workspace.' };
export default async function AdminSection({ params }: { params: Promise<{ section: string }> }) {
  const user = await currentUser();
  const { section: raw } = await params;
  if (!Object.hasOwn(titles, raw)) notFound();
  const section = raw as Section;
  if (!hasPermission(user, sectionPermission[section])) return <section className="card placeholder"><h1>Access restricted</h1><p>Your role does not allow access to this administration area.</p><Link href="/dashboard">Return to dashboard</Link></section>;
  const token = await sessionToken();
  const result = await readAdmin(token, section);
  const options = section === 'users' ? await userOptions(token) : undefined;
  // Only the selected administration DTO is serialized, never a User/password/session model.
  const serialized = JSON.parse(JSON.stringify(result));
  return <><div className="page-heading"><p className="eyebrow">FIRM ADMINISTRATION</p><h1>{titles[section]}</h1><p className="muted">{descriptions[section]}</p></div><nav className="tabs" aria-label="Administration">{(Object.keys(titles) as Section[]).filter(s => hasPermission(user, sectionPermission[s])).map(s => <Link key={s} href={`/admin/${s}`} className={s === section ? 'active' : ''} aria-current={s === section ? 'page' : undefined}>{titles[s]}</Link>)}</nav><AdminPanel section={section} ownId={user.id} options={options} {...{ [section]: serialized }}/></>;
}
