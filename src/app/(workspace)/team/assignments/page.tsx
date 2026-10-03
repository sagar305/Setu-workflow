import { AllocationWorkspace } from "@/components/allocations/workspace";
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string>>}) {
  return <AllocationWorkspace team query={await searchParams}/>;
}
