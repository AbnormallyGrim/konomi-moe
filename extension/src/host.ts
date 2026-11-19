import { AniListClient, fetchTransport, type Media, queries, type Transport } from "@konomi/engine";
import type { Host, HostUser } from "@konomi/ui/host";
import {
  type Auth,
  finishSignIn,
  type PendingSignIn,
  parseToken,
  signOut,
  startSignIn,
  withAvatar,
} from "./auth.ts";
import { api } from "./browser.ts";
import { CHANNEL, type ChannelMessage } from "./channel.ts";
import { get, put, STORE_KEY } from "./kv.ts";

export interface ExtensionHost extends Host {
  auth: Auth | null;
}

export function openTab(url: string): void {
  if (typeof window !== "undefined" && typeof window.open === "function")
    window.open(url, "_blank", "noopener");
  else void api().tabs.create({ url });
}

function announceSave(): void {
  const channel = new BroadcastChannel(CHANNEL);
  channel.postMessage({ type: "saved" } satisfies ChannelMessage);
  channel.close();
}

export function extensionHost(initial: Auth | null, options: { page: boolean }): ExtensionHost {
  let mutations: AniListClient | null = null;
  let pending: PendingSignIn | null = null;
  const token = () => (host.auth?.kind === "anilist" ? host.auth.token : undefined);
  const transport: Transport = (body) => {
    const t = token();
    return fetchTransport(t ? { token: t } : {})(body);
  };

  const addToPlanning = async (media: Media) => {
    const t = token();
    if (!t) throw new Error("sign in with AniList to change your list");
    mutations ??= new AniListClient(fetchTransport({ token: t }));
    await mutations.query(queries.SAVE_ENTRY, { mediaId: media.id, status: "PLANNING" });
  };

  const host: ExtensionHost = {
    kind: "extension",
    auth: initial,
    transport,
    embedsTrailers: options.page,
    async user(): Promise<HostUser | null> {
      if (!host.auth) return null;
      if (options.page) host.auth = await withAvatar(host.auth);
      return { name: host.auth.name, avatarUrl: host.auth.avatarUrl ?? null };
    },
    async signOut() {
      await signOut();
      host.auth = null;
      delete host.addToPlanning;
    },
    async loadStore() {
      return get<string>(STORE_KEY);
    },
    async saveStore(json: string) {
      await put(STORE_KEY, json);
      announceSave();
    },
    openTitle(media: Media) {
      openTab(media.siteUrl ?? `https://anilist.co/${media.type.toLowerCase()}/${media.id}`);
    },
  };
  if (initial) host.addToPlanning = addToPlanning;
  const signedIn = (auth: Auth): HostUser => {
    host.auth = auth;
    mutations = null;
    host.addToPlanning = addToPlanning;
    return { name: auth.name, avatarUrl: auth.avatarUrl ?? null };
  };
  if (options.page) {
    host.signIn = async () => {
      pending?.cancel();
      pending = await startSignIn();
      const { token, expiresAt } = await pending.token;
      return signedIn(await finishSignIn(token, expiresAt));
    };
    host.signInWithCode = async (code: string) => {
      pending?.cancel();
      const { token, expiresAt } = parseToken(code);
      return signedIn(await finishSignIn(token, expiresAt));
    };
  }
  return host;
}
