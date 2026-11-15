import Head from "next/head";
import { LoginPage } from "@/features/auth";
/** Standalone sign-in and request-to-join page (no app shell). */
export default function Login() {
  return (<><Head><title>Sign in · Selvara</title></Head><LoginPage /></>);
}
