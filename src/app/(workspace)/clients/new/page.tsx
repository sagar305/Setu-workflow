import { clientPage } from '@/lib/client-page';
import { clientOptions } from '@/lib/clients';
import { ClientForm } from '@/components/clients/client-form';
export default async function NewClient(){const {token,rights}=await clientPage('clients.create');const options=await clientOptions(token);return <><div className="page-heading"><p className="eyebrow">CLIENT MASTER</p><h1>New Client</h1><p className="muted">Create a permanent client record for your firm.</p></div><ClientForm options={options} rights={rights}/></>;}
