import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AuthPage from "@/components/auth-page";
import { getBrowserSession } from "@/lib/server/auth";
import { DEMO_COOKIE, localDemoEnabled } from "@/lib/server/local-demo";

export default async function Login() {
  const localDemo = await localDemoEnabled();
  if (localDemo) {
    if ((await cookies()).get(DEMO_COOKIE)?.value === "active") redirect("/");
  } else {
    const session = await getBrowserSession();
    if (session) redirect(session.registration_complete ? "/" : "/register?step=save");
  }
  return (
    <Suspense>
      <AuthPage mode="login" localDemo={localDemo} />
    </Suspense>
  );
}
