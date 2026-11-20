/* Cross-module request queues. Created by "My Work" (access + vendor requests) and consumed by Access and Third Parties. */
import access from "@/data/accessSeed.json";
import vreq from "@/data/vendorReqSeed.json";
/* eslint-disable @typescript-eslint/no-explicit-any */
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const PRODUCTION = (process.env.NEXT_PUBLIC_API_MODE || "mock") === "http"; // production fills these from the server (services/ws.ts)
export const ACCESS_REQUESTS: any[] = PRODUCTION ? [] : clone(access.ACCESS_REQUESTS);
export const ACCESS_REVIEWS: any[] = PRODUCTION ? [] : clone(access.ACCESS_REVIEWS);
/** Mutated by reassignment in the source (`VENDOR_REQS=VENDOR_REQS.filter(...)`); here it is a stable array: use .splice. */
export const VENDOR_REQS: any[] = PRODUCTION ? [] : clone(vreq.VENDOR_REQS);
