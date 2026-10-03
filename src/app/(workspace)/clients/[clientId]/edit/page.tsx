import { clientPage,clientPageRecord,serialize } from '@/lib/client-page';
import { clientOptions } from '@/lib/clients';
import { ClientForm } from '@/components/clients/client-form';
export default async function EditClient({params}:{params:Promise<{clientId:string}>}){const {token,rights}=await clientPage('clients.edit');const {clientId}=await params;const [client,options]=await Promise.all([clientPageRecord(token,clientId),clientOptions(token)]);return <><div className="page-heading"><p className="eyebrow">{client.clientCode}</p><h1>Edit Client</h1></div><ClientForm client={serialize(client)} options={options} rights={rights}/></>;}
