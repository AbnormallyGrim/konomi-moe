/**
 * Coordination between the app tab and the background. While the app tab is open it holds a
 * Web Lock and is the only writer of the store: the background hands it the popup's and the
 * badge's actions over a BroadcastChannel instead of writing itself, and skips its daily sync.
 * Otherwise a change made outside the tab would be overwritten by the tab's older copy.
 */

import type { MediaType } from "@konomi/engine";

export const CHANNEL = "konomi";
/** Held by the open app tab for as long as it's open. */
export const APP_LOCK = "konomi-app";

/** Something the popup or the AniList badge does to the user's data. */
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

/** How long the background waits for the app tab to carry out an action. */
export const ACTION_TIMEOUT_MS = 60_000;

export async function appIsOpen(): Promise<boolean> {
  if (!navigator.locks) return false;
  const state = await navigator.locks.query();
  return Boolean(state.held?.some((l) => l.name === APP_LOCK));
}

/** Asks the open app tab to carry out an action; resolves with its confirmation text. */
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
