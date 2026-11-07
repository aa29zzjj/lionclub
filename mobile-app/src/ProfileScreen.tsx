import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type { Member } from "./contract";
import { createApiClient, uploadToPresignedUrl } from "./contract";
import Avatar from "./Avatar";
import { colorFromId } from "../../src/lib/avatar-color";
import { ProfileSaveCancelled, saveProfileDraft, validateAvatar } from "./profile-draft";

declare const API_BASE_URL: string;
const api = createApiClient(API_BASE_URL);

const TAG_OPTIONS = ["財務規劃", "法律諮詢", "餐飲經營", "品牌行銷", "不動產", "醫療保健", "教育培訓", "公益服務"];
const TITLE_OPTIONS = ["新會員", "會員", "幹事", "總幹事", "副會長", "會長", "財務", "秘書"];

export default function ProfileScreen({ member, onUpdated }: { member: Member; onUpdated: (member: Member) => void }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(member.name);
  const [nickname, setNickname] = useState(member.nickname ?? "");
  const [title, setTitle] = useState(member.title ?? "");
  const [email, setEmail] = useState(member.email ?? "");
  const [phone, setPhone] = useState(member.phone ?? "");
  const [birthday, setBirthday] = useState(member.birthday?.slice(0, 10) ?? "");
  const [bio, setBio] = useState(member.bio ?? "");
  const [tags, setTags] = useState<string[]>(member.tags.map((t) => t.name));
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const mounted = useRef(true);
  const owner = useRef(member.id);
  owner.current = member.id;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!avatarFile) { setAvatarPreview(null); return; }
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);
  useEffect(() => { setEditing(false); setAvatarFile(null); setSaving(false); setError(null); }, [member.id]);

  function startEditing() {
    setName(member.name);
    setNickname(member.nickname ?? "");
    setTitle(member.title ?? "");
    setEmail(member.email ?? "");
    setPhone(member.phone ?? "");
    setBirthday(member.birthday?.slice(0, 10) ?? "");
    setBio(member.bio ?? "");
    setTags(member.tags.map((t) => t.name));
    setAvatarFile(null);
    setError(null);
    setEditing(true);
  }

  function chooseAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try { validateAvatar(file); setAvatarFile(file); setError(null); }
    catch (failure) { setAvatarFile(null); setError(failure instanceof Error ? failure.message : "無法讀取這張圖片"); }
  }

  function toggleTag(tag: string) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    const memberId = member.id;
    const isCurrent = () => mounted.current && owner.current === memberId;
    try {
      const updated = await saveProfileDraft({ memberId, draft: { name, nickname, title, email, phone, bio, tags, birthday },
        avatar: avatarFile, isCurrent, api, upload: uploadToPresignedUrl });
      if (!isCurrent()) return;
      onUpdated(updated);
      setAvatarFile(null);
      setEditing(false);
    } catch (failure) {
      if (isCurrent() && !(failure instanceof ProfileSaveCancelled)) setError(failure instanceof Error ? failure.message : "更新失敗，請稍後再試");
    } finally {
      if (isCurrent()) setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="profile-view">
        <Avatar name={member.name} color={colorFromId(member.id)} imageUrl={member.photoUrl} size={80} />
        <p className="member-name">{member.nickname || member.name}</p>
        {member.nickname ? <p className="member-meta">{member.name}</p> : null}
        <p className="member-meta">{member.organization?.name ?? "尚未分派分會"} · {member.title ?? "會員"}</p>

        <div className="profile-card">
          <div className="profile-row"><span>Email</span><span>{member.email}</span></div>
          <div className="profile-row"><span>手機</span><span>{member.phone || "尚未填寫"}</span></div>
          <div className="profile-row"><span>生日</span><span>{member.birthday ? new Date(member.birthday).toLocaleDateString("zh-TW") : "尚未填寫"}</span></div>
          <div className="profile-row"><span>會員編號</span><span>{member.memberNo || "待系統編號"}</span></div>
        </div>

        {member.tags.length > 0 && (
          <div className="tag-row">
            {member.tags.map((tag) => <span key={tag.name} className="tag-chip">#{tag.name}</span>)}
          </div>
        )}
        {member.bio ? <p className="profile-bio">{member.bio}</p> : null}

        <button type="button" className="secondary" onClick={startEditing}>編輯個人資料</button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="profile-form" aria-busy={saving}>
      <fieldset disabled={saving} className="profile-form" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <div>
        <label htmlFor="p-avatar">大頭貼（選填）</label>
        <Avatar name={name || member.name} color={colorFromId(member.id)} imageUrl={avatarPreview ?? member.photoUrl} size={80} />
        <input id="p-avatar" type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseAvatar} aria-describedby="p-avatar-help" />
        <p id="p-avatar-help" className="member-meta">JPG、PNG 或 WebP，最多 5 MB。儲存變更後才會更新大頭貼。</p>
        {avatarFile ? <button type="button" className="secondary" onClick={() => setAvatarFile(null)}>取消選擇這張圖片</button> : null}
      </div>
      <div>
        <label htmlFor="p-name">姓名</label>
        <input id="p-name" required value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label htmlFor="p-nickname">暱稱（選填）</label>
        <input id="p-nickname" maxLength={50} value={nickname} onChange={(e) => setNickname(e.target.value)} />
      </div>
      <div>
        <label htmlFor="p-title">職稱／身分</label>
        <select id="p-title" value={title} onChange={(e) => setTitle(e.target.value)}>
          <option value="">尚未設定</option>
          {member.title && !TITLE_OPTIONS.includes(member.title) ? <option value={member.title}>{member.title}</option> : null}
          {TITLE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="p-email">Email</label>
        <input id="p-email" type="email" required maxLength={254} autoComplete="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} aria-describedby="p-email-help" />
        <p id="p-email-help" className="member-meta">變更後需重新驗證 Email；請以更新後的信箱登入。</p>
      </div>
      <div>
        <label htmlFor="p-phone">手機</label>
        <input id="p-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div>
        <label htmlFor="p-birthday">生日</label>
        <input id="p-birthday" type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} />
      </div>
      <div>
        <label>專長／興趣標籤</label>
        <div className="tag-row">
          {[...new Set([...TAG_OPTIONS, ...member.tags.map(tag => tag.name), ...tags])].map((tag) => (
            <button type="button" key={tag} className={tags.includes(tag) ? "tag-chip active" : "tag-chip"} onClick={() => toggleTag(tag)}>
              #{tag}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label htmlFor="p-bio">關於我</label>
        <textarea id="p-bio" rows={3} value={bio} onChange={(e) => setBio(e.target.value)} />
      </div>
      </fieldset>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <div className="form-actions">
        <button type="button" className="secondary" onClick={() => { setAvatarFile(null); setEditing(false); }} disabled={saving}>取消</button>
        <button type="submit" className="primary" disabled={saving}>{saving ? "儲存中…" : "儲存變更"}</button>
      </div>
    </form>
  );
}
