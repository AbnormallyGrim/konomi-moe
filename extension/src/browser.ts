export interface Tab {
  id?: number;
  url?: string;
}

export interface MessageSender {
  tab?: Tab;
  url?: string;
}

interface Event<T extends (...args: never[]) => unknown> {
  addListener(callback: T): void;
  removeListener(callback: T): void;
}

export interface ContentScript {
  id: string;
  matches: string[];
  js: string[];
  runAt?: "document_start" | "document_end" | "document_idle";
  persistAcrossSessions?: boolean;
}

export interface StorageChange {
  oldValue?: unknown;
  newValue?: unknown;
}

export interface ExtensionApi {
  runtime: {
    id: string;
    getURL(path: string): string;
    getManifest(): { version: string };
    sendMessage(message: unknown): Promise<unknown>;
    openOptionsPage(): Promise<void>;
    onMessage: Event<
      (
        message: unknown,
        sender: MessageSender,
        sendResponse: (response: unknown) => void,
      ) => boolean | undefined
    >;
    onInstalled: Event<(details: { reason: string }) => void>;
    onStartup: Event<() => void>;
  };
  storage: {
    local: {
      get(keys: string | string[] | null): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
    };
    onChanged: Event<(changes: Record<string, StorageChange>, area: string) => void>;
  };
  tabs: {
    query(query: { active?: boolean; currentWindow?: boolean }): Promise<Tab[]>;
    create(properties: { url: string; active?: boolean }): Promise<Tab>;
    getCurrent(): Promise<Tab | undefined>;
    update(tabId: number, properties: { active?: boolean }): Promise<Tab>;
    remove(tabId: number): Promise<void>;
    onUpdated: Event<(tabId: number, changeInfo: { url?: string }, tab: Tab) => void>;
    onRemoved: Event<(tabId: number) => void>;
  };
  permissions: {
    request(permissions: { origins: string[] }): Promise<boolean>;
    contains(permissions: { origins: string[] }): Promise<boolean>;
    onRemoved: Event<(permissions: { origins?: string[] }) => void>;
  };
  scripting?: {
    registerContentScripts(scripts: ContentScript[]): Promise<void>;
    unregisterContentScripts(filter?: { ids: string[] }): Promise<void>;
    getRegisteredContentScripts(filter?: { ids: string[] }): Promise<{ id: string }[]>;
  };
  alarms?: {
    create(name: string, info: { periodInMinutes: number; delayInMinutes?: number }): unknown;
    clear(name: string): Promise<boolean>;
    get(name: string): Promise<unknown>;
    onAlarm: Event<(alarm: { name: string }) => void>;
  };
  declarativeNetRequest?: {
    updateSessionRules(options: { removeRuleIds?: number[]; addRules?: unknown[] }): Promise<void>;
  };
  action?: {
    setBadgeText(details: { text: string }): Promise<void>;
    setBadgeBackgroundColor(details: { color: string }): Promise<void>;
  };
}

const g = globalThis as { browser?: ExtensionApi; chrome?: ExtensionApi };

export const ext: ExtensionApi | undefined = g.browser?.runtime?.id
  ? g.browser
  : g.chrome?.runtime?.id
    ? g.chrome
    : undefined;

export function api(): ExtensionApi {
  if (!ext) throw new Error("This page only works inside the Konomi.moe extension.");
  return ext;
}
