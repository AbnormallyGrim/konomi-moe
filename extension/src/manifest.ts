export type Target = "chrome" | "firefox";

const ICONS = { 16: "icon-16.png", 32: "icon-32.png", 48: "icon-48.png", 128: "icon-128.png" };

export const GECKO_ID = "konomi-moe@abnormallygrim";

export function manifest(target: Target, version: string, options: { key?: string } = {}) {
  const common = {
    manifest_version: 3,
    name: "Konomi.moe",
    version,
    description:
      "Anime and manga recommendations that learn your preferences from your own AniList list.",
    homepage_url: "https://github.com/AbnormallyGrim/konomi-moe",
    icons: ICONS,
    action: { default_popup: "popup.html", default_title: "Konomi.moe", default_icon: ICONS },
    options_ui: { page: "app.html", open_in_tab: true },
    permissions: [
      "storage",
      "unlimitedStorage",
      "alarms",
      "scripting",
      "activeTab",
      "declarativeNetRequestWithHostAccess",
    ],
    host_permissions: ["https://www.youtube-nocookie.com/*"],
    optional_host_permissions: ["https://anilist.co/*"],
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
