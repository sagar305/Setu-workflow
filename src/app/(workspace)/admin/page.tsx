import { currentUser } from '@/lib/session';
import { hasPermission } from '@/lib/auth';
import { sectionPermission, type Section } from '@/lib/admin';
import { redirect } from 'next/navigation';
export default async function Admin() { const user = await currentUser(); const section = (Object.keys(sectionPermission) as Section[]).find(s => hasPermission(user, sectionPermission[s])); redirect(section ? `/admin/${section}` : '/dashboard'); }
