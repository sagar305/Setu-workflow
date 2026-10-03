import {engagementPage,engagementPageRecord} from '@/lib/engagement-page';
import {serialize} from '@/lib/client-page';
import {engagementOptions,engagementClients} from '@/lib/engagements';
import {EngagementForm} from '@/components/engagements/form';
export default async function Page({params}:{params:Promise<{engagementId:string}>}){const {token,rights}=await engagementPage('engagements.edit');const {engagementId}=await params;const record=await engagementPageRecord(token,engagementId);const [options,clients]=await Promise.all([engagementOptions(token),engagementClients(token,{id:record.clientId})]);return <EngagementForm options={options} rights={rights} record={serialize(record)} initialClient={clients[0]}/>;}
