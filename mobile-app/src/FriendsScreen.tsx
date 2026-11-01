import { useCallback, useEffect, useState } from "react";
import { Camera } from "@capacitor/camera";
import jsQR from "jsqr";
import { QRCodeSVG } from "qrcode.react";
import { createApiClient, ApiError, type FriendCard, type Member } from "./contract";
import { createFriendQrPayload, parseFriendQrPayload } from "../../src/lib/friend-qr";

/** Decodes a QR code from a captured photo. No live camera preview plugin is
 * installed (the obvious candidate, @capacitor-mlkit/barcode-scanning, ships
 * CocoaPods-only iOS sources with no Package.swift and can't be added to this
 * project's SPM-only Capacitor setup without also setting up CocoaPods).
 * Capturing one photo and decoding it client-side needs no extra native
 * tooling and still only asks for the camera when the member taps "scan". */
async function decodeQrFromCamera(): Promise<string | null> {
  const photo = await Camera.takePhoto({ quality: 80 });
  if (!photo.webPath) return null;
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("IMAGE_LOAD_FAILED"));
    img.src = photo.webPath!;
  });
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const code = jsQR(imageData.data, imageData.width, imageData.height);
  return code?.data ?? null;
}

declare const API_BASE_URL: string;
const api = createApiClient(API_BASE_URL);

type Tab = "friends" | "incoming" | "search";

function Card({ card, action }: { card: FriendCard; action?: { label: string; onClick: () => void; busy?: boolean }[] }) {
  return (
    <div className="list-card">
      <div className="list-card-main">
        <p className="list-card-title">{card.nickname || card.name}</p>
        <p className="list-card-meta">{card.chapter} · {card.title ?? "會員"}</p>
      </div>
      {action ? (
        <div className="list-card-actions">
          {action.map((a) => (
            <button key={a.label} type="button" className="secondary" onClick={a.onClick} disabled={a.busy}>{a.label}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function FriendsScreen({ member }: { member: Member }) {
  const [tab, setTab] = useState<Tab>("friends");
  const [friends, setFriends] = useState<FriendCard[]>([]);
  const [incoming, setIncoming] = useState<FriendCard[]>([]);
  const [suggestions, setSuggestions] = useState<FriendCard[]>([]);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; name: string; nickname?: string; chapter: string; title?: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showMyQr, setShowMyQr] = useState(false);
  const [scanning, setScanning] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.getFriends();
      setFriends(data.friends);
      setIncoming(data.incoming);
      setSuggestions(data.suggestions);
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "讀取好友失敗");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function doSearch() {
    if (!query.trim()) { setSearchResults([]); return; }
    try {
      setSearchResults(await api.searchMembers(query.trim()));
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "搜尋失敗");
    }
  }

  async function handleRequest(memberId: string) {
    setBusyId(memberId);
    try {
      await api.requestFriend(memberId);
      setToast("已送出好友邀請");
      setSearchResults((prev) => prev.filter((m) => m.id !== memberId));
      setSuggestions((prev) => prev.filter((m) => m.id !== memberId));
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "送出邀請失敗");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRespond(friendshipId: string, action: "accept" | "decline") {
    setBusyId(friendshipId);
    try {
      await api.respondFriend(friendshipId, action);
      await load();
      setToast(action === "accept" ? "已成為好友" : "已拒絕邀請");
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "回覆邀請失敗");
    } finally {
      setBusyId(null);
    }
  }

  async function handleScan() {
    setError(null);
    setScanning(true);
    try {
      const raw = await decodeQrFromCamera();
      const scannedMemberId = raw ? parseFriendQrPayload(raw) : null;
      if (!scannedMemberId) { setError("無法辨識此 QR Code，請對準後重新拍攝"); return; }
      await api.addFriendByQr(scannedMemberId);
      await load();
      setToast("已加好友");
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "掃描失敗，請再試一次");
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="friends-screen">
      {toast ? <div className="toast" role="status">{toast}</div> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}

      <div className="friends-toolbar">
        <button type="button" className="primary" onClick={() => setShowMyQr(true)}>我的 QR Code</button>
        <button type="button" className="secondary" onClick={handleScan} disabled={scanning}>{scanning ? "掃描中…" : "掃描加好友"}</button>
      </div>

      {showMyQr ? (
        <div className="qr-overlay" role="dialog" aria-label="我的會員 QR Code">
          <div className="qr-panel">
            <QRCodeSVG value={createFriendQrPayload(member.id)} size={220} bgColor="#ffffff" fgColor="#0a0d18" />
            <p className="member-meta" style={{ marginTop: "1rem" }}>{member.name}</p>
            <button type="button" className="secondary" onClick={() => setShowMyQr(false)}>關閉</button>
          </div>
        </div>
      ) : null}

      <nav className="sub-tabs">
        <button type="button" className={tab === "friends" ? "sub-tab active" : "sub-tab"} onClick={() => setTab("friends")}>好友（{friends.length}）</button>
        <button type="button" className={tab === "incoming" ? "sub-tab active" : "sub-tab"} onClick={() => setTab("incoming")}>邀請（{incoming.length}）</button>
        <button type="button" className={tab === "search" ? "sub-tab active" : "sub-tab"} onClick={() => setTab("search")}>找朋友</button>
      </nav>

      {tab === "friends" && (
        <div className="list-stack">
          {friends.length === 0 ? <p className="member-meta">還沒有好友，去掃 QR Code 或搜尋認識的獅友吧。</p> : null}
          {friends.map((f) => <Card key={f.id} card={f} />)}
        </div>
      )}

      {tab === "incoming" && (
        <div className="list-stack">
          {incoming.length === 0 ? <p className="member-meta">目前沒有待回覆的邀請。</p> : null}
          {incoming.map((f) => (
            <Card key={f.friendshipId} card={f} action={[
              { label: "接受", onClick: () => handleRespond(f.friendshipId!, "accept"), busy: busyId === f.friendshipId },
              { label: "拒絕", onClick: () => handleRespond(f.friendshipId!, "decline"), busy: busyId === f.friendshipId },
            ]} />
          ))}
        </div>
      )}

      {tab === "search" && (
        <div className="list-stack">
          <div className="search-row">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜尋姓名或暱稱" onKeyDown={(e) => { if (e.key === "Enter") void doSearch(); }} />
            <button type="button" className="secondary" onClick={doSearch}>搜尋</button>
          </div>
          {searchResults.map((m) => (
            <Card key={m.id} card={{ ...m, status: "none" }} action={[{ label: "加好友", onClick: () => handleRequest(m.id), busy: busyId === m.id }]} />
          ))}
          {suggestions.length > 0 && query.trim() === "" ? (
            <>
              <p className="member-meta" style={{ marginTop: "0.5rem" }}>可能認識的獅友</p>
              {suggestions.map((m) => (
                <Card key={m.id} card={m} action={m.status === "pending-out" ? undefined : [{ label: "加好友", onClick: () => handleRequest(m.id), busy: busyId === m.id }]} />
              ))}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
