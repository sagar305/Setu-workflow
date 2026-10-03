import type { Serialized } from "../clients/types";
import type {
  engagementOptions,
  engagementClients,
  getEngagement,
  listEngagements,
  engagementActivity,
} from "@/lib/engagements";
import type { engagementPage } from "@/lib/engagement-page";
export type EngagementOptions = Awaited<ReturnType<typeof engagementOptions>>;
export type ClientChoice = Awaited<
  ReturnType<typeof engagementClients>
>[number];
export type EngagementRecord = Serialized<
  Awaited<ReturnType<typeof getEngagement>>
>;
export type EngagementList = Serialized<
  Awaited<ReturnType<typeof listEngagements>>
>;
export type EngagementActivity = Serialized<
  Awaited<ReturnType<typeof engagementActivity>>
>;
export type EngagementRights = Awaited<
  ReturnType<typeof engagementPage>
>["rights"];
