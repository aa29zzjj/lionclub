import { EVENT_TAGS, eventTagLabels, type EventTag } from "@/lib/event-list";

export default function EventTagPicker({ value, onChange, disabled = false }: { value: EventTag[]; onChange: (tags: EventTag[]) => void; disabled?: boolean }) {
  return <fieldset disabled={disabled}><legend className="mb-2 text-base">活動標籤（選填，最多 3 個）</legend>
    {disabled && <p className="mb-2 text-sm text-lion-muted">標籤尚未啟用，可先建立不含標籤的活動。</p>}
    <div className="flex flex-wrap gap-2">{EVENT_TAGS.map((tag) => <label key={tag} className="flex min-h-12 items-center gap-2 rounded-xl border border-lion-border bg-lion-card px-3 text-sm">
      <input type="checkbox" checked={value.includes(tag)} disabled={value.length >= 3 && !value.includes(tag)}
        onChange={() => onChange(value.includes(tag) ? value.filter((entry) => entry !== tag) : [...value, tag])} />{eventTagLabels[tag]}
    </label>)}</div>
  </fieldset>;
}
