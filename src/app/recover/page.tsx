import { Suspense } from "react";
import AuthPage from "@/components/auth-page";
export default function Recover() {
  return (
    <Suspense>
      <AuthPage mode="recover" />
    </Suspense>
  );
}
