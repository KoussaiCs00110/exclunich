export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 32 32" fill="none">
          <path d="M6 6h19v5H12v4h10v5H12v4h13v5H6V6Z" fill="currentColor" />
          <path
            d="m18 23 4 4 7-8"
            stroke="var(--amber)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {!compact && (
        <span>
          exclunich<span className="brand-dot">.</span>
        </span>
      )}
    </span>
  );
}
