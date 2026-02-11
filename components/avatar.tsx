type AvatarProps = {
  email?: string | null;
  name?: string | null;
  image?: string | null;
  fallback?: string;
  className?: string;
  title?: string;
};

function getInitial(input: string | null | undefined, fallback: string) {
  const text = input?.trim();
  if (!text) return fallback;
  return text[0].toUpperCase();
}

function getAvatarSrc(image: string | null | undefined) {
  const value = image?.trim();
  if (!value) return null;
  if (
    value.startsWith("/") ||
    value.startsWith("data:") ||
    value.startsWith("blob:") ||
    value.startsWith("/api/avatar?url=")
  ) {
    return value;
  }
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return `/api/avatar?url=${encodeURIComponent(value)}`;
  }
  return value;
}

export function Avatar({
  email,
  name,
  image,
  fallback = "?",
  className,
  title
}: AvatarProps) {
  const resolvedTitle = title ?? email ?? name ?? "User";
  const initial = getInitial(email ?? name, fallback);
  const src = getAvatarSrc(image);

  return (
    <span className={`avatar ${className ?? ""}`.trim()} title={resolvedTitle}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={resolvedTitle} loading="lazy" referrerPolicy="no-referrer" />
      ) : (
        initial
      )}
    </span>
  );
}
