import type { MediaType } from "@konomi/engine";

export const CHANNEL = "konomi";
export const APP_LOCK = "konomi-app";

export interface Action {
  kind: "addToPlanning" | "notInterested";
  id: number;
  type: MediaType;
}

export type ChannelMessage =
  | { type: "saved" }
  | { type: "action"; reqId: string; action: Action }
  | { type: "action-reply"; reqId: string; ok: true; result: string }
  | { type: "action-reply"; reqId: string; ok: false; error: string };

export const ACTION_TIMEOUT_MS = 60_000;

export async function appIsOpen(): Promise<boolean> {
  if (!navigator.locks) return false;
  const state = await navigator.locks.query();
  return Boolean(state.held?.some((l) => l.name === APP_LOCK));
}

export function askApp(action: Action, timeoutMs = ACTION_TIMEOUT_MS): Promise<string> {
  const channel = new BroadcastChannel(CHANNEL);
  const reqId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      channel.close();
      reject(new Error("Konomi.moe's tab didn't answer"));
    }, timeoutMs);
    channel.onmessage = (e: MessageEvent<ChannelMessage>) => {
      const m = e.data;
      if (m.type !== "action-reply" || m.reqId !== reqId) return;
      clearTimeout(timer);
      channel.close();
      if (m.ok) resolve(m.result);
      else reject(new Error(m.error));
    };
    channel.postMessage({ type: "action", reqId, action } satisfies ChannelMessage);
  });
}
