export type Friend = {
  id: string;
  name: string;
  chapter: string;
  title?: string;
  avatarColor: string;
  status: "friend" | "pending-out" | "pending-in" | "none";
};

export type UserProfile = {
  id: string;
  name: string;
  chapter: string;
  title: string;
  avatarColor: string;
  avatarUrl: string | null;
  memberNo: string;
  joinYear: string;
  validUntil: string;
  email: string;
  phone: string;
  bio: string;
  tags: string[];
};

export const currentUser: UserProfile = {
  id: "u1",
  name: "黃子杰",
  chapter: "台北曙光獅子會",
  title: "會員",
  avatarColor: "#C8A951",
  avatarUrl: null,
  memberNo: "A1-1-1-0023",
  joinYear: "2022",
  validUntil: "2026/12/31",
  email: "demo@lions.tw",
  phone: "0912-345-678",
  bio: "熱心公益，專長品牌行銷與活動企劃。",
  tags: ["品牌行銷", "公益服務"],
};

export const initialFriends: Friend[] = [
  { id: "f1", name: "陳怡君", chapter: "台北曙光獅子會", title: "總幹事", avatarColor: "#E07A5F", status: "friend" },
  { id: "f2", name: "林志明", chapter: "台北晨曦獅子會", title: "會長", avatarColor: "#3D8361", status: "friend" },
  { id: "f3", name: "王美華", chapter: "台北曙光獅子會", title: "財務", avatarColor: "#5B6EE1", status: "friend" },
  { id: "f4", name: "李建國", chapter: "新竹東區獅子會", avatarColor: "#D4A373", status: "friend" },
  { id: "f5", name: "張雅婷", chapter: "台中中區獅子會", avatarColor: "#9B5DE5", status: "pending-in" },
];

// 模擬「掃描好友 QR Code」會掃到的人（示範用，實際應由掃描到的 QR 內容決定）
export const qrScanCandidate: Friend = {
  id: "q1",
  name: "許育瑋",
  chapter: "板橋大觀獅子會",
  title: "幹事",
  avatarColor: "#5BA3A0",
  status: "none",
};

export const suggestedFriends: Friend[] = [
  { id: "s1", name: "吳俊宏", chapter: "台北曙光獅子會", title: "新會員", avatarColor: "#48A9A6", status: "none" },
  { id: "s2", name: "周佳穎", chapter: "板橋大觀獅子會", avatarColor: "#E3B23C", status: "none" },
  { id: "s3", name: "蔡宗翰", chapter: "桃園龍潭獅子會", avatarColor: "#C1666B", status: "none" },
];

export type EventItem = {
  id: string;
  title: string;
  date: string;
  location: string;
  description?: string;
  capacity?: number;
  hostChapter?: string;
};

export const upcomingEvents: EventItem[] = [
  {
    id: "e1",
    title: "年度會員大會",
    date: "2026/10/18 (日) 09:30",
    location: "台北國際會議中心",
    description: "本年度會員大會將選舉新任理監事，並頒發年度服務獎項，歡迎所有會員出席並邀請新朋友參加。",
    capacity: 200,
    hostChapter: "台北曙光獅子會",
  },
  {
    id: "e2",
    title: "偏鄉關懷服務日",
    date: "2026/10/25 (日) 08:00",
    location: "新竹縣尖石鄉",
    description: "與在地醫療院所合作，於偏鄉舉辦免費健檢與物資發放活動。",
    capacity: 40,
    hostChapter: "新竹東區獅子會",
  },
  {
    id: "e3",
    title: "新舊任職員交接典禮",
    date: "2026/11/02 (一) 18:30",
    location: "晶華酒店 3F 宴會廳",
    description: "歡送卸任幹部並歡迎新任理監事團隊，典禮後安排餐敘。",
    capacity: 120,
    hostChapter: "台北曙光獅子會",
  },
];

// 組織階層：複合區 → 專區 → 分區 → 分會（對照後台 Club/Zone/District/MultiDistrict）
export type ClubOption = {
  id: string;
  name: string;
  path: string; // 複合區／專區／分區
};

export const clubOptions: ClubOption[] = [
  { id: "c1", name: "台北曙光獅子會", path: "A 複合區 ／ 台北專區 ／ 中正分區" },
  { id: "c2", name: "台北晨曦獅子會", path: "A 複合區 ／ 台北專區 ／ 大安分區" },
  { id: "c3", name: "板橋大觀獅子會", path: "A 複合區 ／ 新北專區 ／ 板橋分區" },
  { id: "c4", name: "新竹東區獅子會", path: "B 複合區 ／ 新竹專區 ／ 東區分區" },
  { id: "c5", name: "台中中區獅子會", path: "C 複合區 ／ 台中專區 ／ 中區分區" },
];

// 模擬 QR Code 邀請連結所攜帶的資訊：分會 + 當屆 PIN
export const mockInvite = {
  clubId: "c1",
  pin: "248613",
};

export const memberTitleOptions = ["新會員", "會員", "幹事", "總幹事", "副會長", "會長", "財務", "秘書"];

export const tagOptions = ["財務規劃", "法律諮詢", "餐飲經營", "品牌行銷", "不動產", "醫療保健", "教育培訓", "公益服務"];

export type SentNotification = {
  id: string;
  eventTitle: string;
  recipients: string[];
  message: string;
  sentAt: string;
};

export const initialSentNotifications: SentNotification[] = [
  {
    id: "n1",
    eventTitle: "年度會員大會",
    recipients: ["陳怡君", "林志明"],
    message: "別忘了這週日的會員大會，記得準時出席！",
    sentAt: "今天 09:12",
  },
];
