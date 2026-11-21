import Link from "next/link";
export default function NotFound() {
  return (
    <main className="standalone">
      <div className="card empty">
        <h1>Page not found</h1>
        <p>Let’s get you back to your attendance.</p>
        <Link className="btn btn-primary" href="/">
          Open dashboard
        </Link>
      </div>
    </main>
  );
}
