/**
 * The plugin side, run by Seanime's goja runtime (bundled to ES2018, no Node or DOM). It adds
 * the Konomi.moe side-menu page and answers the page's requests.
 */

import type { MediaType } from "@konomi/engine";
import type { Host } from "@konomi/ui";
import { BackgroundSetup, type GojaFetch, gojaTransport, prepareRuntime } from "./background.ts";
import {
  type Collection,
  describe,
  type Method,
  type Methods,
  REPLY,
  REQUEST,
  type Reply,
  type Request,
  rawEntryCount,
  SEANIME_USER,
  type SetupStatus,
  toHostList,
} from "./protocol.ts";

/** The page's HTML, inlined at build time (see scripts/build.ts). */
declare const __PAGE_HTML__: string;

export const STORE_KEY = "store";
/** AniList's official icon, loaded by Seanime's window (which can reach the web). */
const ANILIST_ICON_URL = "https://anilist.co/img/icons/icon.svg";
/** The side-menu label, shown when hovering the icon; also prefixes the plugin's logs. */
export const LABEL = "Konomi.moe";
/**
 * The side-menu icon: the Konomi.moe logo traced to one colour (imagetracer, black & white).
 * Seanime injects this SVG string as-is (no PNG), and currentColor follows the menu's colours
 * like its own icons. Seanime's size class lands on a display:contents wrapper, so the SVG
 * sets its own 20px (the menu's size-5).
 */
