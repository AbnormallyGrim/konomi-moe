/**
 * The UI's link to the engine: one user's store, syncing, recommendation runs, exclusions and
 * settings. No rendering here, so it's tested without a DOM.
 */

import {
  AniListClient,
  type CrowdTable,
  type DetailsNode,
  emptyExclusions,
  examples,
  exclusionLabels,
  type Filters,
  features,
  HIDDEN_REASONS,
  type ListEntry,
  type Media,
  type MediaType,
  MemoryStore,
  type MemoryStoreData,
  makeFilters,
  makeRunOptions,
  NoSyncedList,
  type Progress,
  parseCrowd,
  parseDetails,
  queries,
  type Recommendation,
  type RunResult,
  requiredLabels,
  run,
  type SavedExclusions,
  syncEntries,
  syncList,
  Themes,
  type TitleDetails,
  tagCategories,
} from "@konomi/engine";
import type { Host } from "./host.ts";

export const TYPES: MediaType[] = ["ANIME", "MANGA"];

export type TitleLanguage = "english" | "romaji" | "native";

/** Preferences kept in the store, so they move with an export. */
export interface Settings {
  /** Picks shown per page; "Show more" adds another page. */
  limit: number;
  includeAdult: boolean;
  showRatings: boolean;
  titleLanguage: TitleLanguage;
  /** Whether the Advanced filters section is open (it starts closed). */
  advancedOpen: boolean;
  /** Per type, since formats differ between anime and manga. */
  filters: Record<MediaType, Filters>;
  /** Whether the first-run tour has been finished or skipped. */
  tourSeen: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  limit: 20,
  includeAdult: false,
  showRatings: true,
  titleLanguage: "english",
  advancedOpen: false,
  filters: { ANIME: makeFilters(), MANGA: makeFilters() },
  tourSeen: false,
};

/**
 * Picks ranked per run. Ranking every candidate is cheap, so a run keeps this many: pages and
 * exclusions are served from them with no new AniList searches.
 */
export const POOL = 200;

/** A title in the chosen language, falling back to whatever AniList has. */
export function displayTitle(m: Media, language: TitleLanguage): string {
  const t = m.titles;
  if (!t) return m.title;
  const order =
    language === "native"
      ? [t.native, t.romaji, t.english]
      : language === "romaji"
        ? [t.romaji, t.english]
        : [t.english, t.romaji];
  return order.find((x) => x) ?? m.title;
}

/** The last run for a type, kept so the page opens with picks before any network call. */
export interface Picks {
  at: number;
  recommendations: Recommendation[];
  warnings: string[];
}

/** What the preferences tab shows. */
export interface Preferences {
  onList: number;
  scored: number;
  mean: number | null;
  learnedFrom: number;
  likes: [string, number][];
  dislikes: [string, number][];
  /** The tags pulling hardest towards a title, strongest first (for tag suggestions). */
  likedTags: string[];
}

const SETTINGS_KEY = "ui-settings";
const SYNCED_KEY = "ui-synced-at";
const SAVE_DELAY_MS = 800;

export class Session {
  readonly client: AniListClient;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private themes: Themes | null = null;
  private details = new Map<number, TitleDetails>();
  private preferences = new Map<MediaType, Preferences>();
  private crowd: Promise<{ table: CrowdTable | null; error?: string }> | null = null;

  private constructor(
    readonly host: Host,
    readonly store: MemoryStore,
    readonly user: string,
    client?: AniListClient,
  ) {
    this.client = client ?? new AniListClient(host.transport);
  }

  /** Open the saved store for `user` (or start an empty one). */
  static async open(host: Host, user: string, client?: AniListClient): Promise<Session> {
    const saved = await host.loadStore();
    const store = saved
      ? MemoryStore.fromJSON(JSON.parse(saved) as MemoryStoreData)
      : new MemoryStore();
    return new Session(host, store, user, client);
  }

