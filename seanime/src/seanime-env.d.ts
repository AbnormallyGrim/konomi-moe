/**
 * The few Seanime plugin globals this plugin uses (Seanime's full typings are in its repo at
 * internal/extension_repo/goja_plugin_types/plugin.d.ts).
 */

declare namespace $ui {
  function register(fn: (ctx: SeanimeContext) => void): void;
}

declare namespace $anilist {
  function getRawAnimeCollection(bypassCache: boolean): unknown;
  function getRawMangaCollection(bypassCache: boolean): unknown;
  function addMediaToCollection(mediaIds: number[]): void;
  function refreshAnimeCollection(): void;
  function refreshMangaCollection(): void;
}

declare namespace $storage {
  function get<T = unknown>(key: string): T | undefined;
  function set(key: string, value: unknown): void;
}

interface SeanimeWebview {
  channel: {
    on(event: string, cb: (payload: unknown) => void): void;
    send(event: string, payload: unknown): void;
  };
  setContent(fn: () => string): void;
}

/** A native Seanime dialog; components are built from its own functions. */
interface SeanimeModal {
  render(fn: () => unknown[]): void;
  open(): void;
  close(): void;
  update(): void;
  stack(items: unknown[], props?: { gap?: number; style?: Record<string, string> }): unknown;
  flex(items: unknown[], props?: { gap?: number; style?: Record<string, string> }): unknown;
  text(text: string, props?: { style?: Record<string, string>; className?: string }): unknown;
  img(
    src: string,
    props?: { width?: string; height?: string; alt?: string; style?: Record<string, string> },
  ): unknown;
  anchor(
    text: string,
    props: { href: string; target?: string; style?: Record<string, string>; className?: string },
  ): unknown;
}

interface SeanimeContext {
  /** Seanime 3.10.4 and later (the plugin's minimum). */
  newModal(options: { title: string; description?: string }): SeanimeModal;
  newWebview(options: {
    slot: "screen";
    fullWidth?: boolean;
    style?: string;
    width?: string;
    height?: string;
    sidebar?: { label: string; icon: string };
  }): SeanimeWebview;
  screen: { navigateTo(path: string, searchParams?: Record<string, string>): void };
  /** Allowed domains only; graphql.anilist.co is on Seanime's built-in list. */
  fetch: import("./background.ts").GojaFetch;
  /** Returns a function that cancels it; `delay` must be a whole number of milliseconds. */
  setTimeout(fn: () => void, delay: number): () => void;
}
