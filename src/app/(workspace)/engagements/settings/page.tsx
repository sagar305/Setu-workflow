import {engagementPage} from '@/lib/engagement-page';
import {engagementOptions} from '@/lib/engagements';
import {EngagementSettings} from '@/components/engagements/settings';
import {notFound} from 'next/navigation';
export default async function Page(){const {token,rights}=await engagementPage();if(!rights.configure&&!rights.fields)notFound();return <EngagementSettings options={await engagementOptions(token)} rights={rights}/>;}
