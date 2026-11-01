import { useState, type FormEvent } from "react";
import type { Member } from "./contract";
import { createApiClient, ApiError } from "./contract";

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
  const [phone, setPhone] = useState(member.phone ?? "");
  const [birthday, setBirthday] = useState(member.birthday?.slice(0, 10) ?? "");
  const [bio, setBio] = useState(member.bio ?? "");
  const [tags, setTags] = useState<string[]>(member.tags.map((t) => t.name));

  function startEditing() {
    setName(member.name);
    setNickname(member.nickname ?? "");
    setTitle(member.title ?? "");
    setPhone(member.phone ?? "");
    setBirthday(member.birthday?.slice(0, 10) ?? "");
    setBio(member.bio ?? "");
    setTags(member.tags.map((t) => t.name));
    setError(null);
    setEditing(true);
  }

  function toggleTag(tag: string) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateProfile({ name, nickname, title, phone, bio, tags, birthday });
      onUpdated(updated);
      setEditing(false);
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "更新失敗，請稍後再試");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="profile-view">
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
    <form onSubmit={handleSave} className="profile-form">
      <div>
        <label htmlFor="p-name">姓名</label>
        <input id="p-name" required value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label htmlFor="p-nickname">暱稱（選填）</label>
        <input id="p-nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} />
      </div>
      <div>
        <label htmlFor="p-title">職稱／身分</label>
        <select id="p-title" value={title} onChange={(e) => setTitle(e.target.value)}>
          <option value="">尚未設定</option>
          {TITLE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
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
          {TAG_OPTIONS.map((tag) => (
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
      {error ? <p className="error" role="alert">{error}</p> : null}
      <div className="form-actions">
        <button type="button" className="secondary" onClick={() => setEditing(false)} disabled={saving}>取消</button>
        <button type="submit" className="primary" disabled={saving}>{saving ? "儲存中…" : "儲存變更"}</button>
      </div>
    </form>
  );
}
