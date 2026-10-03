import {clientPage,clientPageRecord,serialize} from '@/lib/client-page';
import {clientOptions,clientActivity} from '@/lib/clients';
import {ClientDetail} from '@/components/clients/client-detail';
import {EngagementListPanel} from '@/components/engagements/list';
import {listEngagements,engagementOptions} from '@/lib/engagements';
import {engagementPage} from '@/lib/engagement-page';
import {currentUser} from '@/lib/session';
import {hasPermission} from '@/lib/auth';
export default async function Page({params,searchParams}:{params:Promise<{clientId:string}>;searchParams:Promise<Record<string,string|undefined>>}){const {token,rights}=await clientPage();const {clientId}=await params;const search=await searchParams;const user=await currentUser();const canView=hasPermission(user,'engagements.view');const tab=['overview','contacts','services','custom-fields','activity',...(canView?['engagements']:[])].includes(search.tab??'')?search.tab!:'overview';const [client,options]=await Promise.all([clientPageRecord(token,clientId),clientOptions(token)]);const activity=tab==='activity'?await clientActivity(token,clientId,Number(search.page??1)):undefined;let panel;
if(tab==='engagements'){const er=await engagementPage();const [list,eo]=await Promise.all([listEngagements(token,{...search,clientId,scope:search.scope??'active'}),engagementOptions(token)]);panel=<EngagementListPanel key={JSON.stringify(search)} data={serialize(list)} options={eo} rights={er.rights} clientContext={clientId}/>;}
return <ClientDetail key={`${clientId}-${tab}`} client={serialize(client)} options={options} rights={rights} tab={tab} activity={activity?serialize(activity):undefined} canViewEngagements={canView} engagementPanel={panel}/>;}
