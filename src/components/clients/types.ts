import type {
  clientOptions,
  getClient,
  listClients,
  clientActivity,
} from "@/lib/clients";
export type Serialized<T> = T extends Date
  ? string
  : T extends Array<infer U>
    ? Serialized<U>[]
    : T extends object
      ? { [K in keyof T]: Serialized<T[K]> }
      : T;
export type ClientOptions = Awaited<ReturnType<typeof clientOptions>>;
export type ClientRecord = Serialized<Awaited<ReturnType<typeof getClient>>>;
export type ClientList = Serialized<Awaited<ReturnType<typeof listClients>>>;
export type Activity = Serialized<Awaited<ReturnType<typeof clientActivity>>>;
export type Rights = {
  create: boolean;
  edit: boolean;
  contacts: boolean;
  services: boolean;
  import: boolean;
  export: boolean;
  configure: boolean;
  fields: boolean;
};
