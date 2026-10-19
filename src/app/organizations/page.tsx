"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { ChevronRightIcon } from "@/components/icons";
import { organizationLevelOptions, type OrganizationLevel } from "@/lib/experience-data";

type OrgNode = {
  id: string;
  level: OrganizationLevel;
  name: string;
  districtCode?: string | null;
  hasChildren: boolean;
  officers: { positionName: string; personName: string }[];
};

const levelLabel = (level: OrganizationLevel) => organizationLevelOptions.find((o) => o.value === level)?.label ?? level;

function TreeNode({ node, depth }: { node: OrgNode; depth: number }) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<OrgNode[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    if (!node.hasChildren) return;
    if (!expanded && children === null) {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/organizations/tree?parentId=${encodeURIComponent(node.id)}`, { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "載入失敗");
        setChildren(data.organizations ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "載入失敗");
      } finally {
        setLoading(false);
      }
    }
    setExpanded((value) => !value);
  }

  return (
    <div style={{ marginLeft: depth > 0 ? 14 : 0 }} className={depth > 0 ? "border-l border-lion-border pl-3" : ""}>
      <button
        type="button"
        onClick={toggle}
        disabled={!node.hasChildren}
        className="w-full flex items-center gap-2 py-2.5 text-left min-h-12"
      >
        {node.hasChildren ? (
          <ChevronRightIcon className={`w-4 h-4 shrink-0 text-lion-muted transition-transform ${expanded ? "rotate-90" : ""}`} />
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-base font-medium truncate">{node.name}</span>
            <span className="shrink-0 rounded-full bg-lion-gold/15 px-2 py-0.5 text-[10px] text-lion-gold">{levelLabel(node.level)}</span>
          </div>
          {node.officers.length > 0 && (
            <p className="text-xs text-lion-muted mt-0.5 truncate">
              {node.officers.map((o) => `${o.positionName} ${o.personName}`).join("、")}
            </p>
          )}
        </div>
      </button>
      {loading && <p className="text-xs text-lion-muted pl-6 pb-2">載入中…</p>}
      {error && <p className="text-xs text-lion-danger pl-6 pb-2">{error}</p>}
      {expanded && children && children.length === 0 && (
        <p className="text-xs text-lion-muted pl-6 pb-2">沒有下層組織</p>
      )}
      {expanded && children && children.map((child) => <TreeNode key={child.id} node={child} depth={depth + 1} />)}
    </div>
  );
}

export default function OrganizationsPage() {
  const router = useRouter();
  const [roots, setRoots] = useState<OrgNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/organizations/tree", { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 401) { router.replace("/login"); return; }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "載入失敗");
        if (active) setRoots(data.organizations ?? []);
      })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : "載入失敗"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [router]);

  return (
    <AppShell>
      <div className="px-5 pt-6 pb-8">
        <button onClick={() => router.back()} className="min-h-12 text-base text-lion-muted mb-2">← 返回</button>
        <h1 className="text-xl font-bold mb-1">組織架構與幹部名單</h1>
        <p className="text-sm text-lion-muted mb-4">從複合區往下展開，可以看到各層級的分會、專區、分區，以及本年度在任的幹部。</p>

        {loading && <p role="status" className="text-base text-lion-muted text-center py-8">載入中…</p>}
        {error && <p role="alert" className="text-base text-lion-danger text-center py-8">{error}</p>}
        {!loading && !error && (
          <div className="rounded-2xl bg-lion-card border border-lion-border p-3">
            {roots.map((node) => <TreeNode key={node.id} node={node} depth={0} />)}
          </div>
        )}
      </div>
    </AppShell>
  );
}
