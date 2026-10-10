/** The family-tree mark: a tree in a warm circle. Decorative. */
export function Emblem({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className="shrink-0">
      <circle cx="24" cy="24" r="23" fill="#7c2d12" />
      <circle cx="24" cy="24" r="20.5" fill="none" stroke="#f59e0b" strokeOpacity="0.55" strokeWidth="1.2" />
      <path d="M24 36V24M24 28l-5-4M24 26l5-4M24 31l-6-3M24 30l6-2" stroke="#fde68a" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <circle cx="24" cy="17" r="7" fill="#f59e0b" />
      <circle cx="17" cy="21" r="5" fill="#fbbf24" />
      <circle cx="31" cy="21" r="5" fill="#fbbf24" />
      <path d="M15 37h18" stroke="#fde68a" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
