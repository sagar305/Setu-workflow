import {engagementPage} from '@/lib/engagement-page';
import {engagementOptions,engagementClients} from '@/lib/engagements';
import {EngagementForm} from '@/components/engagements/form';
export default async function Page({searchParams}:{searchParams:Promise<{clientId?:string}>}){const {token,rights}=await engagementPage('engagements.create');const {clientId}=await searchParams;const options=await engagementOptions(token);const clients=clientId?await engagementClients(token,{id:clientId}):[];return <EngagementForm options={options} rights={rights} initialClient={clients[0]}/>;}