  /** When both lists were last synced; adding to planning doesn't count as a sync. */
  async lastSynced(): Promise<number | null> {
    const at = await this.store.getMeta(SYNCED_KEY);
    return at ? Number(at) : null;
  }

  /** Sync both lists; from the host when it has them, else from AniList by username. */
  async sync(progress: Progress = () => {}): Promise<void> {
    for (const type of TYPES) {
      progress(`Reading your ${type.toLowerCase()} list`);
      if (this.host.list) {
        const list = await this.host.list(type);
        const custom = new Map(Object.entries(list.customLists).map(([k, v]) => [k, new Set(v)]));
        await syncEntries(this.client, this.store, this.user, type, list.entries, custom, progress);
      } else {
        await syncList(this.client, this.store, this.user, type, progress);
      }
      this.preferences.delete(type);
    }
    await this.store.setMeta(SYNCED_KEY, String(Date.now()));
    await this.save(true);
  }

  async settings(): Promise<Settings> {
    const raw = await this.store.getMeta(SETTINGS_KEY);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    const saved = JSON.parse(raw) as Partial<Settings>;
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      filters: {
        ANIME: makeFilters(saved.filters?.ANIME ?? {}),
        MANGA: makeFilters(saved.filters?.MANGA ?? {}),
      },
    };
  }

  async setSettings(settings: Settings): Promise<void> {
    await this.store.setMeta(SETTINGS_KEY, JSON.stringify(settings));
    await this.save();
  }

  /** The saved picks for a type, if any. */
  async picks(type: MediaType): Promise<Picks | null> {
    const raw = await this.store.getMeta(`ui-picks:${type}`);
    return raw ? (JSON.parse(raw) as Picks) : null;
  }

  /** Run the engine and keep up to `pool` picks; `null` when that list isn't synced yet. */
  async recommend(
    type: MediaType,
    progress: Progress = () => {},
    pool = POOL,
  ): Promise<Picks | null> {
    const s = await this.settings();
    const crowd = type === "ANIME" ? await this.crowdTable(progress) : { table: null };
    let result: RunResult;
    try {
      result = await run(
        this.store,
        this.client,
        this.user,
        type,
        makeRunOptions({
          limit: pool,
          includeAdult: s.includeAdult,
          filters: s.filters[type],
          crowd: crowd.table,
        }),
        progress,
      );
    } catch (e) {
      if (e instanceof NoSyncedList) return null;
      throw e;
    }
    this.preferences.set(type, preferencesOf(result));
    const picks: Picks = {
      at: Date.now(),
      recommendations: result.recommendations,
      warnings: crowd.error ? [crowd.error, ...result.warnings] : result.warnings,
    };
    await this.store.setMeta(`ui-picks:${type}`, JSON.stringify(picks));
    await this.save();
    return picks;
  }

  /** The host's crowd table, fetched and decoded once a session; never fails a run. */
  private crowdTable(progress: Progress): Promise<{ table: CrowdTable | null; error?: string }> {
    const load = this.host.crowdTable;
    if (!load) return Promise.resolve({ table: null });
    this.crowd ??= (async () => {
      progress("Loading picks from other people's lists");
      try {
        return { table: parseCrowd(await load.call(this.host)) };
      } catch (e) {
        this.crowd = null; // try again next run
        const why = e instanceof Error ? e.message : String(e);
        return { table: null, error: `picks from other people's lists unavailable: ${why}` };
      }
    })();
    return this.crowd;
  }

  /** What the model learned for a type; runs offline if there's no run yet this session. */
  async preferencesFor(type: MediaType): Promise<Preferences | null> {
    const known = this.preferences.get(type);
    if (known) return known;
    try {
      const result = await run(this.store, null, this.user, type, makeRunOptions({ limit: 1 }));
      const preferences = preferencesOf(result);
      this.preferences.set(type, preferences);
      return preferences;
    } catch (e) {
      if (e instanceof NoSyncedList) return null;
      throw e;
    }
  }

  /** Genre strengths and main themes of a title. */
  async themesOf(media: Media) {
    if (!this.themes) {
      const categories = await tagCategories(this.store, null);
      // Without AniList's tag categories, themes rest on genres alone; don't keep that.
      if (!Object.keys(categories).length) return new Themes(categories).summary(media);
      this.themes = new Themes(categories);
    }
    return this.themes.summary(media);
  }

  /** Every AniList tag name, for the tag picker; fetched once and cached for 30 days. */
  async tagNames(): Promise<string[]> {
    try {
      return Object.keys(await tagCategories(this.store, this.client)).sort();
    } catch {
      return Object.keys(await tagCategories(this.store, null)).sort();
    }
  }

  /** Remove picks matching `drop` from saved picks (both types unless given); returns what's left. */
  async dropPicks(
    drop: (m: Media) => boolean,
    types: MediaType[] = TYPES,
  ): Promise<Record<MediaType, Picks | null>> {
    const left = {} as Record<MediaType, Picks | null>;
    for (const type of TYPES) {
      const picks = await this.picks(type);
      if (!picks || !types.includes(type)) {
        left[type] = picks;
        continue;
      }
      const kept = {
        ...picks,
        recommendations: picks.recommendations.filter((r) => !drop(r.media)),
      };
      if (kept.recommendations.length !== picks.recommendations.length)
        await this.store.setMeta(`ui-picks:${type}`, JSON.stringify(kept));
      left[type] = kept;
    }
    await this.save();
    return left;
  }

  /**
   * Exclude labels (`tag:…`, `genre:…`, `country:…` keys) from this type's search, dropping
   * matching picks at once. Labels the search filters by are skipped: excluding them would
   * leave nothing. Returns the new settings, what was excluded, and the picks left.
   */
  async excludeLabels(
    type: MediaType,
    keys: string[],
  ): Promise<{ settings: Settings; excluded: string[]; left: Record<MediaType, Picks | null> }> {
    const s = await this.settings();
    const f = s.filters[type];
    const required = requiredLabels(f);
    const excluded = keys.filter((k) => !required.has(k) && !f.exclude.includes(k));
    const settings = {
      ...s,
      filters: { ...s.filters, [type]: { ...f, exclude: [...f.exclude, ...excluded] } },
    };
    await this.setSettings(settings);
    const left = await this.dropPicks(
      (m) => {
        const labels = exclusionLabels(m);
        return excluded.some((k) => labels.has(k));
      },
      [type],
    );
    return { settings, excluded, left };
  }

  /** Labels excluded from every search (Settings → Blacklisted). */
  async blacklist(keys: string[]): Promise<SavedExclusions> {
    const e = await this.setExclusions((x) => x.labels.push(...keys));
    await this.dropPicks((m) => {
      const labels = exclusionLabels(m);
      return keys.some((k) => labels.has(k));
    });
    return e;
  }

  /**
   * "Not interested": hide a title like an exclusion (its sequels follow on the next run) and
   * train on it as a dislike from the next run on. Drops it from the picks at once.
   */
  async notInterested(media: Media): Promise<Record<MediaType, Picks | null>> {
    await this.setExclusions((e) => {
      e.titles.push(media.id);
      e.notInterested = [...(e.notInterested ?? []), media.id];
    });
    return this.dropPicks((m) => m.id === media.id);
  }

  /** Exclude a title (its sequels follow on the next run) and drop it from the picks. */
  async excludeTitle(media: Media): Promise<Record<MediaType, Picks | null>> {
    await this.setExclusions((e) => e.titles.push(media.id));
    return this.dropPicks((m) => m.id === media.id);
  }

  /**
   * A title's synopsis, characters (with Japanese voice actors) and key staff, fetched once per
   * session in a single request when its dialog opens.
   */
  async titleDetails(id: number): Promise<TitleDetails> {
    const known = this.details.get(id);
    if (known) return known;
    const data = await this.client.query<{ Media: DetailsNode }>(queries.MEDIA_DETAILS, { id });
    const parsed = parseDetails(data.Media);
    const details = { ...parsed, description: cleanDescription(parsed.description) };
    this.details.set(id, details);
    return details;
  }

  async exclusions(): Promise<SavedExclusions> {
    return this.store.getExclusions(this.user);
  }

  async setExclusions(change: (e: SavedExclusions) => void): Promise<SavedExclusions> {
    const e = structuredClone(await this.exclusions());
    change(e);
    e.titles = [...new Set(e.titles)];
    e.labels = [...new Set(e.labels)];
    e.notInterested = [...new Set(e.notInterested ?? [])];
    await this.store.putExclusions(this.user, e);
    await this.save();
    return e;
  }

  /** Custom list names per type, for the exclusions settings. */
  async customListNames(type: MediaType): Promise<string[]> {
    return [...(await this.store.getCustomLists(this.user, type)).keys()].sort();
  }

  async media(ids: number[]): Promise<Map<number, Media>> {
    return this.store.getMedia(ids);
  }

  /** Add to planning through the host, and to the local copy of the list. */
  async addToPlanning(media: Media): Promise<void> {
    if (!this.host.addToPlanning) throw new Error("this host can't change your list");
    const list = await this.store.getList(this.user, media.type);
    // Hosts set the status outright, so a title already on the list would lose its status.
    if (list.some((e) => e.mediaId === media.id)) throw new Error("it's already on your list");
    await this.host.addToPlanning(media);
    const entry: ListEntry = {
      mediaId: media.id,
      status: "PLANNING",
      score: 0,
      progress: 0,
      repeat: 0,
      updatedAt: Math.floor(Date.now() / 1000),
    };
    await this.store.putList(this.user, media.type, [...list, entry]);
    await this.save();
  }

  /** Forget everything for this user (settings, picks, exclusions, cache). */
  async clear(): Promise<void> {
    await this.host.saveStore(JSON.stringify(new MemoryStore().toJSON()));
  }

  /** Save the store through the host, soon or (with `now`) at once. */
  async save(now = false): Promise<void> {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const write = () => this.host.saveStore(JSON.stringify(this.store.toJSON()));
    if (now) return write();
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void write();
    }, SAVE_DELAY_MS);
  }
}

