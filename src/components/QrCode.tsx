// 示意用 QR Code 圖像：依 seed 決定方塊排列，並非真正可掃描的編碼
function seededGrid(seed: string, size: number) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const cells: boolean[] = [];
  for (let i = 0; i < size * size; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    cells.push((h >> 16) % 3 !== 0);
  }
  return cells;
}

export default function QrCode({ seed, size = 9 }: { seed: string; size?: number }) {
  const cells = seededGrid(seed, size);
  const cell = 200 / size;

  const isFinder = (r: number, c: number) =>
    (r < 3 && c < 3) || (r < 3 && c >= size - 3) || (r >= size - 3 && c < 3);

  return (
    <svg viewBox="0 0 200 200" className="w-full h-full">
      <rect width="200" height="200" fill="white" />
      {Array.from({ length: size }).map((_, r) =>
        Array.from({ length: size }).map((_, c) => {
          if (isFinder(r, c)) return null;
          const on = cells[r * size + c];
          if (!on) return null;
          return <rect key={`${r}-${c}`} x={c * cell} y={r * cell} width={cell} height={cell} fill="#12224A" />;
        })
      )}
      {[
        [0, 0],
        [0, size - 3],
        [size - 3, 0],
      ].map(([r, c]) => (
        <g key={`${r}-${c}`}>
          <rect x={c * cell} y={r * cell} width={cell * 3} height={cell * 3} fill="#12224A" />
          <rect x={c * cell + cell * 0.6} y={r * cell + cell * 0.6} width={cell * 1.8} height={cell * 1.8} fill="white" />
          <rect x={c * cell + cell * 1.1} y={r * cell + cell * 1.1} width={cell * 0.8} height={cell * 0.8} fill="#12224A" />
        </g>
      ))}
    </svg>
  );
}
