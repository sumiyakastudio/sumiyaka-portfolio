"use server";

import { headers } from "next/headers";
import { sendContactMail } from "@/lib/mail";

const rateMap = new Map<string, number[]>();
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = rateMap.get(ip) ?? [];
  const recent = timestamps.filter((t) => now - t < RATE_WINDOW_MS);
  rateMap.set(ip, recent);
  if (recent.length >= RATE_LIMIT) return true;
  recent.push(now);
  return false;
}

export interface ContactState {
  success: boolean;
  error: string;
}

export async function submitContact(
  _prev: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const headerStore = await headers();
  const ip =
    headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headerStore.get("x-real-ip") ??
    "unknown";

  if (isRateLimited(ip)) {
    return { success: false, error: "送信回数の上限に達しました。しばらく経ってからお試しください。" };
  }

  // honeypot: ボットが埋める隠しフィールド。値があればサイレントに成功扱いで破棄（メールは送らない）
  const honeypot = formData.get("contact_hp");
  if (typeof honeypot === "string" && honeypot.trim() !== "") {
    return { success: true, error: "" };
  }

  const name = formData.get("name") as string | null;
  const email = formData.get("email") as string | null;
  const budget = formData.get("budget") as string | null;
  const deadline = formData.get("deadline") as string | null;
  const message = formData.get("message") as string | null;

  if (!name?.trim() || name.length > 100) {
    return { success: false, error: "氏名を正しく入力してください" };
  }
  if (!email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return { success: false, error: "メールアドレスを正しく入力してください" };
  }
  if (!message?.trim() || message.length > 5000) {
    return { success: false, error: "ご相談内容を入力してください（5000文字以内）" };
  }

  try {
    await sendContactMail({
      name: name.trim(),
      email: email.trim(),
      budget: budget ?? "",
      deadline: deadline ?? "",
      message: message.trim(),
    });
    return { success: true, error: "" };
  } catch (e) {
    console.error("[contact] mail send failed:", e);
    return { success: false, error: "送信に失敗しました。時間をおいて再度お試しください。" };
  }
}
