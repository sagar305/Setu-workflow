import { clientPage } from '@/lib/client-page';
import { ClientImport } from '@/components/clients/client-import';
export default async function ImportPage(){await clientPage('clients.import');return <ClientImport/>;}
