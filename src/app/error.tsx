"use client";
import { AlertTriangle } from "lucide-react";
export default function Error({ reset }: { reset: () => void }) {
  return (
    <main className="standalone">
      <div className="card empty">
        <AlertTriangle size={36} />
        <h1>Something went wrong</h1>
        <p>Your data is still saved. Try loading this page again.</p>
        <button className="btn btn-primary" onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}
