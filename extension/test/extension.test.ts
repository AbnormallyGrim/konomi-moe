import { describe, expect, it } from "vitest";
import { titleFromPath } from "../src/anilist-page.ts";
import { authorizeUrl, PIN_PAGE, parseToken, usable } from "../src/auth.ts";
import { embedRule } from "../src/embeds.ts";
import { GECKO_ID, manifest } from "../src/manifest.ts";

describe("AniList title pages", () => {
  it("reads the type and ID from the address", () => {
    expect(titleFromPath("/anime/20954/Koe-no-Katachi/")).toEqual({ id: 20954, type: "ANIME" });
    expect(titleFromPath("/manga/30002")).toEqual({ id: 30002, type: "MANGA" });
    expect(titleFromPath("/anime/20954/characters")).toEqual({ id: 20954, type: "ANIME" });
    expect(titleFromPath("/user/someone/animelist")).toBeNull();
    expect(titleFromPath("/anime/abc")).toBeNull();
  });
});

describe("AniList sign-in", () => {
  const JWT = "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiIxIn0.c2lnbmF0dXJl";

  it("asks for an implicit-grant token", () => {
    expect(authorizeUrl("123")).toBe(
      "https://anilist.co/api/v2/oauth/authorize?client_id=123&response_type=token",
    );
  });

  it("takes the token and expiry from AniList's code page address", () => {
    const r = parseToken(`${PIN_PAGE}#access_token=${JWT}&token_type=Bearer&expires_in=100`, 1000);
    expect(r).toEqual({ token: JWT, expiresAt: 101_000 });
  });

  it("takes a pasted code, assuming AniList's one-year lifetime", () => {
    expect(parseToken(`  ${JWT}\n`, 0)).toEqual({ token: JWT, expiresAt: 365 * 86400_000 });
  });

  it("explains a refusal or something that isn't a code", () => {
    expect(() => parseToken(`${PIN_PAGE}?error=access_denied`)).toThrow("cancelled");
    expect(() => parseToken(`${PIN_PAGE}#`)).toThrow("code AniList shows");
    expect(() => parseToken("my username")).toThrow("code AniList shows");
  });

  it("treats a token about to expire, or an old username-only sign-in, as signed out", () => {
    const auth = {
      kind: "anilist",
      token: "t",
      expiresAt: 10 * 86400_000,
      name: "a",
      userId: 1,
    } as const;
    expect(usable(auth, 0)).toBe(auth);
    expect(usable(auth, 9.5 * 86400_000)).toBeNull();
    expect(usable({ kind: "public", name: "a" } as never, 0)).toBeNull();
  });
});

describe("manifest", () => {
  it("asks for AniList's pages only when the badge is switched on", () => {
    for (const target of ["chrome", "firefox"] as const) {
      const m = manifest(target, "1.2.3");
      expect(m.optional_host_permissions).toEqual(["https://anilist.co/*"]);
      expect(m.host_permissions).toEqual(["https://www.youtube-nocookie.com/*"]);
      expect(m.permissions).not.toContain("tabs");
      expect(m.permissions).not.toContain("identity");
    }
  });

  it("uses a service worker in Chromium and an event page with an add-on ID in Firefox", () => {
    const chrome = manifest("chrome", "1.2.3", { key: "K" });
    expect(chrome.background).toEqual({ service_worker: "background.js" });
    expect("key" in chrome && chrome.key).toBe("K");
    const firefox = manifest("firefox", "1.2.3");
    expect(firefox.background).toEqual({ scripts: ["background.js"] });
    expect(
      "browser_specific_settings" in firefox && firefox.browser_specific_settings.gecko.id,
    ).toBe(GECKO_ID);
  });
});

describe("trailer embeds", () => {
  it("sets a Referer only on YouTube frames the extension's own pages open", () => {
    const rule = embedRule("blkfmdjmlkilgkcaadhjicokkcpffbon");
    expect(rule.condition).toEqual({
      requestDomains: ["www.youtube-nocookie.com"],
      resourceTypes: ["sub_frame"],
      initiatorDomains: ["blkfmdjmlkilgkcaadhjicokkcpffbon"],
    });
  });
});
