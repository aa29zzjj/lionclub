const PALETTE = ["#E07A5F", "#3D8361", "#5B6EE1", "#D4A373", "#9B5DE5", "#48A9A6", "#E3B23C", "#C1666B", "#5BA3A0", "#C8A951"];

export function colorFromId(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}
