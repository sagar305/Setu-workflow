import {engagementPage} from '@/lib/engagement-page';
import {ENGAGEMENT_COLUMNS} from '@/lib/engagement-csv';
import {ClientImport} from '@/components/clients/client-import';
export default async function Page(){const {rights}=await engagementPage('engagements.import');return <ClientImport resource="engagements" columns={ENGAGEMENT_COLUMNS} allowServiceAssociation={rights.associate}/>;}
