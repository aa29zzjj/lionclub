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
  officersTruncated?: boolean;
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
          {node.officersTruncated && <p className="text-xs text-lion-muted">僅顯示有界部分名單；不是完整名冊下載。</p>}
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
  const [directoryMessage, setDirectoryMessage] = useState("待營運者確認名冊揭露授權；目前僅提供組織架構。");

  useEffect(() => {
    let active = true;
    fetch("/api/organizations/tree", { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 401) { router.replace("/login"); return; }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "載入失敗");
        if (active) { setRoots(data.organizations ?? []); setDirectoryMessage(data.directory?.message ?? "待營運者確認名冊揭露授權"); }
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
        <p className="text-sm text-lion-muted mb-3">從複合區往下展開，查看區、專區、分區與分會。名冊列載、本人資歷核實與管理授權分開處理。</p>
        <p className="mb-4 rounded-xl border border-lion-border bg-lion-card p-3 text-sm text-lion-muted">{directoryMessage}</p>

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