/** A feature must appear on at least this many titles of a list to be shown for it. */
const SHOWN_MIN_TITLES = 2;

function preferencesOf(result: RunResult): Preferences {
  const { profile } = result;
  const own = profile.entries;
  // The model learns from both lists at once (that ranks better), so its weights are the same
  // for anime and manga. Show, for each list, the learned preferences that appear on it.
  const onList = new Map<string, number>();
  for (const e of own) {
    const m = profile.media.get(e.mediaId);
    if (m) for (const k of features(m).keys()) onList.set(k, (onList.get(k) ?? 0) + 1);
  }
  const shown = profile.model
    .weights()
    .filter(
      ([k]) =>
        !HIDDEN_REASONS.some((p) => k.startsWith(p)) &&
        k.includes(":") &&
        (onList.get(k) ?? 0) >= SHOWN_MIN_TITLES,
    );
  const scored = own.filter((e) => e.score > 0);
  return {
    onList: own.length,
    scored: scored.length,
    mean: scored.length ? scored.reduce((a, e) => a + e.score, 0) / scored.length / 10 : null,
    learnedFrom: examples(own, profile.media).length,
    likes: shown.filter(([, w]) => w > 0).slice(0, 8),
    likedTags: shown
      .filter(([k, w]) => w > 0 && k.startsWith("tag:"))
      .slice(0, 10)
      .map(([k]) => k.slice(4)),
    dislikes: shown
      .filter(([, w]) => w < 0)
      .sort((a, b) => a[1] - b[1])
      .slice(0, 8),
  };
}

/** AniList descriptions carry a little HTML even as plain text. */
export function cleanDescription(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export { emptyExclusions };
