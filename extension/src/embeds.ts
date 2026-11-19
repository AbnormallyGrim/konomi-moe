import { api } from "./browser.ts";

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

export async function allowEmbeds(): Promise<void> {
  const dnr = api().declarativeNetRequest;
  if (!dnr) return;
  const host = new URL(api().runtime.getURL("")).hostname;
  await dnr.updateSessionRules({ removeRuleIds: [RULE_ID], addRules: [embedRule(host)] });
}
