export default function Avatar({
  name,
  color,
  size = 44,
}: {
  name: string;
  color: string;
  size?: number;
}) {
  return (
    <div
      className="flex items-center justify-center rounded-full font-semibold text-white shrink-0"
      style={{ width: size, height: size, backgroundColor: color, fontSize: size * 0.4 }}
    >
      {name.slice(-2)}
    </div>
  );
}
