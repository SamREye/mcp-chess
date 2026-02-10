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

  return (
    <span className={`avatar ${className ?? ""}`.trim()} title={resolvedTitle}>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt={resolvedTitle} />
      ) : (
        initial
      )}
    </span>
  );
}
