/** Display only. Never use a shortened label for identity or database matching. */
export function organizationDisplayName(organization: { name: string; level?: string; code?: string | null; districtCode?: string | null }) {
  const { name, level } = organization;
  const district = (organization.code ?? name.match(/300[A-E]-\d+/)?.[0] ?? "").trim();
  if ((level === "district" || /^300[A-E]-\d+\s*(?:區|專區)$/.test(name)) && /^300[A-E]-\d+$/.test(district)) return `${district} 區`;
  const multiple = (organization.code ?? name.match(/^(?:MD)?(300[A-E])(?:\s*複合區)?$/)?.[1] ?? "").trim();
  if ((level === "md" || /^MD300[A-E]$/.test(name)) && /^300[A-E]$/.test(multiple)) return `${multiple} 複合區`;
  return name;
}
