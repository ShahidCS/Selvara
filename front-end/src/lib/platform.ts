/* Platform-admin seed data (customers, tenant admins, MFA reset requests). Synthetic. Mutable; call bumpData() after changes. */
import plat from "@/data/platform.json";
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
/* eslint-disable @typescript-eslint/no-explicit-any */
export const CUSTOMERS: Record<string, any> = clone(plat.CUSTOMERS);
export const TENANT_ADMINS: any[] = clone(plat.TENANT_ADMINS);
export const MFA_REQUESTS: any[] = clone(plat.MFA_REQUESTS);
export const REGION_TREE: Record<string, string[]> = clone(plat.REGION_TREE);
export const RATES: any[] = clone(plat.RATES);
export const LAWFUL_BASIS: string[] = clone(plat.LAWFUL_BASIS);
export const ADMIN_SEED: any[] = clone(plat.ADMIN_SEED);
export const ROPA: any[] = clone(plat.ROPA);
export const custList = () => Object.values(CUSTOMERS);
