import { clientPage, serialize } from '@/lib/client-page';
import { listClients, clientOptions } from '@/lib/clients';
import { ClientListPanel } from '@/components/clients/client-list';
export default async function ClientsPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){const {token,rights,userId}=await clientPage();const params=await searchParams;const query=Object.fromEntries(Object.entries(params).filter(([,v])=>typeof v==='string'));const [data,options]=await Promise.all([listClients(token,query),clientOptions(token)]);return <ClientListPanel key={JSON.stringify(query)} data={serialize(data)} options={options} rights={rights} userId={userId}/>;}