export const ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="20" height="20" style="flex-shrink:0"><path fill="currentColor" stroke="currentColor" stroke-width="1" d="M 391.5 36 Q 415.8 33.2 423 47.5 L 432 72.5 L 431 74.5 L 432 77.5 L 432 79.5 L 431 109.5 L 436.5 121 L 441.5 123 L 444.5 122 L 459.5 113 L 461.5 113 L 476.5 111 L 485.5 113 L 487.5 113 L 504 123 Q 517.4 142.8 513 181.5 L 513 183.5 L 519.5 196 Q 532.3 202.3 554.5 199 L 556.5 199 L 577.5 197 L 579.5 197 Q 614.3 191.2 628 206.5 L 636 228.5 L 635 230.5 L 635 232.5 Q 633.6 263.2 613 274 L 611 275.5 L 499.5 404 L 498 405.5 L 492 419.5 L 547.5 478 L 550.5 480 L 552 483 L 555 484.5 L 556.5 487 L 558 488.5 L 621 550.5 L 623 553.5 L 637 566 L 638.5 568 Q 661.2 581.3 668 610.5 L 667 620.5 L 668 626.5 L 657.5 645 Q 642.7 659.7 611.5 658 L 609.5 658 L 538.5 657 L 532 661.5 L 529 672.5 L 529 674.5 L 530 682.5 L 529 690.5 L 530 714.5 Q 528 738.7 516 752 L 512.5 754 Q 502.7 765.7 480.5 765 Q 451.8 760.8 438 741.5 L 436.5 740 L 417.5 720 L 405 708.5 L 403.5 707 L 402 704 L 398.5 702 L 388 692.5 L 365.5 669 L 363 667.5 L 353.5 657 L 350.5 655 L 337 642.5 L 297.5 602 L 289 595.5 L 284.5 589 L 283 587.5 L 280 586 L 277.5 582 L 273 578.5 L 271.5 577 L 259.5 564 L 250 568.5 L 248 573 L 246 574.5 L 245 577 L 243 578.5 L 241 582 L 239 583.5 L 224.5 603 L 221 606.5 L 208.5 621 L 207 622.5 L 204 627 L 202 628.5 L 186.5 648 L 171.5 653 L 168.5 652 L 161.5 653 L 151.5 651 L 149.5 651 L 145 650 L 143.5 648 L 139 644.5 L 137 641.5 Q 129.3 635.7 129 622.5 L 130 620.5 L 130 618.5 L 129 554.5 L 130 529.5 L 128 524.5 L 128 522.5 L 129 516.5 L 128.5 515 L 130 514.5 L 130 473.5 L 128 358.5 Q 126.4 327.5 134 308 L 136 305.5 L 146 275 L 150 271.5 L 152 268 L 154 266.5 L 155 264 L 157 262.5 L 189 227 L 195 221.5 L 225 192.5 L 229 187.5 L 232 186 L 241.5 175 L 262 155.5 L 293.5 123 L 295 121.5 L 307 110.5 L 334.5 82 L 341 76.5 L 344.5 72 L 351 68 L 365 50 L 391.5 36 Z M 389 87 L 382 91 L 365 111 L 361 116 L 343 133 L 339 135 L 320 162 L 304 177 L 301 179 L 273 211 L 272 212 L 269 216 L 266 218 L 262 223 L 255 229 L 254 230 L 236 251 L 215 270 Q 177 296 177 359 L 176 352 L 175 352 L 176 371 L 175 379 L 175 381 Q 172 396 177 401 L 185 402 L 196 388 L 198 386 L 209 373 L 211 371 L 217 364 L 220 362 L 264 314 L 266 312 L 297 275 L 307 268 L 322 252 L 324 250 L 338 233 L 345 227 L 371 197 L 381 190 Q 392 183 396 169 L 397 166 L 396 154 L 398 101 L 398 99 L 395 89 L 389 87 Z M 468 151 L 464 153 L 460 155 L 441 178 L 439 180 L 437 181 Q 418 211 392 234 L 390 235 L 371 261 L 369 262 L 329 312 L 323 316 L 307 335 L 305 336 L 250 399 L 248 400 L 218 435 L 217 436 L 207 447 L 205 450 L 196 457 L 186 472 L 182 475 L 179 481 L 177 482 L 175 495 L 176 502 L 175 506 L 176 510 L 175 512 L 177 511 L 175 514 L 177 515 L 176 515 L 176 517 L 175 528 L 175 530 L 176 533 L 175 537 L 176 540 L 176 542 L 176 574 L 180 576 L 183 577 L 186 576 L 196 559 L 204 552 L 214 539 L 218 536 L 221 532 L 223 530 L 234 516 L 236 514 L 244 504 L 246 502 L 255 489 L 257 487 L 279 460 L 286 454 L 293 443 L 295 441 L 296 439 L 298 437 L 321 409 L 325 405 L 350 372 L 362 361 L 373 348 L 375 346 L 390 325 L 448 260 L 460 241 L 463 240 L 465 238 Q 476 230 478 213 L 478 211 L 479 208 L 478 206 L 479 171 L 478 157 L 468 151 Z M 519 233 L 512 237 L 457 311 L 456 312 L 417 360 L 415 361 L 359 437 L 364 448 L 379 459 L 396 481 L 416 498 L 426 509 L 429 511 L 441 526 L 461 544 L 463 548 L 470 554 L 472 555 L 489 574 L 498 581 L 524 611 L 537 617 L 543 616 L 607 617 L 609 617 L 614 616 L 618 611 L 600 589 L 577 567 L 573 562 L 571 561 L 560 551 L 553 543 L 551 540 L 527 516 L 472 460 L 470 458 L 458 448 Q 443 441 443 419 Q 448 385 472 371 L 473 370 L 482 362 L 511 327 L 513 323 L 521 317 L 524 314 L 529 310 Q 539 290 557 276 L 558 274 L 576 258 L 578 256 L 582 247 L 583 244 L 582 240 Q 574 230 555 233 L 551 234 L 548 233 L 541 234 L 519 233 Z M 327 478 L 325 479 L 293 517 L 289 520 L 288 523 Q 287 531 293 533 L 297 536 L 302 543 L 318 555 L 339 579 L 371 608 L 373 609 L 375 612 L 378 614 L 394 633 L 395 635 L 415 652 L 437 676 L 438 678 L 443 681 L 446 686 L 470 708 L 471 710 L 481 716 L 484 715 L 487 710 L 486 695 L 487 693 L 486 691 L 487 649 L 487 647 Q 486 620 467 612 L 463 609 L 461 607 L 457 603 L 454 600 L 437 583 L 393 541 L 389 536 L 346 496 L 345 493 L 341 491 L 337 485 L 327 478 Z "></path><path fill="currentColor" stroke="currentColor" stroke-width="1" d="M 607.5 44 L 612 45.5 Q 615.3 64.2 627.5 74 L 662 95.5 L 659.5 102 Q 640.5 106 630 118.5 L 628.5 120 L 626 124 L 624 125.5 L 613 150 L 608.5 152 L 602 147.5 Q 596.5 125.5 581.5 113 L 557 97.5 L 558.5 93 L 589 73.5 L 605 45 L 607.5 44 Z "></path></svg>';

