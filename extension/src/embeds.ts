/**
 * Lets the app tab embed trailer players. YouTube refuses embeds that arrive without a Referer
 * ("Error 153: video player configuration error"), and extension pages send none, being
 * chrome-extension:// or moz-extension:// rather than a web address. So a session rule sets one,
 * naming this project, on trailer frames that the extension's own pages open, and nothing else.
 */

import { api } from "./browser.ts";

/** What the player sees as the embedding page. */
export const EMBED_REFERER = "https://github.com/AbnormallyGrim/konomi-moe";
const RULE_ID = 1;

export function embedRule(extensionHost: string) {
  return {
    id: RULE_ID,
    priority: 1,
    action: {
      type: "modifyHeaders",
      requestHeaders: [{ header: "referer", operation: "set", value: EMBED_REFERER }],
    },
    condition: {
      requestDomains: ["www.youtube-nocookie.com"],
      resourceTypes: ["sub_frame"],
      initiatorDomains: [extensionHost],
    },
  };
}

/** Session rules don't survive a browser restart, so this runs whenever the extension starts. */
export async function allowEmbeds(): Promise<void> {
  const dnr = api().declarativeNetRequest;
  if (!dnr) return;
  // The extension's own address host: its ID in Chromium, a per-install UUID in Firefox.
  const host = new URL(api().runtime.getURL("")).hostname;
  await dnr.updateSessionRules({ removeRuleIds: [RULE_ID], addRules: [embedRule(host)] });
}
