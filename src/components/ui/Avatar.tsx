/** Round profile picture, or the person's initials when there is no photo. */
export function Avatar({ url, name, size = 40, className = '' }: { url?: string | null; name: string; size?: number; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => [...w][0])
    .join('');
  return url ? (
    <img src={url} alt="" width={size} height={size} style={{ width: size, height: size }} className={`shrink-0 rounded-full object-cover ${className}`} draggable={false} />
  ) : (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-amber-100 font-medium text-amber-900 ${className}`}
    >
      {initials || '?'}
    </span>
  );
}