/** What the handlers need from Seanime, so they can be tested without it. */
export interface Api {
  collection(type: MediaType): Collection | null | undefined;
  addToPlanning(id: number, type: MediaType): void;
  storageGet(key: string): unknown;
  storageSet(key: string, value: unknown): void;
  navigate(path: string, params: Record<string, string>): void;
  /** Shows a link in Seanime's own dialog, where links can open the browser. */
  showLink(url: string, title: string): void;
  /** Shows a trailer link in its own dialog, the same way. */
  showTrailer(url: string, title: string): void;
}

/** Only these links are shown: the page asks for a title's AniList page, nothing else. */
const SITE_LINK = /^https:\/\/anilist\.co\//;
/** Trailer links, as the engine builds them from AniList (see parseTrailer). */
const TRAILER_LINK =
  /^https:\/\/www\.(youtube\.com\/watch\?v=|dailymotion\.com\/video\/)[\w-]{1,32}$/;

type Handlers = { [M in Method]: (...args: Methods[M]["args"]) => Methods[M]["result"] };

export function handlers(
  api: Api,
  setupStatus: () => SetupStatus = () => ({ running: false }),
): Handlers {
  return {
    list: (type) => {
      const raw = api.collection(type);
      const list = toHostList(raw);
      // Entries that all fail to convert mean Seanime's data has a shape we don't expect.
      if (!list.entries.length && rawEntryCount(raw) > 0) {
        const first = raw?.MediaListCollection?.lists?.find((l) => l.entries?.length)?.entries?.[0];
        throw new Error(
          `couldn't read your ${type.toLowerCase()} list from Seanime (status: ${describe(first?.status)}, media id: ${describe(first?.media?.id)})`,
        );
      }
      return list;
    },
    loadStore: () => {
      const saved = api.storageGet(STORE_KEY);
      return typeof saved === "string" ? saved : null;
    },
    saveStore: (json) => {
      api.storageSet(STORE_KEY, json);
      return null;
    },
    addToPlanning: (id, type) => {
      api.addToPlanning(id, type);
      return null;
    },
    openTitle: (id, type) => {
      api.navigate(type === "MANGA" ? "/manga/entry" : "/entry", { id: String(id) });
      return null;
    },
    openOnSite: (url, title) => {
      if (!SITE_LINK.test(url)) throw new Error("only AniList links can be opened");
      api.showLink(url, title);
      return null;
    },
    openTrailer: (url, title) => {
      if (!TRAILER_LINK.test(url)) throw new Error("only YouTube and Dailymotion trailers open");
      api.showTrailer(url, title);
      return null;
    },
    setupStatus,
  };
}

/** The page's `Host`, answered by the plugin itself, for the background setup. */
export function pluginHost(h: Handlers, transport: Host["transport"]): Host {
  return {
    kind: "seanime",
    transport,
    user: async () => ({ name: SEANIME_USER }),
    list: async (type) => h.list(type),
    loadStore: async () => h.loadStore(),
    saveStore: async (json) => {
      h.saveStore(json);
    },
    openTitle: () => {},
  };
}

/** The background setup over the handlers; `hasList` is true when either list has entries. */
export function backgroundSetup(
  h: Handlers,
  api: Pick<Api, "collection">,
  transport: Host["transport"],
  later: (fn: () => void, ms: number) => void,
  log: (message: string) => void = () => {},
): BackgroundSetup {
  return new BackgroundSetup({
    hasStore: () => h.loadStore() !== null,
    hasList: () => (["ANIME", "MANGA"] as const).some((t) => rawEntryCount(api.collection(t)) > 0),
    host: pluginHost(h, transport),
    later,
    log,
  });
}

