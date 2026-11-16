import { z } from "zod";

export const nextPhaseEnabled = process.env.NEXT_PUBLIC_NEXT_PHASE_ENABLED === "true";
export const meetupCategories = ["餐敘", "唱歌", "運動", "戶外", "交流", "其他"] as const;
export const maxBusinessCardBytes = 400_000;
export const maxBusinessCardInput = 12_000_000;

const id = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const professionalTag = text(1, 20).transform(value => value.normalize("NFKC").trim()).pipe(z.string().min(1).max(20).regex(/^[\p{L}\p{M}\p{N} +&.\/-]+$/u));
export const nextPhaseAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("meetup.create"), requestId: z.uuid(), title: text(2, 80), category: z.enum(meetupCategories), location: text(2, 120), description: text(0, 1000), startsAt: z.iso.datetime({ offset: true }), capacity: z.number().int().min(2).max(100) }).strict(),
  z.object({ action: z.literal("meetup.update"), id, revision: z.number().int().min(1).max(2147483646), startsAt: z.iso.datetime({ offset: true }), location: text(2, 120) }).strict(),
  z.object({ action: z.literal("notice.read"), id }).strict(),
  z.object({ action: z.literal("meetup.join"), id }).strict(),
  z.object({ action: z.literal("meetup.leave"), id }).strict(),
  z.object({ action: z.literal("meetup.cancel"), id }).strict(),
  z.object({ action: z.literal("meetup.message"), id, requestId: z.uuid(), body: text(1, 600) }).strict(),
  z.object({ action: z.literal("meetup.message.delete"), id, messageId: id }).strict(),
  z.object({ action: z.literal("meetup.report"), id, messageId: id.optional(), reason: text(2, 200) }).strict(),
  z.object({ action: z.literal("card.save"), image: z.string().min(4).max(Math.ceil(maxBusinessCardBytes / 3) * 4).regex(/^[A-Za-z0-9+/]+={0,2}$/).optional(), tags: z.array(professionalTag).max(8), shareTags: z.boolean() }).strict(),
  z.object({ action: z.literal("card.delete") }).strict(),
]);

export const nextPhaseQuery = z.discriminatedUnion("view", [
  z.object({ view: z.literal("meetups") }).strict(),
  z.object({ view: z.literal("meetup"), id }).strict(),
  z.object({ view: z.literal("card") }).strict(),
  z.object({ view: z.literal("notices") }).strict(),
]);
export type NextPhaseAction = z.infer<typeof nextPhaseAction>;
export type NextPhaseQuery = z.infer<typeof nextPhaseQuery>;
export type MeetupSummary = { id: string; title: string; category: string; location: string; description: string; startsAt: string; capacity: number; registeredCount: number; hostName: string; isHost: boolean; joined: boolean; state: "open" | "ended" | "cancelled" };
export type MeetupDetail = MeetupSummary & { revision: number; messages: { id: string; author: string; own: boolean; body: string; createdAt: string }[]; canReadChat: boolean; canWriteChat: boolean };
export type MeetupList = { organizationName: string; meetups: MeetupSummary[]; limited: boolean };
export type BusinessCardData = { image: string; tags: string[]; shareTags: boolean };
