import { notFound } from 'next/navigation';
import { clientPage } from '@/lib/client-page';
import { clientOptions } from '@/lib/clients';
import { ClientSettings } from '@/components/clients/client-settings';
export default async function Settings(){const {token,rights}=await clientPage();if(!rights.configure&&!rights.fields)notFound();return <ClientSettings options={await clientOptions(token)} rights={rights}/>;}
