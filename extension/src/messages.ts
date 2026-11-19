import type { MediaType } from "@konomi/engine";
import { api } from "./browser.ts";
import type { Action } from "./channel.ts";
import type { TitleVerdict } from "./verdicts.ts";

export interface Requests {
  verdict: { args: { id: number; type: MediaType }; result: TitleVerdict };
  action: { args: { action: Action }; result: string };
  openApp: { args: Record<string, never>; result: null };
  seen: { args: Record<string, never>; result: null };
}
export type RequestKind = keyof Requests;
export type Request = { [K in RequestKind]: { kind: K } & Requests[K]["args"] }[RequestKind];
export type Reply = { ok: true; result: unknown } | { ok: false; error: string };

export async function send<K extends RequestKind>(
  kind: K,
  args: Requests[K]["args"],
): Promise<Requests[K]["result"]> {
  const reply = (await api().runtime.sendMessage({ kind, ...args })) as Reply | undefined;
  if (!reply) throw new Error("Konomi.moe's background didn't answer");
  if (!reply.ok) throw new Error(reply.error);
  return reply.result as Requests[K]["result"];
}
