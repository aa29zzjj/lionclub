"use client";

import { createContext, useContext, useMemo, useState, ReactNode } from "react";
import {
  Friend,
  EventItem,
  SentNotification,
  UserProfile,
  currentUser as initialUser,
  initialFriends,
  suggestedFriends as initialSuggested,
  upcomingEvents as initialEvents,
  initialSentNotifications,
  qrScanCandidate,
} from "./mock-data";

type AppData = {
  profile: UserProfile;
  updateProfile: (patch: Partial<UserProfile>) => void;

  friends: Friend[];
  incoming: Friend[];
  suggestions: Friend[];
  acceptRequest: (id: string) => void;
  declineRequest: (id: string) => void;
  sendRequest: (id: string) => void;
  addFriendByQr: () => Friend;

  events: EventItem[];
  addEvent: (event: Omit<EventItem, "id">) => EventItem;

  notifications: SentNotification[];
  sendNotification: (n: Omit<SentNotification, "id">) => void;
};

const AppDataContext = createContext<AppData | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile>(initialUser);
  const [friends, setFriends] = useState<Friend[]>(initialFriends.filter((f) => f.status === "friend"));
  const [incoming, setIncoming] = useState<Friend[]>(initialFriends.filter((f) => f.status === "pending-in"));
  const [suggestions, setSuggestions] = useState<Friend[]>(initialSuggested);
  const [events, setEvents] = useState<EventItem[]>(initialEvents);
  const [notifications, setNotifications] = useState<SentNotification[]>(initialSentNotifications);

  function updateProfile(patch: Partial<UserProfile>) {
    setProfile((prev) => ({ ...prev, ...patch }));
  }

  function acceptRequest(id: string) {
    const person = incoming.find((f) => f.id === id);
    if (!person) return;
    setIncoming((prev) => prev.filter((f) => f.id !== id));
    setFriends((prev) => [...prev, { ...person, status: "friend" }]);
  }

  function declineRequest(id: string) {
    setIncoming((prev) => prev.filter((f) => f.id !== id));
  }

  function sendRequest(id: string) {
    setSuggestions((prev) => prev.map((f) => (f.id === id ? { ...f, status: "pending-out" } : f)));
  }

  function addFriendByQr() {
    const newFriend: Friend = { ...qrScanCandidate, id: `qr-${Date.now()}`, status: "friend" };
    setFriends((prev) => (prev.some((f) => f.name === newFriend.name) ? prev : [...prev, newFriend]));
    return newFriend;
  }

  function addEvent(event: Omit<EventItem, "id">) {
    const newEvent: EventItem = { ...event, id: `e-${Date.now()}` };
    setEvents((prev) => [newEvent, ...prev]);
    return newEvent;
  }

  function sendNotification(n: Omit<SentNotification, "id">) {
    setNotifications((prev) => [{ ...n, id: `n-${Date.now()}` }, ...prev]);
  }

  const value = useMemo<AppData>(
    () => ({
      profile,
      updateProfile,
      friends,
      incoming,
      suggestions,
      acceptRequest,
      declineRequest,
      sendRequest,
      addFriendByQr,
      events,
      addEvent,
      notifications,
      sendNotification,
    }),
    [profile, friends, incoming, suggestions, events, notifications]
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within AppDataProvider");
  return ctx;
}
