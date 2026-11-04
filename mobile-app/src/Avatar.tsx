export default function Avatar({
  name,
  color,
  size = 44,
  imageUrl,
}: {
  name: string;
  color: string;
  size?: number;
  imageUrl?: string | null;
}) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name}
        className="avatar-circle"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className="avatar-circle-fallback"
      style={{ width: size, height: size, backgroundColor: color, fontSize: size * 0.4 }}
    >
      {name.slice(-2)}
    </div>
  );
}
