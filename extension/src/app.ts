import { mount } from "@konomi/ui";
import type { Session } from "@konomi/ui/session";
import { runAction } from "./actions.ts";
import { loadAuth } from "./auth.ts";
import { ext } from "./browser.ts";
import { APP_LOCK, CHANNEL, type ChannelMessage } from "./channel.ts";
import { allowEmbeds } from "./embeds.ts";
import { extensionHost } from "./host.ts";

const root = document.getElementById("app") ?? document.body;

let holder = false;

function serve(session: Session, refresh: () => void): () => void {
  const channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = async (e: MessageEvent<ChannelMessage>) => {
    const m = e.data;
    if (m.type !== "action" || !holder) return;
    try {
      const result = await runAction(session, m.action);
      refresh();
      channel.postMessage({ type: "action-reply", reqId: m.reqId, ok: true, result });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      channel.postMessage({ type: "action-reply", reqId: m.reqId, ok: false, error });
    }
  };
  return () => channel.close();
}

async function start() {
  if (!ext) {
    root.textContent = "This page only works inside the Konomi.moe extension.";
    return;
  }
  void navigator.locks?.request(APP_LOCK, () => {
    holder = true;
    return new Promise<void>(() => {});
  });
  void allowEmbeds().catch(() => {});
  const host = extensionHost(await loadAuth(), { page: true });
  host.serve = serve;
  mount(host, root);
}

void start();
