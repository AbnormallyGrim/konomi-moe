/**
 * The extension's manifest for each browser family. Chromium browsers (Chrome, Edge, Brave,
 * Opera, Vivaldi) run the background as a service worker; Firefox runs it as an event page and
 * needs an add-on ID. Everything else is shared.
 */

export type Target = "chrome" | "firefox";

const ICONS = { 16: "icon-16.png", 32: "icon-32.png", 48: "icon-48.png", 128: "icon-128.png" };

/** Firefox's add-on ID: keys the user's data there, so it must never change. */
export const GECKO_ID = "konomi-moe@abnormallygrim";

export function manifest(target: Target, version: string, options: { key?: string } = {}) {
  const common = {
    manifest_version: 3,
    name: "Konomi.moe",
    version,
    description:
      "Anime and manga recommendations that learn your taste from your own AniList list.",
    homepage_url: "https://github.com/AbnormallyGrim/konomi-moe",
    icons: ICONS,
    action: { default_popup: "popup.html", default_title: "Konomi.moe", default_icon: ICONS },
    // The full app, in its own tab; openOptionsPage() reuses the tab if it's already open.
    options_ui: { page: "app.html", open_in_tab: true },
    permissions: [
      "storage",
      "unlimitedStorage", // the store is a few MB of titles
      "alarms", // the daily sync
      "scripting", // registers the AniList badge only once it's switched on
      "activeTab", // the popup reads the current tab's address when opened
      "declarativeNetRequestWithHostAccess", // a Referer for embedded trailers (embeds.ts)
    ],
    // Only so trailer frames can be given a Referer; no page of the site is read.
    host_permissions: ["https://www.youtube-nocookie.com/*"],
    // Asked for at sign-in (to catch AniList's answer) or when the badge is switched on, never
    // at install.
    optional_host_permissions: ["https://anilist.co/*"],
    // The badge's icon, shown inside AniList's pages.
    web_accessible_resources: [{ resources: ["icon-32.png"], matches: ["https://anilist.co/*"] }],
    content_security_policy: {
      extension_pages:
        "script-src 'self'; object-src 'self'; frame-src https://www.youtube-nocookie.com; img-src 'self' https: data:",
    },
  };
  if (target === "chrome")
    return {
      ...common,
      background: { service_worker: "background.js" },
      minimum_chrome_version: "116",
      // A fixed key keeps an unpacked copy's ID (and so its AniList redirect URL) stable.
      ...(options.key ? { key: options.key } : {}),
    };
  return {
    ...common,
    background: { scripts: ["background.js"] },
    browser_specific_settings: {
      gecko: {
        id: GECKO_ID,
        strict_min_version: "128.0",
        data_collection_permissions: { required: ["none"] },
      },
    },
  };
}
