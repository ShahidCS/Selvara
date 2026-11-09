import Head from "next/head";
import VendorPortalPage from "@/components/modules/vendorportal/VendorPortalPage";
/** External, standalone vendor assessment portal (no app shell, no workspace role). */
export default function VendorPortal() {
  return (<><Head><title>Vendor security assessment</title><meta name="robots" content="noindex,nofollow" /></Head><VendorPortalPage /></>);
}