/** Answer one request; errors become error replies, so the page never waits forever. */
export function answer(h: Handlers, payload: unknown): Reply | null {
  const req = payload as Request;
  if (!req || typeof req.id !== "number") return null;
  try {
    const fn = h[req.method] as ((...args: unknown[]) => unknown) | undefined;
    if (!fn) throw new Error(`unknown request: ${String(req.method)}`);
    return { id: req.id, ok: true, result: fn(...(req.args ?? [])) };
  } catch (e) {
    return { id: req.id, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Seanime's real API. */
function seanimeApi(ctx: SeanimeContext): Api {
  // The page is a sandboxed frame without popups, so it can't open links. A native dialog
  // can: its links open from Seanime's window (the desktop app sends them to the browser).
  // The link must not have a click handler: Seanime cancels navigation when one is set.
  // Plugin dialogs need Seanime 3.10.4, the declared minimum (MIN_SEANIME in scripts/build.ts).
  const link = { url: "", title: "" };
  const modal = ctx.newModal({ title: "Open on AniList" });
  modal.render(() => [
    modal.stack(
      [
        modal.text(`${link.title} opens in your browser.`),
        modal.flex(
          [
            modal.img(ANILIST_ICON_URL, { width: "20", height: "20", alt: "AniList" }),
            modal.anchor("Open on AniList", { href: link.url, target: "_blank" }),
          ],
          { gap: 2 },
        ),
      ],
      { gap: 3 },
    ),
  ]);
  const trailer = { url: "", title: "" };
  const trailerModal = ctx.newModal({ title: "Watch the trailer" });
  trailerModal.render(() => [
    trailerModal.stack(
      [
        trailerModal.text(`${trailer.title}'s trailer opens in your browser.`),
        trailerModal.anchor(
          trailer.url.includes("dailymotion") ? "Watch on Dailymotion" : "Watch on YouTube",
          { href: trailer.url, target: "_blank" },
        ),
      ],
      { gap: 3 },
    ),
  ]);
  return {
    collection: (type) =>
      (type === "MANGA"
        ? $anilist.getRawMangaCollection(false)
        : $anilist.getRawAnimeCollection(false)) as Collection,
    addToPlanning: (id, type) => {
      $anilist.addMediaToCollection([id]);
      if (type === "MANGA") $anilist.refreshMangaCollection();
      else $anilist.refreshAnimeCollection();
    },
    storageGet: (key) => $storage.get(key),
    storageSet: (key, value) => $storage.set(key, value),
    navigate: (path, params) => ctx.screen.navigateTo(path, params),
    showLink: (url, title) => {
      link.url = url;
      link.title = title;
      modal.open();
    },
    showTrailer: (url, title) => {
      trailer.url = url;
      trailer.title = title;
      trailerModal.open();
    },
  };
}

/**
 * The body of the `$ui.register` callback. Seanime turns that callback into source text and
 * runs it in a separate runtime, so the build places this whole bundle inside the callback
 * (see scripts/build.ts); nothing outside it is visible there.
 */
export function start(ctx: SeanimeContext): void {
  const webview = ctx.newWebview({
    slot: "screen",
    fullWidth: true,
    height: "calc(100vh - 2rem)",
    style: "border:0;border-radius:12px",
    sidebar: { label: LABEL, icon: ICON },
  });
  webview.setContent(() => __PAGE_HTML__);
  const api = seanimeApi(ctx);
  let setup: BackgroundSetup | null = null;
  const h = handlers(api, () => setup?.status() ?? { running: false });
  webview.channel.on(REQUEST, (payload) => {
    const reply = answer(h, payload);
    if (reply) webview.channel.send(REPLY, reply);
  });
  // The first sync runs now, in the background, rather than when the page first opens. Only
  // on Seanime versions with the APIs it needs; otherwise the page syncs when opened.
  try {
    if (typeof ctx.fetch === "function" && typeof ctx.setTimeout === "function") {
      prepareRuntime(ctx.setTimeout);
      setup = backgroundSetup(
        h,
        api,
        gojaTransport(ctx.fetch),
        (fn, ms) => ctx.setTimeout(fn, ms),
        (m) => console.log(`[${LABEL}] ${m}`),
      );
      setup.schedule();
    }
  } catch (e) {
    setup = null;
    console.log(
      `[${LABEL}] background setup unavailable: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}
