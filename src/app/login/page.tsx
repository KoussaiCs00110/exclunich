import { Suspense } from "react";
import AuthPage from "@/components/auth-page";
import { localDemoEnabled } from "@/lib/server/local-demo";
export default async function Login() {
  return (
    <Suspense>
      <AuthPage mode="login" localDemo={await localDemoEnabled()} />
    </Suspense>
  );
}
