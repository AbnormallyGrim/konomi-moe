function init() {
  $ui.register((ctx) => {
var __forYou = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // src/plugin.ts
  var plugin_exports = {};
  __export(plugin_exports, {
    ICON: () => ICON,
    LABEL: () => LABEL,
    STORE_KEY: () => STORE_KEY,
    answer: () => answer,
    backgroundSetup: () => backgroundSetup,
    handlers: () => handlers,
    pluginHost: () => pluginHost,
    start: () => start
  });

  // ../engine/src/anilist/batch.ts
  var PAGES_PER_REQUEST = 10;
  var cache = /* @__PURE__ */ new Map();
  function batchQuery(query, n) {
    const key = `${n}\0${query}`;
    const known = cache.get(key);
    if (known) return known;
    const open = query.indexOf("query (");
    if (open < 0) throw new Error("only queries with declared variables can be batched");
    const declsStart = open + "query (".length;
    const declsEnd = matching(query, declsStart - 1, "(", ")");
    const bodyStart = query.indexOf("{", declsEnd);
    const bodyEnd = matching(query, bodyStart, "{", "}");
    const decls = query.slice(declsStart, declsEnd).trim();
    const body = query.slice(bodyStart + 1, bodyEnd).trim();
    const rest = query.slice(bodyEnd + 1);
    const rename = (text, i) => text.replace(/\$(\w+)/g, `$$$1_${i}`);
    const runs = Array.from({ length: n }, (_, i) => i);
    const batched = `
query (${runs.map((i) => rename(decls, i)).join(", ")}) {
${runs.map((i) => `  q${i}: ${rename(body, i)}`).join("\n")}
}${rest}`;
    cache.set(key, batched);
    return batched;
  }
  function batchVariables(runs) {
    const out = {};
    runs.forEach((vars, i) => {
      for (const [k, v] of Object.entries(vars)) out[`${k}_${i}`] = v;
    });
    return out;
  }
  function chunk(items, size) {
    const out = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
  }
  function matching(text, at, open, close) {
    let depth = 0;
    for (let i = at; i < text.length; i++) {
      if (text[i] === open) depth++;
      else if (text[i] === close && --depth === 0) return i;
    }
    throw new Error(`unbalanced ${open}${close} in query`);
  }

  // ../engine/src/anilist/client.ts
  var API_URL = "https://graphql.anilist.co";
  var AniListError = class extends Error {
    constructor(message, status = null) {
      super(message);
      __publicField(this, "status");
      this.name = "AniListError";
      this.status = status;
    }
  };
  var AniListClient = class {
    constructor(transport, options = {}) {
      __publicField(this, "transport");
      __publicField(this, "interval");
      __publicField(this, "maxRetries");
      __publicField(this, "sleep");
      __publicField(this, "now");
      __publicField(this, "epochSeconds");
      __publicField(this, "nextAllowed", 0);
      /** No request starts before this (after a 429, a 5xx, or no requests left). */
      __publicField(this, "blockedUntil", 0);
      var _a, _b, _c, _d, _e;
      this.transport = transport;
      this.interval = 6e4 / ((_a = options.requestsPerMinute) != null ? _a : 30);
      this.maxRetries = (_b = options.maxRetries) != null ? _b : 5;
      this.sleep = (_c = options.sleep) != null ? _c : ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
      this.now = (_d = options.now) != null ? _d : (() => performance.now());
      this.epochSeconds = (_e = options.epochSeconds) != null ? _e : (() => Date.now() / 1e3);
    }
    /** Runs a query and returns its `data`. GraphQL errors are thrown without retrying. */
    async query(query, variables = {}) {
      var _a, _b;
      for (let attempt = 0; ; attempt++) {
        const last = attempt === this.maxRetries;
        await this.waitTurn();
        let res;
        try {
          res = await this.transport({ query, variables });
        } catch (e) {
          if (last) throw new AniListError(`could not reach AniList: ${String(e)}`);
          this.backOff(2 ** attempt * 1e3);
          continue;
        }
        if (res.status === 429 || res.status >= 500) {
          if (last) throw new AniListError(`AniList returned ${res.status}`, res.status);
          this.backOff((_a = retryAfterMs(res)) != null ? _a : 2 ** attempt * 1e3);
          continue;
        }
        this.respectRemaining(res);
        const body = await res.json();
        if ((_b = body.errors) == null ? void 0 : _b.length) {
          const message = body.errors.map((e) => {
            var _a2;
            return (_a2 = e.message) != null ? _a2 : "unknown error";
          }).join("; ");
          throw new AniListError(message, res.status);
        }
        if (res.status !== 200 || body.data === void 0) {
          throw new AniListError(`AniList returned ${res.status}`, res.status);
        }
        return body.data;
      }
    }
    /**
     * Runs `query` once per entry of `runs` in a single request (GraphQL aliases), returning
     * each run's `data` in order. One run is sent as the plain query.
     */
    async queryMany(query, runs) {
      if (runs.length === 0) return [];
      if (runs.length === 1) return [await this.query(query, runs[0])];
      const data = await this.query(
        batchQuery(query, runs.length),
        batchVariables(runs)
      );
      const root = rootField(query);
      return runs.map((_, i) => ({ [root]: data[`q${i}`] }));
    }
    /**
     * Waits for this request's slot. The slot is taken before waiting, so requests sent at the
     * same time still start `interval` apart, and the next request can go out while this one is
     * still being answered.
     */
    async waitTurn() {
      const now = this.now();
      const slot = Math.max(now, this.nextAllowed, this.blockedUntil);
      this.nextAllowed = slot + this.interval;
      if (slot > now) await this.sleep(slot - now);
      for (let t = this.now(); t < this.blockedUntil; t = this.now())
        await this.sleep(this.blockedUntil - t);
    }
    backOff(ms) {
      this.blockedUntil = Math.max(this.blockedUntil, this.now() + ms);
      this.nextAllowed = Math.max(this.nextAllowed, this.blockedUntil);
    }
    respectRemaining(res) {
      const remaining = res.header("X-RateLimit-Remaining");
      const reset = Number(res.header("X-RateLimit-Reset"));
      if (remaining === "0" && Number.isFinite(reset) && reset > 0) {
        this.backOff(Math.max(0, reset - this.epochSeconds()) * 1e3);
      }
    }
  };
  function rootField(query) {
    const body = query.indexOf("{", query.indexOf(")"));
    const m = /^\s*(\w+)/.exec(query.slice(body + 1));
    if (!(m == null ? void 0 : m[1])) throw new Error("query has no root field");
    return m[1];
  }
  function retryAfterMs(res) {
    const value = Number(res.header("Retry-After"));
    return res.header("Retry-After") !== null && Number.isFinite(value) ? value * 1e3 : null;
  }

  // ../engine/src/anilist/parse.ts
  function parseMedia(node) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z;
    const title = (_a = node.title) != null ? _a : {};
    const distribution = (_c = (_b = node.stats) == null ? void 0 : _b.scoreDistribution) != null ? _c : [];
    return {
      id: node.id,
      type: node.type,
      title: title.english || title.romaji || `#${node.id}`,
      format: (_d = node.format) != null ? _d : null,
      status: (_e = node.status) != null ? _e : null,
      isAdult: Boolean(node.isAdult),
      year: (_g = (_f = node.startDate) == null ? void 0 : _f.year) != null ? _g : null,
      episodes: (_h = node.episodes) != null ? _h : null,
      chapters: (_i = node.chapters) != null ? _i : null,
      averageScore: (_j = node.averageScore) != null ? _j : null,
      meanScore: (_k = node.meanScore) != null ? _k : null,
      popularity: (_l = node.popularity) != null ? _l : null,
      favourites: (_m = node.favourites) != null ? _m : null,
      scoreDistribution: distribution.map((d) => [d.score, d.amount]).sort((a, b) => a[0] - b[0] || a[1] - b[1]),
      siteUrl: (_n = node.siteUrl) != null ? _n : null,
      coverUrl: (_p = (_o = node.coverImage) == null ? void 0 : _o.large) != null ? _p : null,
      genres: [...(_q = node.genres) != null ? _q : []],
      tags: ((_r = node.tags) != null ? _r : []).map(
        (t) => {
          var _a2;
          return { name: t.name, rank: (_a2 = t.rank) != null ? _a2 : 0, spoiler: Boolean(t.isMediaSpoiler) };
        }
      ),
      studios: ((_t = (_s = node.studios) == null ? void 0 : _s.nodes) != null ? _t : []).map((s) => s.name),
      relations: ((_v = (_u = node.relations) == null ? void 0 : _u.edges) != null ? _v : []).flatMap(
        (e) => {
          var _a2;
          return e.node ? [{ relationType: e.relationType, mediaId: e.node.id, mediaType: (_a2 = e.node.type) != null ? _a2 : null }] : [];
        }
      ),
      titles: {
        romaji: (_w = title.romaji) != null ? _w : null,
        english: (_x = title.english) != null ? _x : null,
        native: (_y = title.native) != null ? _y : null
      },
      country: (_z = node.countryOfOrigin) != null ? _z : null
    };
  }
  function parseRecommendations(node) {
    var _a, _b;
    return ((_b = (_a = node.recommendations) == null ? void 0 : _a.nodes) != null ? _b : []).flatMap(
      (n) => {
        var _a2;
        return n.mediaRecommendation ? [[n.mediaRecommendation.id, (_a2 = n.rating) != null ? _a2 : 0]] : [];
      }
    );
  }
  function parseListChunk(data) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i;
    const collection = (_a = data.MediaListCollection) != null ? _a : {};
    const chunk2 = {
      entries: [],
      media: [],
      recommendations: /* @__PURE__ */ new Map(),
      customLists: /* @__PURE__ */ new Map(),
      hasNext: Boolean(collection.hasNextChunk)
    };
    const seen = /* @__PURE__ */ new Set();
    for (const list of (_b = collection.lists) != null ? _b : []) {
      const entries = (_c = list.entries) != null ? _c : [];
      if (list.isCustomList) {
        const name = (_d = list.name) != null ? _d : "";
        const ids = (_e = chunk2.customLists.get(name)) != null ? _e : /* @__PURE__ */ new Set();
        for (const e of entries) ids.add(e.media.id);
        chunk2.customLists.set(name, ids);
      }
      for (const e of entries) {
        const node = e.media;
        if (seen.has(node.id)) continue;
        seen.add(node.id);
        chunk2.entries.push({
          mediaId: node.id,
          status: e.status,
          score: Math.trunc((_f = e.score) != null ? _f : 0),
          progress: (_g = e.progress) != null ? _g : 0,
          repeat: (_h = e.repeat) != null ? _h : 0,
          updatedAt: (_i = e.updatedAt) != null ? _i : 0
        });
        chunk2.media.push(parseMedia(node));
        chunk2.recommendations.set(node.id, parseRecommendations(node));
      }
    }
    return chunk2;
  }

  // ../engine/src/anilist/queries.ts
  var queries_exports = {};
  __export(queries_exports, {
    DISCOVER: () => DISCOVER,
    MEDIA_BY_IDS: () => MEDIA_BY_IDS,
    MEDIA_DESCRIPTION: () => MEDIA_DESCRIPTION,
    MEDIA_DETAILS: () => MEDIA_DETAILS,
    MEDIA_WITH_RECS_BY_IDS: () => MEDIA_WITH_RECS_BY_IDS,
    SAVE_ENTRY: () => SAVE_ENTRY,
    TAG_COLLECTION: () => TAG_COLLECTION,
    USER_LIST: () => USER_LIST,
    VIEWER: () => VIEWER
  });
  var USER_LIST = "\nquery ($userName: String, $type: MediaType, $chunk: Int, $perChunk: Int) {\n  MediaListCollection(userName: $userName, type: $type, chunk: $chunk, perChunk: $perChunk) {\n    hasNextChunk\n    lists {\n      name\n      isCustomList\n      entries {\n        status\n        score(format: POINT_100)\n        progress\n        repeat\n        updatedAt\n        media {\n          ...MediaFields\n          recommendations(perPage: 10, sort: RATING_DESC) {\n            nodes { rating mediaRecommendation { id } }\n          }\n        }\n      }\n    }\n  }\n}\n\nfragment MediaFields on Media {\n  id\n  type\n  format\n  status\n  isAdult\n  siteUrl\n  title { romaji english native }\n  countryOfOrigin\n  coverImage { large }\n  episodes\n  chapters\n  startDate { year }\n  averageScore\n  meanScore\n  popularity\n  favourites\n  stats { scoreDistribution { score amount } }\n  genres\n  tags { name rank isMediaSpoiler }\n  studios(isMain: true) { nodes { name } }\n  relations { edges { relationType node { id type } } }\n}\n";
  var MEDIA_BY_IDS = "\nquery ($ids: [Int], $page: Int, $perPage: Int) {\n  Page(page: $page, perPage: $perPage) {\n    pageInfo { hasNextPage }\n    media(id_in: $ids) { ...MediaFields }\n  }\n}\n\nfragment MediaFields on Media {\n  id\n  type\n  format\n  status\n  isAdult\n  siteUrl\n  title { romaji english native }\n  countryOfOrigin\n  coverImage { large }\n  episodes\n  chapters\n  startDate { year }\n  averageScore\n  meanScore\n  popularity\n  favourites\n  stats { scoreDistribution { score amount } }\n  genres\n  tags { name rank isMediaSpoiler }\n  studios(isMain: true) { nodes { name } }\n  relations { edges { relationType node { id type } } }\n}\n";
  var MEDIA_WITH_RECS_BY_IDS = "\nquery ($ids: [Int], $page: Int, $perPage: Int) {\n  Page(page: $page, perPage: $perPage) {\n    pageInfo { hasNextPage }\n    media(id_in: $ids) {\n      ...MediaFields\n      recommendations(perPage: 10, sort: RATING_DESC) {\n        nodes { rating mediaRecommendation { id } }\n      }\n    }\n  }\n}\n\nfragment MediaFields on Media {\n  id\n  type\n  format\n  status\n  isAdult\n  siteUrl\n  title { romaji english native }\n  countryOfOrigin\n  coverImage { large }\n  episodes\n  chapters\n  startDate { year }\n  averageScore\n  meanScore\n  popularity\n  favourites\n  stats { scoreDistribution { score amount } }\n  genres\n  tags { name rank isMediaSpoiler }\n  studios(isMain: true) { nodes { name } }\n  relations { edges { relationType node { id type } } }\n}\n";
  var DISCOVER = "\nquery (\n  $type: MediaType\n  $page: Int\n  $perPage: Int\n  $genreIn: [String]\n  $tagIn: [String]\n  $minimumTagRank: Int\n  $tagNotIn: [String]\n  $genreNotIn: [String]\n  $idNotIn: [Int]\n  $formatIn: [MediaFormat]\n  $startGreater: FuzzyDateInt\n  $startLesser: FuzzyDateInt\n  $statusIn: [MediaStatus]\n  $countryOfOrigin: CountryCode\n  $averageScoreGreater: Int\n) {\n  Page(page: $page, perPage: $perPage) {\n    media(\n      type: $type\n      genre_in: $genreIn\n      tag_in: $tagIn\n      minimumTagRank: $minimumTagRank\n      tag_not_in: $tagNotIn\n      genre_not_in: $genreNotIn\n      id_not_in: $idNotIn\n      format_in: $formatIn\n      startDate_greater: $startGreater\n      startDate_lesser: $startLesser\n      status_in: $statusIn\n      countryOfOrigin: $countryOfOrigin\n      averageScore_greater: $averageScoreGreater\n      isAdult: false\n      sort: SCORE_DESC\n    ) { ...MediaFields }\n  }\n}\n\nfragment MediaFields on Media {\n  id\n  type\n  format\n  status\n  isAdult\n  siteUrl\n  title { romaji english native }\n  countryOfOrigin\n  coverImage { large }\n  episodes\n  chapters\n  startDate { year }\n  averageScore\n  meanScore\n  popularity\n  favourites\n  stats { scoreDistribution { score amount } }\n  genres\n  tags { name rank isMediaSpoiler }\n  studios(isMain: true) { nodes { name } }\n  relations { edges { relationType node { id type } } }\n}\n";
  var VIEWER = "query { Viewer { id name } }";
  var MEDIA_DESCRIPTION = "query ($id: Int) { Media(id: $id) { description(asHtml: false) } }";
  var MEDIA_DETAILS = "\nquery ($id: Int) {\n  Media(id: $id) {\n    description(asHtml: false)\n    trailer { id site thumbnail }\n    characters(sort: [ROLE, RELEVANCE, ID], perPage: 12) {\n      edges {\n        role\n        node { id name { full } image { medium } }\n        voiceActors(language: JAPANESE, sort: [RELEVANCE, ID]) { id name { full } image { medium } }\n      }\n    }\n    staff(sort: [RELEVANCE, ID], perPage: 25) {\n      edges { role node { id name { full } image { medium } } }\n    }\n  }\n}\n";
  var SAVE_ENTRY = "\nmutation ($mediaId: Int, $status: MediaListStatus) {\n  SaveMediaListEntry(mediaId: $mediaId, status: $status) { id status }\n}\n";
  var TAG_COLLECTION = "{ MediaTagCollection { name category } }";

  // ../engine/src/details.ts
  var KEY_STAFF_ROLES = /* @__PURE__ */ new Set([
    "Original Creator",
    "Original Story",
    "Story & Art",
    "Story",
    "Art",
    "Director",
    "Chief Director",
    "Series Composition",
    "Script Composition",
    "Character Design",
    "Original Character Design",
    "Music"
  ]);
  function person(n) {
    var _a, _b, _c, _d;
    return { id: n.id, name: (_b = (_a = n.name) == null ? void 0 : _a.full) != null ? _b : "", image: (_d = (_c = n.image) == null ? void 0 : _c.medium) != null ? _d : null };
  }
  var VIDEO_ID = /^[\w-]{1,32}$/;
  function parseTrailer(node) {
    var _a, _b;
    const id = (_a = node == null ? void 0 : node.id) != null ? _a : "";
    if (!VIDEO_ID.test(id)) return null;
    const thumbnail = ((_b = node == null ? void 0 : node.thumbnail) == null ? void 0 : _b.startsWith("https://")) ? node.thumbnail : null;
    if ((node == null ? void 0 : node.site) === "youtube")
      return {
        site: "youtube",
        url: `https://www.youtube.com/watch?v=${id}`,
        thumbnail: thumbnail != null ? thumbnail : `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
      };
    if ((node == null ? void 0 : node.site) === "dailymotion")
      return { site: "dailymotion", url: `https://www.dailymotion.com/video/${id}`, thumbnail };
    return null;
  }
  function baseRole(role) {
    var _a, _b;
    return (_b = (_a = role.split(" (")[0]) == null ? void 0 : _a.trim()) != null ? _b : role;
  }
  function parseDetails(node) {
    var _a, _b, _c, _d, _e;
    const characters = ((_b = (_a = node.characters) == null ? void 0 : _a.edges) != null ? _b : []).flatMap((e) => {
      var _a2, _b2;
      if (!(e == null ? void 0 : e.node)) return [];
      const va = (_a2 = e.voiceActors) == null ? void 0 : _a2[0];
      return [{ ...person(e.node), role: (_b2 = e.role) != null ? _b2 : "", voiceActor: va ? person(va) : null }];
    });
    const staff = /* @__PURE__ */ new Map();
    for (const e of (_d = (_c = node.staff) == null ? void 0 : _c.edges) != null ? _d : []) {
      if (!(e == null ? void 0 : e.node) || !e.role) continue;
      const role = baseRole(e.role);
      if (!KEY_STAFF_ROLES.has(role)) continue;
      const known = staff.get(e.node.id);
      if (known) {
        if (!known.roles.includes(role)) known.roles.push(role);
      } else {
        staff.set(e.node.id, { ...person(e.node), roles: [role] });
      }
    }
    return {
      description: (_e = node.description) != null ? _e : "",
      trailer: parseTrailer(node.trailer),
      characters,
      staff: [...staff.values()]
    };
  }

  // ../engine/src/models.ts
  function otherType(type) {
    return type === "ANIME" ? "MANGA" : "ANIME";
  }
  function mediaLength(m) {
    return m.type === "ANIME" ? m.episodes : m.chapters;
  }
  function linked(m, relationType) {
    return m.relations.filter(
      (r) => r.relationType === relationType && (r.mediaType === null || r.mediaType === m.type)
    ).map((r) => r.mediaId);
  }
  function prequelIds(m) {
    return linked(m, "PREQUEL");
  }
  function sequelIds(m) {
    return linked(m, "SEQUEL");
  }
  function mediaLabels(m) {
    return /* @__PURE__ */ new Set([
      ...m.genres.map((g) => `genre:${g}`),
      ...m.tags.map((t) => `tag:${t.name}`),
      ...m.studios.map((s) => `studio:${s}`)
    ]);
  }
  function exclusionLabels(m) {
    const labels = mediaLabels(m);
    if (m.country) labels.add(`country:${m.country}`);
    if (m.format) labels.add(`format:${m.format}`);
    return labels;
  }

  // ../engine/src/exclusions.ts
  var MAX_CHAIN = 30;
  function excludedTags(e) {
    return byPrefix(e, "tag:");
  }
  function excludedGenres(e) {
    return byPrefix(e, "genre:");
  }
  function byPrefix(e, prefix) {
    return [...e.labels].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length)).sort();
  }
  function blocks(e, media, lookup) {
    if (e.mediaIds.has(media.id)) return true;
    for (const label2 of exclusionLabels(media)) if (e.labels.has(label2)) return true;
    for (const id of prequelChain(media, lookup)) if (e.mediaIds.has(id)) return true;
    return false;
  }
  function prequelChain(media, lookup) {
    const seen = /* @__PURE__ */ new Set();
    let frontier = new Set(prequelIds(media));
    for (let i = 0; i < MAX_CHAIN && frontier.size; i++) {
      for (const id of frontier) seen.add(id);
      const next = /* @__PURE__ */ new Set();
      for (const m of lookup(frontier).values())
        for (const p of prequelIds(m)) if (!seen.has(p)) next.add(p);
      frontier = next;
    }
    return seen;
  }
  async function sequelClosure(start2, lookup, fetchMissing) {
    const seen = new Set(start2);
    let frontier = new Set(seen);
    for (let i = 0; i < MAX_CHAIN && frontier.size; i++) {
      if (fetchMissing) await fetchMissing(frontier);
      const next = /* @__PURE__ */ new Set();
      for (const m of lookup(frontier).values())
        for (const s of sequelIds(m)) if (!seen.has(s)) next.add(s);
      for (const id of next) seen.add(id);
      frontier = next;
    }
    return seen;
  }

  // ../engine/src/themes.ts
  var GENRES = [
    "Action",
    "Adventure",
    "Comedy",
    "Drama",
    "Ecchi",
    "Fantasy",
    "Horror",
    "Mahou Shoujo",
    "Mecha",
    "Music",
    "Mystery",
    "Psychological",
    "Romance",
    "Sci-Fi",
    "Slice of Life",
    "Sports",
    "Supernatural",
    "Thriller"
  ];
  var GENRE_CATEGORIES = {
    Action: ["Theme-Action", "Theme-Other-Organisations"],
    Comedy: ["Theme-Comedy"],
    Drama: ["Theme-Drama"],
    Fantasy: ["Theme-Fantasy"],
    Mecha: ["Theme-Sci-Fi-Mecha"],
    Music: ["Theme-Arts-Music"],
    Romance: ["Theme-Romance"],
    "Sci-Fi": ["Theme-Sci-Fi", "Theme-Sci-Fi-Mecha"],
    "Slice of Life": ["Theme-Slice of Life"],
    Sports: ["Theme-Game-Sport"]
  };
  var GENRE_TAGS = {
    Action: ["Super Power", "War", "Death Game", "Survival", "Kaiju"],
    Adventure: ["Travel", "Dungeon", "Isekai", "Virtual World", "Lost Civilization"],
    Ecchi: ["Nudity"],
    Fantasy: ["Urban Fantasy", "Demons", "Gods", "Vampire", "Reincarnation", "Dungeon"],
    Horror: ["Body Horror", "Cosmic Horror", "Zombie", "Gore", "Survival"],
    "Mahou Shoujo": ["Henshin", "Magic"],
    Mecha: ["Robots"],
    Mystery: ["Detective", "Conspiracy", "Crime"],
    Psychological: ["Psychosexual", "Philosophy"],
    "Sci-Fi": ["Robots", "Aliens", "Space", "Cyborg", "Post-Apocalyptic", "Cyberpunk"],
    Supernatural: ["Demons", "Ghost", "Youkai", "Super Power", "Curses", "Exorcism"],
    Thriller: ["Conspiracy", "Crime", "Death Game"]
  };
  var NOT_EVIDENCE = /* @__PURE__ */ new Set(["Heterosexual"]);
  var RIVALS = /* @__PURE__ */ new Set([
    "Action",
    "Adventure",
    "Fantasy",
    "Horror",
    "Mahou Shoujo",
    "Mecha",
    "Mystery",
    "Psychological",
    "Romance",
    "Sci-Fi",
    "Sports",
    "Supernatural",
    "Thriller"
  ]);
  var MAIN_MIN = 60;
  var GENRE_ONLY = 50;
  var Themes = class {
    constructor(tagCategories2) {
      __publicField(this, "tags");
      this.tags = new Map(
        GENRES.map((g) => {
          var _a, _b;
          const categories = (_a = GENRE_CATEGORIES[g]) != null ? _a : [];
          const names = Object.entries(tagCategories2).filter(([, c]) => categories.includes(c)).map(([n]) => n);
          return [
            g,
            new Set([...names, ...(_b = GENRE_TAGS[g]) != null ? _b : []].filter((n) => !NOT_EVIDENCE.has(n)))
          ];
        })
      );
    }
    /** Rank of the strongest tag evidencing `genre`; a listed genre is at least 50. */
    strength(media, genre) {
      const evidence = this.tags.get(genre);
      const best = Math.max(0, ...media.tags.filter((t) => evidence == null ? void 0 : evidence.has(t.name)).map((t) => t.rank));
      return media.genres.includes(genre) ? Math.max(best, GENRE_ONLY) : best;
    }
    /**
     * Listed, and either the only plot-driving genre listed, or ranked at least 60 and at least
     * as strong as every rival genre listed.
     */
    isMain(media, genre) {
      if (!media.genres.includes(genre)) return false;
      const own = this.strength(media, genre);
      const rivals = media.genres.filter((g) => g !== genre && RIVALS.has(g)).map((g) => this.strength(media, g));
      return rivals.length === 0 || own >= MAIN_MIN && rivals.every((r) => r <= own);
    }
    /** The title's genres, strongest first. */
    summary(media) {
      return media.genres.map((g) => ({ genre: g, strength: this.strength(media, g), main: this.isMain(media, g) })).sort((a, b) => b.strength - a.strength);
    }
  };

  // ../engine/src/filters.ts
  function makeFilters(given = {}) {
    const { finishedOnly, ...rest } = given;
    return {
      genres: [],
      tags: [],
      mainTheme: false,
      minTagRank: 0,
      formats: [],
      yearFrom: null,
      yearTo: null,
      statuses: finishedOnly ? ["FINISHED"] : [],
      hideListed: true,
      hideSeenAdaptations: false,
      minScore: 0,
      countries: [],
      exclude: [],
      ...rest
    };
  }
  function requiredLabels(f) {
    return /* @__PURE__ */ new Set([
      ...f.genres.map((g) => `genre:${g}`),
      ...f.tags.map((t) => `tag:${t}`),
      ...f.countries.map((c) => `country:${c}`),
      ...f.formats.map((x) => `format:${x}`)
    ]);
  }
  function filtersActive(f) {
    return Boolean(
      f.genres.length || f.tags.length || f.formats.length || f.yearFrom || f.yearTo || f.statuses.length || f.countries.length
    );
  }
  function filterAccepts(f, m, themes) {
    const minRank = Math.max(1, f.minTagRank);
    const ranks = new Map(m.tags.map((t) => [t.name, t.rank]));
    return f.genres.every((g) => m.genres.includes(g)) && f.tags.every((t) => {
      var _a;
      return ((_a = ranks.get(t)) != null ? _a : 0) >= minRank;
    }) && !(f.mainTheme && !mainGenres(f).every((g) => themes.isMain(m, g))) && (f.formats.length === 0 || m.format !== null && f.formats.includes(m.format)) && yearOk(f, m.year) && (f.statuses.length === 0 || m.status !== null && f.statuses.includes(m.status)) && countryOk(f, m);
  }
  function scoreAccepts(f, m) {
    return !f.minScore || m.averageScore !== null && m.averageScore >= f.minScore;
  }
  function mainGenres(f) {
    const rivals = f.genres.filter((g) => RIVALS.has(g));
    return rivals.length ? rivals : f.genres;
  }
  function filterQueryVariables(f) {
    const v = {};
    if (f.genres.length) v.genreIn = [...f.genres];
    if (f.tags.length) {
      v.tagIn = [...f.tags];
      v.minimumTagRank = Math.max(1, f.minTagRank);
    }
    if (f.formats.length) v.formatIn = [...f.formats];
    if (f.yearFrom) v.startGreater = f.yearFrom * 1e4;
    if (f.yearTo) v.startLesser = f.yearTo * 1e4 + 1231;
    if (f.statuses.length) v.statusIn = [...f.statuses];
    if (f.minScore) v.averageScoreGreater = f.minScore - 1;
    if (f.countries.length === 1) v.countryOfOrigin = f.countries[0];
    return v;
  }
  function countryOk(f, m) {
    if (!f.countries.length || m.country === void 0) return true;
    return m.country !== null && f.countries.includes(m.country);
  }
  function yearOk(f, year) {
    if (!(f.yearFrom || f.yearTo)) return true;
    if (year === null) return false;
    return (f.yearFrom || year) <= year && year <= (f.yearTo || year);
  }
  var VERSIONS = /* @__PURE__ */ new Set([
    "ADAPTATION",
    "SOURCE",
    "ALTERNATIVE",
    "SUMMARY",
    "COMPILATION",
    "CONTAINS"
  ]);
  var SEEN = /* @__PURE__ */ new Set([
    "COMPLETED",
    "REPEATING",
    "DROPPED",
    "CURRENT",
    "PAUSED"
  ]);
  function seenAdaptations(otherEntries, mediaType, getMedia) {
    const seen = new Set(otherEntries.filter((e) => SEEN.has(e.status)).map((e) => e.mediaId));
    return withVersions(seen, mediaType, getMedia);
  }
  function listedVersions(entries, mediaType, getMedia) {
    return withVersions(new Set(entries.map((e) => e.mediaId)), mediaType, getMedia);
  }
  function withVersions(seen, mediaType, getMedia) {
    const versions = (ids) => new Set(
      [...getMedia(ids).values()].flatMap(
        (m) => m.relations.filter(
          (r) => VERSIONS.has(r.relationType) && (r.mediaType === null || r.mediaType === mediaType)
        ).map((r) => r.mediaId)
      )
    );
    const linked2 = versions(seen);
    for (const id of versions(linked2)) linked2.add(id);
    for (const id of seen) linked2.delete(id);
    return { seen, linked: linked2 };
  }
  function blocksSeen(s, m) {
    return s.linked.has(m.id) || m.relations.some((r) => VERSIONS.has(r.relationType) && s.seen.has(r.mediaId));
  }

  // ../engine/src/ridge.ts
  function fitRidge(rows, y, w, alpha, features2) {
    var _a, _b, _c;
    const n = rows.length;
    const total = w.reduce((a, b) => a + b, 0);
    const xMean = new Float64Array(features2);
    rows.forEach((r, i) => {
      r.indices.forEach((j, k) => {
        var _a2, _b2, _c2;
        xMean[j] = ((_a2 = xMean[j]) != null ? _a2 : 0) + ((_b2 = w[i]) != null ? _b2 : 0) * ((_c2 = r.values[k]) != null ? _c2 : 0);
      });
    });
    for (let j = 0; j < features2; j++) xMean[j] = ((_a = xMean[j]) != null ? _a : 0) / total;
    const yMean = y.reduce((acc, yi, i) => {
      var _a2;
      return acc + ((_a2 = w[i]) != null ? _a2 : 0) * yi;
    }, 0) / total;
    const coef = n < features2 ? dual(rows, y, w, alpha, features2, xMean, yMean) : primal(rows, y, w, alpha, features2, xMean, yMean);
    let intercept = yMean;
    for (let j = 0; j < features2; j++) intercept -= ((_b = xMean[j]) != null ? _b : 0) * ((_c = coef[j]) != null ? _c : 0);
    return { coef, intercept };
  }
  function predictRow(fit, row) {
    let s = fit.intercept;
    row.indices.forEach((j, k) => {
      var _a, _b;
      s += ((_a = fit.coef[j]) != null ? _a : 0) * ((_b = row.values[k]) != null ? _b : 0);
    });
    return s;
  }
  function dual(rows, y, w, alpha, features2, xMean, yMean) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i;
    const n = rows.length;
    const dense = rows.map((r) => toMap(r));
    const dotMean = rows.map(
      (r) => r.indices.reduce((s, j, k2) => {
        var _a2, _b2;
        return s + ((_a2 = r.values[k2]) != null ? _a2 : 0) * ((_b2 = xMean[j]) != null ? _b2 : 0);
      }, 0)
    );
    const meanSq = xMean.reduce((s, v) => s + v * v, 0);
    const sq = w.map((wi) => Math.sqrt(wi));
    const k = new Float64Array(n * n);
    for (let i = 0; i < n; i++) {
      for (let l = 0; l <= i; l++) {
        const dot = sparseDot(rows[i], dense[l]);
        const v = ((_a = sq[i]) != null ? _a : 0) * ((_b = sq[l]) != null ? _b : 0) * (dot - ((_c = dotMean[i]) != null ? _c : 0) - ((_d = dotMean[l]) != null ? _d : 0) + meanSq);
        k[i * n + l] = v;
        k[l * n + i] = v;
      }
      k[i * n + i] = ((_e = k[i * n + i]) != null ? _e : 0) + alpha;
    }
    const rhs = new Float64Array(n);
    for (let i = 0; i < n; i++) rhs[i] = ((_f = sq[i]) != null ? _f : 0) * (((_g = y[i]) != null ? _g : 0) - yMean);
    const a = solveSpd(k, rhs, n);
    const coef = new Float64Array(features2);
    let cSum = 0;
    rows.forEach((r, i) => {
      var _a2, _b2;
      const c = ((_a2 = a[i]) != null ? _a2 : 0) * ((_b2 = sq[i]) != null ? _b2 : 0);
      cSum += c;
      r.indices.forEach((j, idx) => {
        var _a3, _b3;
        coef[j] = ((_a3 = coef[j]) != null ? _a3 : 0) + c * ((_b3 = r.values[idx]) != null ? _b3 : 0);
      });
    });
    for (let j = 0; j < features2; j++) coef[j] = ((_h = coef[j]) != null ? _h : 0) - cSum * ((_i = xMean[j]) != null ? _i : 0);
    return coef;
  }
  function primal(rows, y, w, alpha, features2, xMean, yMean) {
    var _a, _b, _c, _d;
    const d = features2;
    const total = w.reduce((s, v) => s + v, 0);
    const a = new Float64Array(d * d);
    const b = new Float64Array(d);
    rows.forEach((r, i) => {
      var _a2, _b2;
      const wi = (_a2 = w[i]) != null ? _a2 : 0;
      const dy = ((_b2 = y[i]) != null ? _b2 : 0) - yMean;
      r.indices.forEach((j, p) => {
        var _a3, _b3;
        const vj = (_a3 = r.values[p]) != null ? _a3 : 0;
        b[j] = ((_b3 = b[j]) != null ? _b3 : 0) + wi * vj * dy;
        r.indices.forEach((l, q) => {
          var _a4, _b4;
          a[j * d + l] = ((_a4 = a[j * d + l]) != null ? _a4 : 0) + wi * vj * ((_b4 = r.values[q]) != null ? _b4 : 0);
        });
      });
    });
    for (let j = 0; j < d; j++) {
      for (let l = 0; l < d; l++)
        a[j * d + l] = ((_a = a[j * d + l]) != null ? _a : 0) - total * ((_b = xMean[j]) != null ? _b : 0) * ((_c = xMean[l]) != null ? _c : 0);
      a[j * d + j] = ((_d = a[j * d + j]) != null ? _d : 0) + alpha;
    }
    return solveSpd(a, b, d);
  }
  function solveSpd(a, b, n) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l;
    const l = new Float64Array(n * n);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let s = (_a = a[i * n + j]) != null ? _a : 0;
        for (let k = 0; k < j; k++) s -= ((_b = l[i * n + k]) != null ? _b : 0) * ((_c = l[j * n + k]) != null ? _c : 0);
        if (i === j) {
          if (s <= 0) throw new Error("matrix is not positive definite");
          l[i * n + i] = Math.sqrt(s);
        } else {
          l[i * n + j] = s / ((_d = l[j * n + j]) != null ? _d : 1);
        }
      }
    }
    const z = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let s = (_e = b[i]) != null ? _e : 0;
      for (let k = 0; k < i; k++) s -= ((_f = l[i * n + k]) != null ? _f : 0) * ((_g = z[k]) != null ? _g : 0);
      z[i] = s / ((_h = l[i * n + i]) != null ? _h : 1);
    }
    const x = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) {
      let s = (_i = z[i]) != null ? _i : 0;
      for (let k = i + 1; k < n; k++) s -= ((_j = l[k * n + i]) != null ? _j : 0) * ((_k = x[k]) != null ? _k : 0);
      x[i] = s / ((_l = l[i * n + i]) != null ? _l : 1);
    }
    return x;
  }
  function toMap(r) {
    const m = /* @__PURE__ */ new Map();
    r.indices.forEach((j, k) => {
      var _a;
      m.set(j, (_a = r.values[k]) != null ? _a : 0);
    });
    return m;
  }
  function sparseDot(r, other) {
    let s = 0;
    r.indices.forEach((j, k) => {
      var _a, _b;
      s += ((_a = r.values[k]) != null ? _a : 0) * ((_b = other.get(j)) != null ? _b : 0);
    });
    return s;
  }

  // ../engine/src/taste.ts
  var DEFAULT_MEAN = 70;
  var MIN_EXAMPLES = 5;
  var COMMUNITY_WEIGHT = 0.6;
  var FULL_LIST = 150;
  var MAX_COMMUNITY_WEIGHT = 3;
  function communityWeight(labelled) {
    const scale = FULL_LIST / Math.max(labelled, 1);
    return Math.min(MAX_COMMUNITY_WEIGHT, COMMUNITY_WEIGHT * Math.max(1, scale));
  }
  function isLiked(ex) {
    return ex.target >= 0;
  }
  var DEFAULT_LABELS = {
    rewatchBonus: 1,
    tentativeWeight: 0.7,
    rewatched: [1.5, 0.8],
    completed: [1, 0.7],
    dropBase: -1,
    dropSlope: 3,
    paused: [-0.5, 0.3],
    current: [0.5, 0.3],
    notInterested: [-2, 0.6]
  };
  function userMean(entries) {
    const scores = entries.filter((e) => e.score > 0).map((e) => e.score);
    return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : DEFAULT_MEAN;
  }
  function label(entry, media, mean, labels = DEFAULT_LABELS) {
    const rewatched = entry.repeat > 0 || entry.status === "REPEATING";
    if (entry.status === "PLANNING") return null;
    if (entry.score > 0) {
      let target = (entry.score - mean) / 10;
      if (rewatched) target += labels.rewatchBonus;
      const tentative = entry.status === "CURRENT" || entry.status === "PAUSED";
      return [target, tentative ? labels.tentativeWeight : 1];
    }
    if (rewatched) return labels.rewatched;
    if (entry.status === "COMPLETED") return labels.completed;
    if (entry.status === "DROPPED") {
      const early = 1 - progressFraction(entry, media);
      return [labels.dropBase - labels.dropSlope * early, 1];
    }
    if (entry.status === "PAUSED") return labels.paused;
    return labels.current;
  }
  function progressFraction(entry, media) {
    const length = mediaLength(media);
    if (length) return Math.min(entry.progress / length, 1);
    const fairGo = media.type === "ANIME" ? 12 : 50;
    return Math.min(entry.progress / fairGo, 1);
  }
  function examples(entries, media, labels = DEFAULT_LABELS) {
    const mean = userMean(entries);
    const out = [];
    for (const e of entries) {
      const m = media.get(e.mediaId);
      const labelled = m ? label(e, m, mean, labels) : null;
      if (m && labelled)
        out.push({ media: m, target: labelled[0], weight: labelled[1], scored: e.score > 0 });
    }
    return out;
  }
  function notInterestedExamples(media, labels = DEFAULT_LABELS) {
    const [target, weight] = labels.notInterested;
    return media.map((m) => ({ media: m, target, weight, scored: false }));
  }
  function features(media) {
    const f = /* @__PURE__ */ new Map();
    for (const g of media.genres) f.set(`genre:${g}`, 1);
    for (const t of media.tags) f.set(`tag:${t.name}`, t.rank / 100);
    for (const s of media.studios) f.set(`studio:${s}`, 1);
    if (media.format) f.set(`format:${media.format}`, 1);
    if (media.year) f.set(`decade:${Math.floor(media.year / 10) * 10}s`, 1);
    return f;
  }
  var NotEnoughHistory = class extends Error {
    constructor(message) {
      super(message);
      this.name = "NotEnoughHistory";
    }
  };
  var TasteModel = class {
    constructor(alpha = 10, minFeatureCount = 1) {
      __publicField(this, "alpha");
      __publicField(this, "minFeatureCount");
      __publicField(this, "vocabulary", /* @__PURE__ */ new Map());
      __publicField(this, "names", []);
      __publicField(this, "fit_", null);
      this.alpha = alpha;
      this.minFeatureCount = minFeatureCount;
    }
    /** Fit on examples; features seen on fewer than `minFeatureCount` titles are dropped. */
    fit(train) {
      var _a;
      if (train.length < MIN_EXAMPLES) {
        throw new NotEnoughHistory(`need at least ${MIN_EXAMPLES} rated titles, got ${train.length}`);
      }
      const dicts = train.map((ex) => features(ex.media));
      const counts = /* @__PURE__ */ new Map();
      for (const d of dicts) for (const k of d.keys()) counts.set(k, ((_a = counts.get(k)) != null ? _a : 0) + 1);
      this.names = [...counts].filter(([, c]) => c >= this.minFeatureCount).map(([k]) => k).sort(byCodePoint);
      this.vocabulary = new Map(this.names.map((k, i) => [k, i]));
      this.fit_ = fitRidge(
        dicts.map((d) => this.row(d)),
        train.map((ex) => ex.target),
        train.map((ex) => ex.weight),
        this.alpha,
        this.names.length
      );
      return this;
    }
    /** Predicted liking for each title (points out of 10, relative to the user's mean). */
    predict(items) {
      const fit = this.fitted();
      return items.map((m) => predictRow(fit, this.row(features(m))));
    }
    /** Each known feature's contribution to a title's prediction, largest first. */
    contributions(media) {
      var _a;
      const fit = this.fitted();
      const out = [];
      for (const [k, v] of features(media)) {
        const i = this.vocabulary.get(k);
        if (i !== void 0) out.push([k, v * ((_a = fit.coef[i]) != null ? _a : 0)]);
      }
      return out.sort((a, b) => b[1] - a[1]);
    }
    /** All feature weights, most liked first. */
    weights() {
      const fit = this.fitted();
      return this.names.map((k, i) => {
        var _a;
        return [k, (_a = fit.coef[i]) != null ? _a : 0];
      }).sort((a, b) => b[1] - a[1]);
    }
    row(f) {
      const row = { indices: [], values: [] };
      for (const [k, v] of f) {
        const i = this.vocabulary.get(k);
        if (i !== void 0) {
          row.indices.push(i);
          row.values.push(v);
        }
      }
      return row;
    }
    fitted() {
      if (!this.fit_) throw new Error("TasteModel used before fit()");
      return this.fit_;
    }
  };
  function byCodePoint(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
  }

  // ../engine/src/recommend.ts
  var UNFINISHED = /* @__PURE__ */ new Map([
    ["PLANNING", "on your planning list"],
    ["CURRENT", "in progress on your list"],
    ["PAUSED", "paused on your list"]
  ]);
  var FINISHED = /* @__PURE__ */ new Set(["COMPLETED", "REPEATING"]);
  var HIDDEN_REASONS = ["format:", "decade:"];
  function buildProfile(entries, media, otherEntries = [], otherMedia = /* @__PURE__ */ new Map(), notInterested = []) {
    const own = examples(entries, media);
    if (own.length < MIN_EXAMPLES) {
      throw new NotEnoughHistory(`need at least ${MIN_EXAMPLES} rated titles, got ${own.length}`);
    }
    const listed = new Set([...entries, ...otherEntries].map((e) => e.mediaId));
    const unique = [...new Map(notInterested.map((m) => [m.id, m])).values()];
    const dismissed = unique.filter((m) => !listed.has(m.id)).sort((a, b) => a.id - b.id);
    const model = new TasteModel().fit([
      ...own,
      ...examples(otherEntries, otherMedia),
      ...notInterestedExamples(dismissed)
    ]);
    const likedIds = new Set(own.filter(isLiked).map((ex) => ex.media.id));
    return { model, entries, media, likedIds, communityWeight: communityWeight(own.length) };
  }
  function discoveryTags(model, n = 3) {
    const tags = model.weights().filter(([k]) => k.startsWith("tag:")).map(([k, w]) => [k.slice(4), w]);
    return {
      liked: tags.filter(([, w]) => w > 0).slice(0, n).map(([t]) => t),
      disliked: tags.filter(([, w]) => w < 0).reverse().slice(0, n).map(([t]) => t)
    };
  }
  function candidateSources(profile, links, options = {}) {
    var _a;
    const sources = /* @__PURE__ */ new Map();
    const add = (id, source) => {
      var _a2;
      return sources.set(id, [...(_a2 = sources.get(id)) != null ? _a2 : [], source]);
    };
    const ordered = [...links].sort((a, b) => b[2] - a[2] || a[0] - b[0]);
    for (const [from, to, rating] of ordered) {
      const liked = profile.media.get(from);
      if (rating > 0 && liked && profile.likedIds.has(from)) add(to, `liked ${liked.title}`);
    }
    for (const [id, source] of (_a = options.extra) != null ? _a : []) add(id, source);
    if (options.includeListed) {
      for (const e of profile.entries) {
        const source = UNFINISHED.get(e.status);
        if (source) add(e.mediaId, source);
      }
    }
    return sources;
  }
  function seriesStart(media, statuses, lookup) {
    let current = media;
    const seen = /* @__PURE__ */ new Set([media.id]);
    for (let i = 0; i < MAX_CHAIN; i++) {
      const prequels = prequelIds(current);
      if (prequels.every((p) => FINISHED.has(statuses.get(p)))) return current.id;
      if (prequels.some((p) => statuses.has(p) && !FINISHED.has(statuses.get(p))))
        return null;
      const unlisted = prequels.filter((p) => !statuses.has(p) && !seen.has(p)).sort((a, b) => a - b);
      const next = unlisted.length ? lookup(unlisted.slice(0, 1)).values().next().value : void 0;
      if (!next) return null;
      current = next;
      seen.add(current.id);
    }
    return null;
  }
  function seriesStarts(sources, statuses, lookup) {
    var _a;
    const media = lookup(sources.keys());
    const moved = /* @__PURE__ */ new Map();
    for (const [id, found] of sources) {
      const m = media.get(id);
      const target = !m || statuses.has(id) ? id : seriesStart(m, statuses, lookup);
      if (target === null) continue;
      const into = (_a = moved.get(target)) != null ? _a : [];
      for (const s of found) if (!into.includes(s)) into.push(s);
      moved.set(target, into);
    }
    return moved;
  }
  function rank(profile, sources, media, options = {}) {
    var _a, _b;
    const statuses = new Map(profile.entries.map((e) => [e.mediaId, e.status]));
    const lookup = (_a = options.lookup) != null ? _a : (() => /* @__PURE__ */ new Map());
    const find = (ids) => {
      const found = /* @__PURE__ */ new Map();
      const rest = [];
      for (const id of ids) {
        const m = media.get(id);
        if (m) found.set(id, m);
        else rest.push(id);
      }
      for (const [id, m] of lookup(rest)) found.set(id, m);
      return found;
    };
    const moved = seriesStarts(sources, statuses, find);
    const candidates = [];
    for (const id of moved.keys()) {
      const m = find([id]).get(id);
      if (!m) continue;
      const status = statuses.get(m.id);
      const listedOk = status === void 0 || Boolean(options.includeListed) && UNFINISHED.has(status);
      if (listedOk && (options.includeAdult || !m.isAdult) && prequelIds(m).every((p) => FINISHED.has(statuses.get(p))) && !(options.exclusions && blocks(options.exclusions, m, lookup)) && (!options.accept || options.accept(m))) {
        candidates.push(m);
      }
    }
    const predicted = profile.model.predict(candidates);
    const ranked = candidates.map((m, i) => {
      var _a2, _b2, _c;
      const community = (((_a2 = m.averageScore) != null ? _a2 : 70) - 70) / 10;
      const spoilers = new Set(m.tags.filter((t) => t.spoiler).map((t) => `tag:${t.name}`));
      const reasons = profile.model.contributions(m).filter(([k, c]) => c > 0 && !spoilers.has(k) && !HIDDEN_REASONS.some((p) => k.startsWith(p))).slice(0, 3).map(([k]) => {
        const at = k.indexOf(":");
        return { kind: k.slice(0, at), value: k.slice(at + 1) };
      });
      return {
        media: m,
        score: ((_b2 = predicted[i]) != null ? _b2 : 0) + profile.communityWeight * community,
        reasons,
        sources: (_c = moved.get(m.id)) != null ? _c : []
      };
    });
    return ranked.sort((a, b) => b.score - a.score).slice(0, (_b = options.limit) != null ? _b : 20);
  }

  // ../engine/src/sync.ts
  var PER_CHUNK = 500;
  var PAGE_SIZE = 50;
  var MEDIA_MAX_AGE_MS = 30 * 24 * 3600 * 1e3;
  async function syncList(client, store, user, type, progress = () => {
  }) {
    var _a;
    const entries = [];
    const media = [];
    const links = /* @__PURE__ */ new Map();
    const custom = /* @__PURE__ */ new Map();
    const seen = /* @__PURE__ */ new Set();
    for (let chunkNo = 1; ; chunkNo++) {
      progress(`Reading your ${type.toLowerCase()} list`);
      const data = await client.query(USER_LIST, {
        userName: user,
        type,
        chunk: chunkNo,
        perChunk: PER_CHUNK
      });
      const chunk2 = parseListChunk(data);
      for (const [i, e] of chunk2.entries.entries()) {
        if (seen.has(e.mediaId)) continue;
        seen.add(e.mediaId);
        entries.push(e);
        const m = chunk2.media[i];
        if (m) media.push(m);
      }
      for (const [id, to] of chunk2.recommendations) links.set(id, to);
      for (const [name, ids] of chunk2.customLists)
        custom.set(name, /* @__PURE__ */ new Set([...(_a = custom.get(name)) != null ? _a : [], ...ids]));
      if (!chunk2.hasNext) break;
    }
    await store.putMedia(media);
    await store.putList(user, type, entries);
    await store.putRecommendations(links);
    await store.putCustomLists(user, type, custom);
    const byId = new Map(media.map((m) => [m.id, m]));
    const fetched = await fetchCandidates(client, store, entries, byId, links, progress);
    return { entries: entries.length, candidatesFetched: fetched };
  }
  async function syncEntries(client, store, user, type, given, customLists = /* @__PURE__ */ new Map(), progress = () => {
  }, maxAgeMs = MEDIA_MAX_AGE_MS) {
    var _a;
    const seen = /* @__PURE__ */ new Set();
    const entries = given.filter((e) => !seen.has(e.mediaId) && Boolean(seen.add(e.mediaId)));
    await store.putList(user, type, entries);
    await store.putCustomLists(user, type, customLists);
    const ids = entries.map((e) => e.mediaId);
    const linked2 = new Set((await store.recommendationsFrom(ids)).map(([from]) => from));
    const todo = /* @__PURE__ */ new Set([
      ...await store.missingOrStale(ids, maxAgeMs),
      ...ids.filter((id) => !linked2.has(id))
    ]);
    const order = ids.filter((id) => todo.has(id));
    const what = `Fetching details of your ${type === "ANIME" ? "anime" : "manga"} list`;
    await fetchByIds(
      client,
      MEDIA_WITH_RECS_BY_IDS,
      order,
      async (nodes) => {
        await store.putMedia(nodes.map(parseMedia));
        await store.putRecommendations(new Map(nodes.map((n) => [n.id, parseRecommendations(n)])));
      },
      (done, total) => progress(what, done, total)
    );
    const byId = await store.getMedia(ids);
    const links = /* @__PURE__ */ new Map();
    for (const [from, to, rating] of await store.recommendationsFrom(ids))
      links.set(from, [...(_a = links.get(from)) != null ? _a : [], [to, rating]]);
    const fetched = await fetchCandidates(client, store, entries, byId, links, progress);
    return { entries: entries.length, candidatesFetched: fetched };
  }
  async function fetchCandidates(client, store, entries, byId, links, progress) {
    const liked = new Set(
      examples(entries, byId).filter(isLiked).map((ex) => ex.media.id)
    );
    const wanted = /* @__PURE__ */ new Set();
    for (const [from, to] of links)
      if (liked.has(from)) {
        for (const [id] of to) if (!byId.has(id)) wanted.add(id);
      }
    return fetchMedia(
      client,
      store,
      wanted,
      MEDIA_MAX_AGE_MS,
      (done, total) => progress("Fetching recommended titles", done, total)
    );
  }
  async function fetchMedia(client, store, ids, maxAgeMs = MEDIA_MAX_AGE_MS, onBatch = () => {
  }) {
    const todo = await store.missingOrStale(ids, maxAgeMs);
    await fetchByIds(
      client,
      MEDIA_BY_IDS,
      todo,
      async (nodes) => store.putMedia(nodes.map(parseMedia)),
      onBatch
    );
    return todo.length;
  }
  async function fetchByIds(client, query, ids, onReply, onProgress) {
    const requests = chunk(chunk(ids, PAGE_SIZE), PAGES_PER_REQUEST);
    if (!requests.length) return;
    let done = 0;
    onProgress(0, requests.length);
    await Promise.all(
      requests.map(async (pages) => {
        const replies = await client.queryMany(
          query,
          pages.map((batch) => ({ ids: batch, page: 1, perPage: PAGE_SIZE }))
        );
        await onReply(replies.flatMap((r) => r.Page.media));
        onProgress(++done, requests.length);
      })
    );
  }
  async function discoverMany(client, store, type, searches) {
    const runs = searches.map((s) => {
      var _a, _b;
      return {
        type,
        page: (_a = s.page) != null ? _a : 1,
        perPage: (_b = s.perPage) != null ? _b : PAGE_SIZE,
        ...Object.fromEntries(Object.entries(s.variables).filter(([, v]) => isSet(v)))
      };
    });
    const replies = await Promise.all(
      chunk(runs, PAGES_PER_REQUEST).map((group) => client.queryMany(DISCOVER, group))
    );
    const found = replies.flat().map((r) => r.Page.media.map(parseMedia));
    await store.putMedia(found.flat());
    return found;
  }
  function isSet(v) {
    return Array.isArray(v) ? v.length > 0 : v !== null && v !== void 0 && v !== false && v !== 0 && v !== "";
  }

  // ../engine/src/pipeline.ts
  var FILTER_PAGES = 6;
  var CATEGORIES_MAX_AGE_MS = 30 * 24 * 3600 * 1e3;
  var NoSyncedList = class extends Error {
    constructor(message) {
      super(message);
      this.name = "NoSyncedList";
    }
  };
  function makeRunOptions(given = {}) {
    return { limit: 20, discover: true, includeAdult: false, filters: makeFilters(), ...given };
  }
  async function run(store, client, user, type, options = makeRunOptions(), progress = () => {
  }) {
    var _a, _b, _c;
    const entries = await store.getList(user, type);
    if (!entries.length) throw new NoSyncedList(`no synced ${type.toLowerCase()} list for ${user}`);
    const otherEntries = await store.getList(user, otherType(type));
    const cache2 = /* @__PURE__ */ new Map();
    await load(
      store,
      cache2,
      [...entries, ...otherEntries].map((e) => e.mediaId)
    );
    const dismissedIds = (_a = (await store.getExclusions(user)).notInterested) != null ? _a : [];
    await load(store, cache2, dismissedIds);
    const dismissed = dismissedIds.flatMap((id) => {
      const m = cache2.get(id);
      return m ? [m] : [];
    });
    const profile = buildProfile(entries, cache2, otherEntries, cache2, dismissed);
    const online = options.discover ? client : null;
    const onList = new Set(entries.map((e) => e.mediaId));
    const { filters } = options;
    const extra = [];
    const warnings = [];
    let excluded;
    try {
      excluded = await loadExclusions(store, user, type, cache2, online);
    } catch (e) {
      if (!(e instanceof AniListError)) throw e;
      warnings.push(`sequels of excluded titles may be missed: ${e.message}`);
      excluded = await loadExclusions(store, user, type, cache2, null);
    }
    const required = requiredLabels(filters);
    excluded = {
      ...excluded,
      labels: new Set(
        [...excluded.labels, ...(_b = filters.exclude) != null ? _b : []].filter((k) => !required.has(k))
      )
    };
    let themes;
    try {
      themes = new Themes(await tagCategories(store, online));
    } catch (e) {
      if (!(e instanceof AniListError)) throw e;
      warnings.push(`main themes judged without tag categories: ${e.message}`);
      themes = new Themes(await tagCategories(store, null));
    }
    try {
      const { liked, disliked } = discoveryTags(profile.model);
      const banned = excludedTags(excluded);
      const base = {
        tagNotIn: [.../* @__PURE__ */ new Set([...disliked, ...banned])].sort(),
        genreNotIn: excludedGenres(excluded),
        idNotIn: [.../* @__PURE__ */ new Set([...onList, ...excluded.mediaIds])].sort((a, b) => a - b),
        ...filterQueryVariables(filters)
      };
      if (online) {
        const tags = liked.filter((t) => !banned.includes(t));
        const tagSearches = tags.map((tag) => ({
          variables: { ...base, tagIn: [tag, ...filters.tags] },
          perPage: 30
        }));
        const asked = { ...base, tagNotIn: [...banned].sort() };
        const filterSearches = !filtersActive(filters) ? [] : filters.countries.length > 1 ? filters.countries.map((c) => ({ ...asked, countryOfOrigin: c })) : [asked];
        progress(tagSearches.length ? "Searching AniList by your top tags" : "Searching AniList");
        const first = await discoverMany(online, store, type, [
          ...tagSearches,
          ...filterSearches.map((variables) => ({ variables, perPage: 50, page: 1 }))
        ]);
        for (const [i, tag] of tags.entries())
          for (const m of (_c = first[i]) != null ? _c : []) extra.push([m.id, `top-scored with ${tag}`]);
        const forFilters = (found) => {
          for (const m of found) extra.push([m.id, "top-scored for your filters"]);
          return found.filter((m) => filterAccepts(filters, m, themes)).length;
        };
        const more = filterSearches.flatMap((variables, j) => {
          var _a2;
          const found = (_a2 = first[tags.length + j]) != null ? _a2 : [];
          const passed = forFilters(found);
          if (found.length < 50 || passed >= options.limit) return [];
          return Array.from({ length: FILTER_PAGES - 1 }, (_, k) => ({
            variables,
            perPage: 50,
            page: k + 2
          }));
        });
        if (more.length) {
          progress("Searching AniList with your filters");
          for (const found of await discoverMany(online, store, type, more)) forFilters(found);
        }
      }
    } catch (e) {
      if (!(e instanceof AniListError)) throw e;
      warnings.push(`some candidates skipped: ${e.message}`);
    }
    progress("Ranking");
    const links = await store.recommendationsFrom(profile.likedIds);
    const sources = candidateSources(profile, links, { extra, includeListed: !filters.hideListed });
    await load(store, cache2, sources.keys());
    await loadPrequelChains(store, cache2, sources.keys(), online, warnings);
    let seen = null;
    if (filters.hideSeenAdaptations) {
      if (await store.lastSynced(user, otherType(type)) === null) {
        const other = otherType(type).toLowerCase();
        warnings.push(`sync your ${other} list to hide titles you've finished as ${other}`);
      } else {
        seen = await loadSeenAdaptations(store, cache2, otherEntries, type);
      }
    }
    const listed = filters.hideListed ? await loadListedVersions(store, cache2, entries, type) : null;
    const active = filtersActive(filters);
    const accept = (m) => (!active || filterAccepts(filters, m, themes)) && scoreAccepts(filters, m) && !(seen && blocksSeen(seen, m)) && !(listed && blocksSeen(listed, m));
    let recs = rank(profile, sources, cache2, {
      limit: options.limit,
      includeAdult: options.includeAdult,
      exclusions: excluded,
      lookup: lookupIn(cache2),
      accept,
      includeListed: !filters.hideListed
    });
    if (online) recs = await fillDetails(online, store, recs, warnings);
    return { recommendations: recs, profile, warnings };
  }
  async function loadExclusions(store, user, type, cache2, client) {
    var _a;
    const saved = await store.getExclusions(user);
    const roots = new Set(saved.titles);
    const lists = await store.getCustomLists(user, type);
    for (const name of saved.customLists[type]) for (const id of (_a = lists.get(name)) != null ? _a : []) roots.add(id);
    const fetchMissing = async (ids) => {
      if (client) await fetchMedia(client, store, ids);
      await load(store, cache2, ids, true);
    };
    return {
      mediaIds: await sequelClosure(roots, lookupIn(cache2), fetchMissing),
      labels: new Set(saved.labels)
    };
  }
  async function tagCategories(store, client) {
    const cached = await store.getMeta("tag_categories");
    if (cached) {
      const saved = JSON.parse(cached);
      if (!client || Date.now() - saved.at < CATEGORIES_MAX_AGE_MS) return saved.categories;
    }
    if (!client) return {};
    const data = await client.query(
      TAG_COLLECTION
    );
    const categories = Object.fromEntries(data.MediaTagCollection.map((t) => [t.name, t.category]));
    await store.setMeta("tag_categories", JSON.stringify({ at: Date.now(), categories }));
    return categories;
  }
  async function fillDetails(client, store, recs, warnings) {
    const missing = recs.filter((r) => !r.media.coverUrl || r.media.scoreDistribution === null).map((r) => r.media.id);
    if (!missing.length) return recs;
    try {
      await fetchMedia(client, store, missing, 0);
    } catch (e) {
      if (!(e instanceof AniListError)) throw e;
      warnings.push(`some covers and ratings skipped: ${e.message}`);
      return recs;
    }
    const fresh = await store.getMedia(missing);
    return recs.map((r) => {
      var _a;
      return { ...r, media: (_a = fresh.get(r.media.id)) != null ? _a : r.media };
    });
  }
  async function load(store, cache2, ids, refresh = false) {
    const todo = [...ids].filter((id) => refresh || !cache2.has(id));
    for (const [id, m] of await store.getMedia(todo)) cache2.set(id, m);
  }
  async function loadPrequelChains(store, cache2, start2, client, warnings) {
    const seen = new Set(start2);
    let frontier = new Set(seen);
    for (let i = 0; i < MAX_CHAIN && frontier.size; i++) {
      const next = /* @__PURE__ */ new Set();
      for (const id of frontier) {
        const m = cache2.get(id);
        if (m) {
          for (const p of prequelIds(m)) if (!seen.has(p)) next.add(p);
        }
      }
      if (!next.size) break;
      if (client) {
        try {
          await fetchMedia(client, store, next);
        } catch (e) {
          if (!(e instanceof AniListError)) throw e;
          warnings.push(`first seasons of some sequels may be missed: ${e.message}`);
          client = null;
        }
      }
      await load(store, cache2, next);
      for (const id of next) seen.add(id);
      frontier = next;
    }
  }
  async function loadSeenAdaptations(store, cache2, otherEntries, type) {
    const first = seenAdaptations(otherEntries, type, lookupIn(cache2));
    await load(store, cache2, first.linked);
    return seenAdaptations(otherEntries, type, lookupIn(cache2));
  }
  async function loadListedVersions(store, cache2, entries, type) {
    const first = listedVersions(entries, type, lookupIn(cache2));
    await load(store, cache2, first.linked);
    return listedVersions(entries, type, lookupIn(cache2));
  }
  function lookupIn(cache2) {
    return (ids) => new Map(
      [...ids].flatMap(
        (id) => cache2.has(id) ? [[id, cache2.get(id)]] : []
      )
    );
  }

  // ../engine/src/store.ts
  function emptyExclusions() {
    return { titles: [], labels: [], customLists: { ANIME: [], MANGA: [] }, notInterested: [] };
  }
  var MemoryStore = class _MemoryStore {
    /** `now` is the clock in ms since the epoch; replaceable in tests. */
    constructor(now = Date.now) {
      __publicField(this, "media", /* @__PURE__ */ new Map());
      __publicField(this, "lists", /* @__PURE__ */ new Map());
      __publicField(this, "links", /* @__PURE__ */ new Map());
      __publicField(this, "customLists", /* @__PURE__ */ new Map());
      __publicField(this, "exclusions", /* @__PURE__ */ new Map());
      __publicField(this, "meta", /* @__PURE__ */ new Map());
      __publicField(this, "now");
      this.now = now;
    }
    async getMedia(ids) {
      const out = /* @__PURE__ */ new Map();
      for (const id of ids) {
        const hit = this.media.get(id);
        if (hit) out.set(id, hit.media);
      }
      return out;
    }
    async putMedia(items) {
      const at = this.now();
      for (const m of items) this.media.set(m.id, { media: m, fetchedAt: at });
    }
    async missingOrStale(ids, maxAgeMs) {
      const cutoff = this.now() - maxAgeMs;
      return [...new Set(ids)].filter((id) => {
        var _a, _b;
        return ((_b = (_a = this.media.get(id)) == null ? void 0 : _a.fetchedAt) != null ? _b : -Infinity) < cutoff;
      }).sort((a, b) => a - b);
    }
    async getList(user, type) {
      var _a, _b;
      return [...(_b = (_a = this.lists.get(listKey(user, type))) == null ? void 0 : _a.entries) != null ? _b : []];
    }
    async putList(user, type, entries) {
      this.lists.set(listKey(user, type), { entries: [...entries], syncedAt: this.now() });
    }
    async lastSynced(user, type) {
      var _a, _b;
      return (_b = (_a = this.lists.get(listKey(user, type))) == null ? void 0 : _a.syncedAt) != null ? _b : null;
    }
    async putRecommendations(links) {
      for (const [from, to] of links) this.links.set(from, [...to]);
    }
    async recommendationsFrom(ids) {
      return [...new Set(ids)].flatMap(
        (from) => {
          var _a;
          return ((_a = this.links.get(from)) != null ? _a : []).map(([to, r]) => [from, to, r]);
        }
      );
    }
    async getCustomLists(user, type) {
      var _a;
      const saved = (_a = this.customLists.get(listKey(user, type))) != null ? _a : /* @__PURE__ */ new Map();
      return new Map([...saved].map(([name, ids]) => [name, new Set(ids)]));
    }
    async putCustomLists(user, type, lists) {
      this.customLists.set(
        listKey(user, type),
        new Map([...lists].map(([name, ids]) => [name, new Set(ids)]))
      );
    }
    async getExclusions(user) {
      var _a;
      return structuredClone((_a = this.exclusions.get(user.toLowerCase())) != null ? _a : emptyExclusions());
    }
    async putExclusions(user, exclusions) {
      this.exclusions.set(user.toLowerCase(), structuredClone(exclusions));
    }
    async getMeta(key) {
      var _a;
      return (_a = this.meta.get(key)) != null ? _a : null;
    }
    async setMeta(key, value) {
      this.meta.set(key, value);
    }
    /** Everything as plain JSON, for saving. */
    toJSON() {
      return {
        media: [...this.media],
        lists: [...this.lists],
        links: [...this.links],
        customLists: [...this.customLists].map(([k, lists]) => [
          k,
          [...lists].map(([n, ids]) => [n, [...ids]])
        ]),
        exclusions: [...this.exclusions],
        meta: [...this.meta]
      };
    }
    /** Restore a store saved with `toJSON`. */
    static fromJSON(data, now = Date.now) {
      const s = new _MemoryStore(now);
      s.media = new Map(data.media);
      s.lists = new Map(data.lists);
      s.links = new Map(data.links);
      s.customLists = new Map(
        data.customLists.map(([k, lists]) => [
          k,
          new Map(lists.map(([n, ids]) => [n, new Set(ids)]))
        ])
      );
      s.exclusions = new Map(data.exclusions);
      s.meta = new Map(data.meta);
      return s;
    }
  };
  function listKey(user, type) {
    return `${user.toLowerCase()}:${type}`;
  }

  // ../ui/src/session.ts
  var TYPES = ["ANIME", "MANGA"];
  var DEFAULT_SETTINGS = {
    limit: 20,
    includeAdult: false,
    showRatings: true,
    titleLanguage: "english",
    advancedOpen: false,
    filters: { ANIME: makeFilters(), MANGA: makeFilters() },
    tourSeen: false
  };
  var POOL = 200;
  var SETTINGS_KEY = "ui-settings";
  var SYNCED_KEY = "ui-synced-at";
  var SAVE_DELAY_MS = 800;
  var Session = class _Session {
    constructor(host, store, user, client) {
      __publicField(this, "host", host);
      __publicField(this, "store", store);
      __publicField(this, "user", user);
      __publicField(this, "client");
      __publicField(this, "saveTimer", null);
      __publicField(this, "themes", null);
      __publicField(this, "details", /* @__PURE__ */ new Map());
      __publicField(this, "taste", /* @__PURE__ */ new Map());
      this.client = client != null ? client : new AniListClient(host.transport);
    }
    /** Open the saved store for `user` (or start an empty one). */
    static async open(host, user, client) {
      const saved = await host.loadStore();
      const store = saved ? MemoryStore.fromJSON(JSON.parse(saved)) : new MemoryStore();
      return new _Session(host, store, user, client);
    }
    /** When both lists were last synced; adding to planning doesn't count as a sync. */
    async lastSynced() {
      const at = await this.store.getMeta(SYNCED_KEY);
      return at ? Number(at) : null;
    }
    /** Sync both lists; from the host when it has them, else from AniList by username. */
    async sync(progress = () => {
    }) {
      for (const type of TYPES) {
        progress(`Reading your ${type.toLowerCase()} list`);
        if (this.host.list) {
          const list = await this.host.list(type);
          const custom = new Map(Object.entries(list.customLists).map(([k, v]) => [k, new Set(v)]));
          await syncEntries(this.client, this.store, this.user, type, list.entries, custom, progress);
        } else {
          await syncList(this.client, this.store, this.user, type, progress);
        }
        this.taste.delete(type);
      }
      await this.store.setMeta(SYNCED_KEY, String(Date.now()));
      await this.save(true);
    }
    async settings() {
      var _a, _b, _c, _d;
      const raw = await this.store.getMeta(SETTINGS_KEY);
      if (!raw) return structuredClone(DEFAULT_SETTINGS);
      const saved = JSON.parse(raw);
      return {
        ...DEFAULT_SETTINGS,
        ...saved,
        filters: {
          ANIME: makeFilters((_b = (_a = saved.filters) == null ? void 0 : _a.ANIME) != null ? _b : {}),
          MANGA: makeFilters((_d = (_c = saved.filters) == null ? void 0 : _c.MANGA) != null ? _d : {})
        }
      };
    }
    async setSettings(settings) {
      await this.store.setMeta(SETTINGS_KEY, JSON.stringify(settings));
      await this.save();
    }
    /** The saved picks for a type, if any. */
    async picks(type) {
      const raw = await this.store.getMeta(`ui-picks:${type}`);
      return raw ? JSON.parse(raw) : null;
    }
    /** Run the engine and keep up to `pool` picks; `null` when that list isn't synced yet. */
    async recommend(type, progress = () => {
    }, pool = POOL) {
      const s = await this.settings();
      let result;
      try {
        result = await run(
          this.store,
          this.client,
          this.user,
          type,
          makeRunOptions({ limit: pool, includeAdult: s.includeAdult, filters: s.filters[type] }),
          progress
        );
      } catch (e) {
        if (e instanceof NoSyncedList) return null;
        throw e;
      }
      this.taste.set(type, tasteOf(result));
      const picks = {
        at: Date.now(),
        recommendations: result.recommendations,
        warnings: result.warnings
      };
      await this.store.setMeta(`ui-picks:${type}`, JSON.stringify(picks));
      await this.save();
      return picks;
    }
    /** What the model learned for a type; runs offline if there's no run yet this session. */
    async tasteFor(type) {
      const known = this.taste.get(type);
      if (known) return known;
      try {
        const result = await run(this.store, null, this.user, type, makeRunOptions({ limit: 1 }));
        const taste = tasteOf(result);
        this.taste.set(type, taste);
        return taste;
      } catch (e) {
        if (e instanceof NoSyncedList) return null;
        throw e;
      }
    }
    /** Genre strengths and main themes of a title. */
    async themesOf(media) {
      if (!this.themes) {
        const categories = await tagCategories(this.store, null);
        if (!Object.keys(categories).length) return new Themes(categories).summary(media);
        this.themes = new Themes(categories);
      }
      return this.themes.summary(media);
    }
    /** Every AniList tag name, for the tag picker; fetched once and cached for 30 days. */
    async tagNames() {
      try {
        return Object.keys(await tagCategories(this.store, this.client)).sort();
      } catch (e) {
        return Object.keys(await tagCategories(this.store, null)).sort();
      }
    }
    /** Remove picks matching `drop` from saved picks (both types unless given); returns what's left. */
    async dropPicks(drop, types = TYPES) {
      const left = {};
      for (const type of TYPES) {
        const picks = await this.picks(type);
        if (!picks || !types.includes(type)) {
          left[type] = picks;
          continue;
        }
        const kept = {
          ...picks,
          recommendations: picks.recommendations.filter((r) => !drop(r.media))
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
    async excludeLabels(type, keys) {
      const s = await this.settings();
      const f = s.filters[type];
      const required = requiredLabels(f);
      const excluded = keys.filter((k) => !required.has(k) && !f.exclude.includes(k));
      const settings = {
        ...s,
        filters: { ...s.filters, [type]: { ...f, exclude: [...f.exclude, ...excluded] } }
      };
      await this.setSettings(settings);
      const left = await this.dropPicks(
        (m) => {
          const labels = exclusionLabels(m);
          return excluded.some((k) => labels.has(k));
        },
        [type]
      );
      return { settings, excluded, left };
    }
    /** Labels excluded from every search (Settings → Blacklisted). */
    async blacklist(keys) {
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
    async notInterested(media) {
      await this.setExclusions((e) => {
        var _a;
        e.titles.push(media.id);
        e.notInterested = [...(_a = e.notInterested) != null ? _a : [], media.id];
      });
      return this.dropPicks((m) => m.id === media.id);
    }
    /** Exclude a title (its sequels follow on the next run) and drop it from the picks. */
    async excludeTitle(media) {
      await this.setExclusions((e) => e.titles.push(media.id));
      return this.dropPicks((m) => m.id === media.id);
    }
    /**
     * A title's synopsis, characters (with Japanese voice actors) and key staff, fetched once per
     * session in a single request when its dialog opens.
     */
    async titleDetails(id) {
      const known = this.details.get(id);
      if (known) return known;
      const data = await this.client.query(queries_exports.MEDIA_DETAILS, { id });
      const parsed = parseDetails(data.Media);
      const details = { ...parsed, description: cleanDescription(parsed.description) };
      this.details.set(id, details);
      return details;
    }
    async exclusions() {
      return this.store.getExclusions(this.user);
    }
    async setExclusions(change) {
      var _a;
      const e = structuredClone(await this.exclusions());
      change(e);
      e.titles = [...new Set(e.titles)];
      e.labels = [...new Set(e.labels)];
      e.notInterested = [...new Set((_a = e.notInterested) != null ? _a : [])];
      await this.store.putExclusions(this.user, e);
      await this.save();
      return e;
    }
    /** Custom list names per type, for the exclusions settings. */
    async customListNames(type) {
      return [...(await this.store.getCustomLists(this.user, type)).keys()].sort();
    }
    async media(ids) {
      return this.store.getMedia(ids);
    }
    /** Add to planning through the host, and to the local copy of the list. */
    async addToPlanning(media) {
      if (!this.host.addToPlanning) throw new Error("this host can't change your list");
      const list = await this.store.getList(this.user, media.type);
      if (list.some((e) => e.mediaId === media.id)) throw new Error("it's already on your list");
      await this.host.addToPlanning(media);
      const entry = {
        mediaId: media.id,
        status: "PLANNING",
        score: 0,
        progress: 0,
        repeat: 0,
        updatedAt: Math.floor(Date.now() / 1e3)
      };
      await this.store.putList(this.user, media.type, [...list, entry]);
      await this.save();
    }
    /** Forget everything for this user (settings, picks, exclusions, cache). */
    async clear() {
      await this.host.saveStore(JSON.stringify(new MemoryStore().toJSON()));
    }
    /** Save the store through the host, soon or (with `now`) at once. */
    async save(now = false) {
      if (this.saveTimer) clearTimeout(this.saveTimer);
      this.saveTimer = null;
      const write = () => this.host.saveStore(JSON.stringify(this.store.toJSON()));
      if (now) return write();
      this.saveTimer = setTimeout(() => {
        this.saveTimer = null;
        void write();
      }, SAVE_DELAY_MS);
    }
  };
  var SHOWN_MIN_TITLES = 2;
  function tasteOf(result) {
    var _a;
    const { profile } = result;
    const own = profile.entries;
    const onList = /* @__PURE__ */ new Map();
    for (const e of own) {
      const m = profile.media.get(e.mediaId);
      if (m) for (const k of features(m).keys()) onList.set(k, ((_a = onList.get(k)) != null ? _a : 0) + 1);
    }
    const shown = profile.model.weights().filter(
      ([k]) => {
        var _a2;
        return !HIDDEN_REASONS.some((p) => k.startsWith(p)) && k.includes(":") && ((_a2 = onList.get(k)) != null ? _a2 : 0) >= SHOWN_MIN_TITLES;
      }
    );
    const scored = own.filter((e) => e.score > 0);
    return {
      onList: own.length,
      scored: scored.length,
      mean: scored.length ? scored.reduce((a, e) => a + e.score, 0) / scored.length / 10 : null,
      learnedFrom: examples(own, profile.media).length,
      likes: shown.filter(([, w]) => w > 0).slice(0, 8),
      likedTags: shown.filter(([k, w]) => w > 0 && k.startsWith("tag:")).slice(0, 10).map(([k]) => k.slice(4)),
      dislikes: shown.filter(([, w]) => w < 0).sort((a, b) => a[1] - b[1]).slice(0, 8)
    };
  }
  function cleanDescription(text) {
    return text.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n").trim();
  }

  // src/protocol.ts
  var REQUEST = "rpc";
  var REPLY = "rpc-reply";
  var SEANIME_USER = "seanime";
  var STATUSES2 = /* @__PURE__ */ new Set(["CURRENT", "PLANNING", "COMPLETED", "DROPPED", "PAUSED", "REPEATING"]);
  function str(v) {
    return v === null || v === void 0 ? null : String(v);
  }
  function num(v) {
    const n = v === null || v === void 0 ? 0 : Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  function bool(v) {
    return v !== null && v !== void 0 && String(v) === "true";
  }
  function rawEntryCount(collection) {
    var _a, _b, _c, _d;
    let n = 0;
    for (const list of (_b = (_a = collection == null ? void 0 : collection.MediaListCollection) == null ? void 0 : _a.lists) != null ? _b : []) n += (_d = (_c = list.entries) == null ? void 0 : _c.length) != null ? _d : 0;
    return n;
  }
  function describe(v) {
    return `${typeof v} ${Object.prototype.toString.call(v)} "${String(v)}"`;
  }
  function toHostList(collection) {
    var _a, _b, _c, _d, _e;
    const entries = [];
    const customLists = {};
    for (const list of (_b = (_a = collection == null ? void 0 : collection.MediaListCollection) == null ? void 0 : _a.lists) != null ? _b : []) {
      const custom = bool(list.isCustomList);
      const name = str(list.name);
      for (const e of (_c = list.entries) != null ? _c : []) {
        const status = str(e.status);
        const id = num((_d = e.media) == null ? void 0 : _d.id);
        if (!id || !status || !STATUSES2.has(status)) continue;
        entries.push({
          mediaId: id,
          status,
          score: num(e.score),
          progress: num(e.progress),
          repeat: num(e.repeat),
          updatedAt: num(e.updatedAt)
        });
        if (custom && name) customLists[name] = [...(_e = customLists[name]) != null ? _e : [], id];
      }
    }
    return { entries, customLists };
  }

  // src/background.ts
  var SETUP_DELAY_MS = 5e3;
  function gojaTransport(fetch2) {
    return async (body) => {
      var _a;
      const res = await fetch2(API_URL, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const headers = (_a = res.headers) != null ? _a : {};
      return {
        status: res.status,
        header: (name) => {
          const canonical = name.toLowerCase().replace(/(^|-)([a-z])/g, (_, d, c) => d + c.toUpperCase());
          const direct = headers[canonical];
          if (direct !== void 0 && direct !== null) return String(direct);
          const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
          return key === void 0 ? null : String(headers[key]);
        },
        // Parsed here rather than with res.json(), which hands back wrapped Go maps and slices.
        json: async () => JSON.parse(res.text())
      };
    };
  }
  function prepareRuntime(setTimer, global = globalThis) {
    var _a;
    if (typeof global.setTimeout !== "function") {
      global.setTimeout = (fn, ms) => setTimer(fn, Math.max(0, Math.round(Number(ms) || 0)));
      global.clearTimeout = (cancel) => {
        if (typeof cancel === "function") cancel();
      };
    }
    if (typeof ((_a = global.performance) == null ? void 0 : _a.now) !== "function")
      global.performance = { now: () => Date.now() };
    if (typeof global.structuredClone !== "function")
      global.structuredClone = (v) => v === void 0 ? v : JSON.parse(JSON.stringify(v));
  }
  var BackgroundSetup = class {
    constructor(deps) {
      __publicField(this, "deps", deps);
      __publicField(this, "state", "off");
      __publicField(this, "progress", {});
      /** Settles when a started job ends; for tests. */
      __publicField(this, "finished", Promise.resolve());
    }
    /** Queue the job if this is a first run. */
    schedule(delayMs = SETUP_DELAY_MS) {
      if (this.deps.hasStore()) return;
      this.state = "waiting";
      this.deps.later(() => {
        this.finished = this.run();
      }, delayMs);
    }
    /**
     * Answer the page. A job still waiting to start is dropped: the page is open, and its own
     * first sync shows the loader as before, without two syncs racing.
     */
    status() {
      if (this.state === "waiting") this.state = "off";
      return this.state === "running" ? { running: true, ...this.progress } : { running: false };
    }
    async run() {
      if (this.state !== "waiting") return;
      try {
        if (!this.deps.hasList()) {
          this.deps.log("background setup skipped: no list from Seanime yet");
          return;
        }
        this.state = "running";
        const report = (step, done, total) => {
          this.progress = { step, done, total };
        };
        report("Getting ready");
        const session = await Session.open(this.deps.host, SEANIME_USER, this.deps.client);
        await session.sync(report);
        for (const type of TYPES) {
          report("Finding your picks");
          await session.recommend(type, report);
        }
        await session.save(true);
        this.deps.log("background setup done");
      } catch (e) {
        this.deps.log(`background setup failed: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        this.state = "off";
        this.progress = {};
      }
    }
  };

  // src/plugin.ts
  var STORE_KEY = "store";
  var ANILIST_ICON_URL = "https://anilist.co/img/icons/icon.svg";
  var LABEL = "Konomi.moe";
  var ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="20" height="20" style="flex-shrink:0"><path fill="currentColor" stroke="currentColor" stroke-width="1" d="M 391.5 36 Q 415.8 33.2 423 47.5 L 432 72.5 L 431 74.5 L 432 77.5 L 432 79.5 L 431 109.5 L 436.5 121 L 441.5 123 L 444.5 122 L 459.5 113 L 461.5 113 L 476.5 111 L 485.5 113 L 487.5 113 L 504 123 Q 517.4 142.8 513 181.5 L 513 183.5 L 519.5 196 Q 532.3 202.3 554.5 199 L 556.5 199 L 577.5 197 L 579.5 197 Q 614.3 191.2 628 206.5 L 636 228.5 L 635 230.5 L 635 232.5 Q 633.6 263.2 613 274 L 611 275.5 L 499.5 404 L 498 405.5 L 492 419.5 L 547.5 478 L 550.5 480 L 552 483 L 555 484.5 L 556.5 487 L 558 488.5 L 621 550.5 L 623 553.5 L 637 566 L 638.5 568 Q 661.2 581.3 668 610.5 L 667 620.5 L 668 626.5 L 657.5 645 Q 642.7 659.7 611.5 658 L 609.5 658 L 538.5 657 L 532 661.5 L 529 672.5 L 529 674.5 L 530 682.5 L 529 690.5 L 530 714.5 Q 528 738.7 516 752 L 512.5 754 Q 502.7 765.7 480.5 765 Q 451.8 760.8 438 741.5 L 436.5 740 L 417.5 720 L 405 708.5 L 403.5 707 L 402 704 L 398.5 702 L 388 692.5 L 365.5 669 L 363 667.5 L 353.5 657 L 350.5 655 L 337 642.5 L 297.5 602 L 289 595.5 L 284.5 589 L 283 587.5 L 280 586 L 277.5 582 L 273 578.5 L 271.5 577 L 259.5 564 L 250 568.5 L 248 573 L 246 574.5 L 245 577 L 243 578.5 L 241 582 L 239 583.5 L 224.5 603 L 221 606.5 L 208.5 621 L 207 622.5 L 204 627 L 202 628.5 L 186.5 648 L 171.5 653 L 168.5 652 L 161.5 653 L 151.5 651 L 149.5 651 L 145 650 L 143.5 648 L 139 644.5 L 137 641.5 Q 129.3 635.7 129 622.5 L 130 620.5 L 130 618.5 L 129 554.5 L 130 529.5 L 128 524.5 L 128 522.5 L 129 516.5 L 128.5 515 L 130 514.5 L 130 473.5 L 128 358.5 Q 126.4 327.5 134 308 L 136 305.5 L 146 275 L 150 271.5 L 152 268 L 154 266.5 L 155 264 L 157 262.5 L 189 227 L 195 221.5 L 225 192.5 L 229 187.5 L 232 186 L 241.5 175 L 262 155.5 L 293.5 123 L 295 121.5 L 307 110.5 L 334.5 82 L 341 76.5 L 344.5 72 L 351 68 L 365 50 L 391.5 36 Z M 389 87 L 382 91 L 365 111 L 361 116 L 343 133 L 339 135 L 320 162 L 304 177 L 301 179 L 273 211 L 272 212 L 269 216 L 266 218 L 262 223 L 255 229 L 254 230 L 236 251 L 215 270 Q 177 296 177 359 L 176 352 L 175 352 L 176 371 L 175 379 L 175 381 Q 172 396 177 401 L 185 402 L 196 388 L 198 386 L 209 373 L 211 371 L 217 364 L 220 362 L 264 314 L 266 312 L 297 275 L 307 268 L 322 252 L 324 250 L 338 233 L 345 227 L 371 197 L 381 190 Q 392 183 396 169 L 397 166 L 396 154 L 398 101 L 398 99 L 395 89 L 389 87 Z M 468 151 L 464 153 L 460 155 L 441 178 L 439 180 L 437 181 Q 418 211 392 234 L 390 235 L 371 261 L 369 262 L 329 312 L 323 316 L 307 335 L 305 336 L 250 399 L 248 400 L 218 435 L 217 436 L 207 447 L 205 450 L 196 457 L 186 472 L 182 475 L 179 481 L 177 482 L 175 495 L 176 502 L 175 506 L 176 510 L 175 512 L 177 511 L 175 514 L 177 515 L 176 515 L 176 517 L 175 528 L 175 530 L 176 533 L 175 537 L 176 540 L 176 542 L 176 574 L 180 576 L 183 577 L 186 576 L 196 559 L 204 552 L 214 539 L 218 536 L 221 532 L 223 530 L 234 516 L 236 514 L 244 504 L 246 502 L 255 489 L 257 487 L 279 460 L 286 454 L 293 443 L 295 441 L 296 439 L 298 437 L 321 409 L 325 405 L 350 372 L 362 361 L 373 348 L 375 346 L 390 325 L 448 260 L 460 241 L 463 240 L 465 238 Q 476 230 478 213 L 478 211 L 479 208 L 478 206 L 479 171 L 478 157 L 468 151 Z M 519 233 L 512 237 L 457 311 L 456 312 L 417 360 L 415 361 L 359 437 L 364 448 L 379 459 L 396 481 L 416 498 L 426 509 L 429 511 L 441 526 L 461 544 L 463 548 L 470 554 L 472 555 L 489 574 L 498 581 L 524 611 L 537 617 L 543 616 L 607 617 L 609 617 L 614 616 L 618 611 L 600 589 L 577 567 L 573 562 L 571 561 L 560 551 L 553 543 L 551 540 L 527 516 L 472 460 L 470 458 L 458 448 Q 443 441 443 419 Q 448 385 472 371 L 473 370 L 482 362 L 511 327 L 513 323 L 521 317 L 524 314 L 529 310 Q 539 290 557 276 L 558 274 L 576 258 L 578 256 L 582 247 L 583 244 L 582 240 Q 574 230 555 233 L 551 234 L 548 233 L 541 234 L 519 233 Z M 327 478 L 325 479 L 293 517 L 289 520 L 288 523 Q 287 531 293 533 L 297 536 L 302 543 L 318 555 L 339 579 L 371 608 L 373 609 L 375 612 L 378 614 L 394 633 L 395 635 L 415 652 L 437 676 L 438 678 L 443 681 L 446 686 L 470 708 L 471 710 L 481 716 L 484 715 L 487 710 L 486 695 L 487 693 L 486 691 L 487 649 L 487 647 Q 486 620 467 612 L 463 609 L 461 607 L 457 603 L 454 600 L 437 583 L 393 541 L 389 536 L 346 496 L 345 493 L 341 491 L 337 485 L 327 478 Z "></path><path fill="currentColor" stroke="currentColor" stroke-width="1" d="M 607.5 44 L 612 45.5 Q 615.3 64.2 627.5 74 L 662 95.5 L 659.5 102 Q 640.5 106 630 118.5 L 628.5 120 L 626 124 L 624 125.5 L 613 150 L 608.5 152 L 602 147.5 Q 596.5 125.5 581.5 113 L 557 97.5 L 558.5 93 L 589 73.5 L 605 45 L 607.5 44 Z "></path></svg>';
  var SITE_LINK = /^https:\/\/anilist\.co\//;
  var TRAILER_LINK = /^https:\/\/www\.(youtube\.com\/watch\?v=|dailymotion\.com\/video\/)[\w-]{1,32}$/;
  function handlers(api, setupStatus = () => ({ running: false })) {
    return {
      list: (type) => {
        var _a, _b, _c, _d, _e;
        const raw = api.collection(type);
        const list = toHostList(raw);
        if (!list.entries.length && rawEntryCount(raw) > 0) {
          const first = (_d = (_c = (_b = (_a = raw == null ? void 0 : raw.MediaListCollection) == null ? void 0 : _a.lists) == null ? void 0 : _b.find((l) => {
            var _a2;
            return (_a2 = l.entries) == null ? void 0 : _a2.length;
          })) == null ? void 0 : _c.entries) == null ? void 0 : _d[0];
          throw new Error(
            `couldn't read your ${type.toLowerCase()} list from Seanime (status: ${describe(first == null ? void 0 : first.status)}, media id: ${describe((_e = first == null ? void 0 : first.media) == null ? void 0 : _e.id)})`
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
      setupStatus
    };
  }
  function pluginHost(h, transport) {
    return {
      kind: "seanime",
      transport,
      user: async () => ({ name: SEANIME_USER }),
      list: async (type) => h.list(type),
      loadStore: async () => h.loadStore(),
      saveStore: async (json) => {
        h.saveStore(json);
      },
      openTitle: () => {
      }
    };
  }
  function backgroundSetup(h, api, transport, later, log = () => {
  }) {
    return new BackgroundSetup({
      hasStore: () => h.loadStore() !== null,
      hasList: () => ["ANIME", "MANGA"].some((t) => rawEntryCount(api.collection(t)) > 0),
      host: pluginHost(h, transport),
      later,
      log
    });
  }
  function answer(h, payload) {
    var _a;
    const req = payload;
    if (!req || typeof req.id !== "number") return null;
    try {
      const fn = h[req.method];
      if (!fn) throw new Error(`unknown request: ${String(req.method)}`);
      return { id: req.id, ok: true, result: fn(...(_a = req.args) != null ? _a : []) };
    } catch (e) {
      return { id: req.id, ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
  function seanimeApi(ctx) {
    const link = { url: "", title: "" };
    const modal = ctx.newModal({ title: "Open on AniList" });
    modal.render(() => [
      modal.stack(
        [
          modal.text(`${link.title} opens in your browser.`),
          modal.flex(
            [
              modal.img(ANILIST_ICON_URL, { width: "20", height: "20", alt: "AniList" }),
              modal.anchor("Open on AniList", { href: link.url, target: "_blank" })
            ],
            { gap: 2 }
          )
        ],
        { gap: 3 }
      )
    ]);
    const trailer = { url: "", title: "" };
    const trailerModal = ctx.newModal({ title: "Watch the trailer" });
    trailerModal.render(() => [
      trailerModal.stack(
        [
          trailerModal.text(`${trailer.title}'s trailer opens in your browser.`),
          trailerModal.anchor(
            trailer.url.includes("dailymotion") ? "Watch on Dailymotion" : "Watch on YouTube",
            { href: trailer.url, target: "_blank" }
          )
        ],
        { gap: 3 }
      )
    ]);
    return {
      collection: (type) => type === "MANGA" ? $anilist.getRawMangaCollection(false) : $anilist.getRawAnimeCollection(false),
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
      }
    };
  }
  function start(ctx) {
    const webview = ctx.newWebview({
      slot: "screen",
      fullWidth: true,
      height: "calc(100vh - 2rem)",
      style: "border:0;border-radius:12px",
      sidebar: { label: LABEL, icon: ICON }
    });
    webview.setContent(() => '<!doctype html>\n<html lang="en" data-theme="dark">\n  <head>\n    <meta charset="utf-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1" />\n    <title>For you</title>\n    <script type="module" crossorigin>(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const s of document.querySelectorAll(\'link[rel="modulepreload"]\'))i(s);new MutationObserver(s=>{for(const o of s)if(o.type==="childList")for(const r of o.addedNodes)r.tagName==="LINK"&&r.rel==="modulepreload"&&i(r)}).observe(document,{childList:!0,subtree:!0});function n(s){const o={};return s.integrity&&(o.integrity=s.integrity),s.referrerPolicy&&(o.referrerPolicy=s.referrerPolicy),s.crossOrigin==="use-credentials"?o.credentials="include":s.crossOrigin==="anonymous"?o.credentials="omit":o.credentials="same-origin",o}function i(s){if(s.ep)return;s.ep=!0;const o=n(s);fetch(s.href,o)}})();var N,Ri,ee,Ut,Xe,Fi,Ve,Bi,gn,Wt,gt=Symbol.for("pv"),et={},tt=[],Mo=/^m(i|n|o|s|text|space)$/,vn=Array.isArray,ji=tt.slice,le=Object.assign;function ae(e){e&&e.parentNode&&e.remove()}function Ye(e,t,n,i,s){var o={type:e,props:t,key:n,ref:i,__k:null,__:null,__b:0,__e:null,__c:null,constructor:gt,__v:s||++Ri,__i:-1,__u:0};return!s&&N.vnode&&N.vnode(o),o}function W(e){return e.children}function Ke(e,t){this.props=e,this.context=t,this.__g=0}function ie(e,t){if(t==null)return e.__&&ie(e.__,e.__i+1);for(var n;t<e.__k.length;t++)if((n=e.__k[t])&&n.__e)return n.__e;return typeof e.type!="function"||e.props.__P?null:ie(e)}function ko(e){var t,n=e.__v,i=n.__e,s=[],o=[],r=e.__P;r&&((t=le({constructor:gt},n)).__v=n.__v+1,N.vnode&&N.vnode(t),_n(r,t,n,e.__n,r.namespaceURI,32&n.__u?[i]:null,s,i||ie(n),32&n.__u,o),t.__v=n.__v,t.__.__k[t.__i]=t,qi(s,t,o),n.__=n.__e=null,t.__e!=i&&zi(t))}function zi(e){if((e=e.__)&&e.__c&&!e.props.__P)return e.__e=null,e.__k.some(function(t){return t&&(e.__e=t.__e)}),zi(e)}function Wn(e){(8&e.__g||(e.__g|=8,ee.push(e),Xe++))&&Ut==N.debounceRendering||((Ut=N.debounceRendering)||queueMicrotask)(Ui)}function Ui(){try{for(var e,t=1;ee.length;)ee.length>t&&ee.sort(Fi),e=ee.shift(),t=ee.length,8&e.__g&&ko(e)}finally{(Xe=ee.length)&&(Ut||queueMicrotask)(Ui)}}function Wi(e,t,n,i,s,o,r,a,u,f,d){var p,m,c,g,_,h,y=i.__k||tt,w=t.length;for(u=Eo(n,t,y,u,w),p=0;p<w;p++)(c=n.__k[p])!=null&&(m=~c.__i&&y[c.__i]||et,c.__i=p,h=_n(e,c,m,s,o,r,a,u,f,d),g=c.__e,(m.ref!=c.ref||8&m.__u)&&(m.ref&&yn(m.ref,null,c,m),c.ref&&d.push(c.ref,c.__c||g,c)),_=_||g,4&c.__u?(u=Hi(c,u,e,!m.__v),m.__e&&(m.__e=null)):typeof c.type=="function"&&h!==void 0?u=h:g&&(u=g.nextSibling),c.__u&=-21);return n.__e=_,u}function Eo(e,t,n,i,s){var o,r,a,u,f,d,p,m,c,g=n.length,_=g,h=0,y=0,w=e.__k=Array(s);for(o=0;o<s;o++)(r=t[o])!=null&&typeof r!="boolean"&&typeof r!="function"?(typeof r!="object"||r.constructor===String?r=w[o]=Ye(null,r):vn(r)?r=w[o]=Ye(W,{children:r}):r.constructor===gt&&r.__b?r=w[o]=Ye(r.type,r.props,r.key,r.ref,r.__v):w[o]=r,u=o+h,r.__=e,r.__b=e.__b+1,a=null,~(f=r.__i=xo(r,n,u,_))&&(_--,(a=n[f])&&(a.__u|=2)),a&&a.__v?(r.__u|=16,f==u-1?h--:f==u+1?h++:f!=u&&(f>u?h--:h++,y=1)):(~f||(s>g?h--:s<g&&h++),typeof r.type!="function"&&(r.__u|=4))):w[o]=null;if(y){for(d=[],p=[],o=0;o<s;o++)if((r=w[o])&&16&r.__u){for(h=0,m=d.length;h<m;)d[c=h+m>>1]<r.__i?h=c+1:m=c;d[h]=r.__i,p[o]=h+1}for(h=d.length;o--;)p[o]&&(p[o]==h?h--:w[o].__u|=4)}if(_)for(o=0;o<g;o++)!(a=n[o])||2&a.__u||(a.__e==i&&(i=ie(a)),wn(a,a));return i}function Hi(e,t,n,i){var s,o,r,a;if(typeof e.type=="function"){if(e.props.__P)return t;if(s=e.__k)for(o=0;o<s.length;o++)s[o]&&(s[o].__=e,t=Hi(s[o],t,n,!1));return t}for(t&&!t.parentNode&&(t=ie(e))&&!t.parentNode&&(t=null),r=e.__e,a=t;a&&a.nodeType==8;)a=a.nextSibling;for(r!=a&&(!i&&n.moveBefore&&r.parentNode?n.moveBefore(r,t):n.insertBefore(r,t||null)),t=r;(t=t&&t.nextSibling)&&t.nodeType==8&&!t.data.startsWith("$s"););return t}function xo(e,t,n,i){var s,o=e.key,r=e.type,a=t[n],u=a&&!(2&a.__u);if(a===null&&o==null||u&&o==a.key&&r==a.type)return n;if(i>(u?1:0)){for(s=n-1;s>=0;s--)if((a=t[s])&&!(2&a.__u)&&o==a.key&&r==a.type)return s;for(s=n+1;s<t.length;s++)if((a=t[s])&&!(2&a.__u)&&o==a.key&&r==a.type)return s}return-1}function Hn(e,t,n){n==null&&(n=""),t[0]=="-"?e.setProperty(t,n):e[t]=n}function je(e,t,n,i,s){var o,r;if(t=="style")if(typeof n=="string")e.style.cssText=n;else{if(typeof i=="string"&&(e.style.cssText=i=""),i)for(t in i)n&&t in n||Hn(e.style,t);if(n)for(t in n)i&&n[t]==i[t]||Hn(e.style,t,n[t])}else if(t[0]=="o"&&t[1]=="n")typeof n!="function"&&(n=null),typeof i!="function"&&(i=null),(e.__e||(e.__e={}))[t]=n,n&&i||(r=Wt[t]||(Wt[t]=Ao(t)),(e.__a||(e.__a={}))[t]=gn,o=t!=(t=t.replace(Bi,"$1")),(t=t.slice(2))[0]<"a"&&(t=t.toLowerCase()),n?e.addEventListener(t,r,o):e.removeEventListener(t,r,o));else{if(s=="http://www.w3.org/2000/svg")t=t.replace(/xlink(H|:h)/,"h").replace(/sName$/,"s");else if(t!="width"&&t!="height"&&t!="href"&&t!="list"&&t!="form"&&t!="tabIndex"&&t!="download"&&t!="rowSpan"&&t!="colSpan"&&t!="role"&&t!="popover"&&t in e)try{return void(e[t]=n??"")}catch{}if(typeof n=="function")return;n==null||n===!1&&t[4]!="-"?e.removeAttribute(t):e.setAttribute(t,t=="popover"&&n==1?"":n)}}function Ao(e){return function(t){var n=this.__e;if(n){if(n=n[e],t[Ve]==null)t[Ve]=gn++;else if(t[Ve]<this.__a[e])return;return n(N.event?N.event(t):t)}}}function _n(e,t,n,i,s,o,r,a,u,f){var d,p,m,c,g,_,h,y,w,S,b,v,k,A,C,I,L,M,x=t.type;if(t.constructor!==gt)return null;128&n.__u&&(u=32&n.__u,d=n.__c.__z)&&(t.__u|=u,p=o=[],d.nodeType==8?a=Je(d,o):o.push(d),a=o[0]||a),(d=N.__b)&&d(t);e:if(typeof x=="function"){m=r.length;try{if(y=t.props,w=(d=x.prototype)&&d.render,S=(d=x.contextType)&&i[d.__c],b=d?S?S.props.value:d.__:i,(c=n.__c)?(t.__c=c,2&c.__g&&(c.__g|=1)):(w?t.__c=c=new x(y,b):(t.__c=c=new Ke(y,b),c.constructor=x,c.render=$o),S&&S.sub(c),c.state||(c.state={}),c.__n=i,c.__g|=8,c.__h=[],c.__k=[]),w&&(c.__s||(c.__s=c.state),x.getDerivedStateFromProps&&(c.__s==c.state&&(c.__s=le({},c.__s)),le(c.__s,x.getDerivedStateFromProps(y,c.__s)))),g=c.props,_=c.state,c.__v=t,n.__c){if(y!==g&&w&&!x.getDerivedStateFromProps&&c.componentWillReceiveProps&&c.componentWillReceiveProps(y,b),t.__v==n.__v&&!(8&c.__g)||!(4&c.__g)&&c.shouldComponentUpdate&&c.shouldComponentUpdate(y,c.__s,b)===!1){t.__v!=n.__v&&(c.props=y,c.state=c.__s,c.__g&=-9),t.__e=n.__e,t.__k=n.__k,t.__k.some(function(O){O&&(O.__=t)}),tt.push.apply(c.__h,c.__k),c.__k=[],c.__h.length&&r.push(c),a=ie(n);break e}c.componentWillUpdate&&c.componentWillUpdate(y,c.__s,b),w&&c.componentDidUpdate&&c.__h.push(function(){c.componentDidUpdate(g,_,h)})}else w&&!x.getDerivedStateFromProps&&c.componentWillMount&&c.componentWillMount(),w&&c.componentDidMount&&c.__h.push(c.componentDidMount);c.context=b,c.props=y,c.__P=e,c.__g&=-5,v=N.__r,k=w?25:0;do c.__g&=-9,v&&v(t),d=c.render(c.props,c.state=c.__s,c.context);while(8&c.__g&&++k<25);w&&(tt.push.apply(c.__h,c.__k),c.__k=[]),c.state=c.__s,c.getChildContext&&(i=le({},i,c.getChildContext())),w&&n.__c&&c.getSnapshotBeforeUpdate&&(h=c.getSnapshotBeforeUpdate(g,_)),A=d&&d.type===W&&d.key==null?d.props.children:d,y.__P&&(d=a,s=(e=y.__P).namespaceURI,u=o=null,n.props&&n.props.__P!=e&&(n.__k.some(function(O){O&&wn(O,O)}),n.__k=null),a=n.__k?ie(n,0):null),a=Wi(e,vn(A)?A:[A],t,n,i,s,o,r,a,u,f),y.__P&&(t.__e=null,a=d),t.__u&=-161,p&&p.some(ae),c.__h.length&&r.push(c),1&c.__g&&(c.__g&=-4)}catch(O){if(r.length=m,t.__v=null,u||o)if(O&&O.then){if(t.__u|=128|u,o){for(~(L=o.indexOf(a||void 0))||(L=o.length);(M=o[L-1])&&M.nodeType==8;)L--;for(;L<o.length;L++)if(M=o[L])if(o[L]=null,C){if(M==I)break}else{if(M.nodeType!=8)break;M.data.startsWith("$s")&&(I=Je(C=M))}}if(!C){for(;a&&a.nodeType==8&&a.nextSibling;)a=a.nextSibling;C=a}(d=Je(C=t.__c.__z||(t.__c.__z=C)))?(t.__e=C,a=d):t.__e=a,a=a&&a.nextSibling}else o&&o.some(ae);else t.__e=n.__e;t.__k||(t.__k=n.__k||[]),O&&O.then||Gi(t),N.__e(O,t,n)}}else a=t.__e=To(n.__e,t,n,i,s,o,r,u,f,e);return(d=N.diffed)&&d(t),a}function Je(e,t){if(e&&e.nodeType==8&&e.data.startsWith("$s"))for(var n=1;e=e.nextSibling;){if(e.nodeType==8){if(e.data.startsWith("$s"))n++;else if(e.data.startsWith("/$s")&&!--n)return e}t&&t.push(e)}}function Gi(e){e&&(e.__c&&(e.__c.__g|=4),e.__k&&e.__k.some(Gi))}function qi(e,t,n){for(var i=0;i<n.length;)yn(n[i++],n[i++],n[i++]);N.__c&&N.__c(t,e),e.some(function(s){try{e=s.__h,s.__h=[],e.some(function(o){o.call(s)})}catch(o){N.__e(o,s.__v)}})}function To(e,t,n,i,s,o,r,a,u,f){var d,p,m,c,g,_,h,y,w=n.props||et,S=t.props,b=t.type;if(b=="svg"?s="http://www.w3.org/2000/svg":b=="math"?s="http://www.w3.org/1998/Math/MathML":s||(s="http://www.w3.org/1999/xhtml"),o){for(d=0;d<o.length;d++)if((g=o[d])&&(b?g.localName==b:g.nodeType==3)){e=g,o[d]=null;break}}if(!e){if(y=f.ownerDocument||document,!b)return y.createTextNode(S);e=y.createElementNS(s,b,S.is?S:f),a&&(N.__m&&N.__m(t,o),a=!1),o=null}if(b){if(f=b=="template"&&e.content||e,o=b=="textarea"&&S.defaultValue!=null?null:o&&ji.call(f.childNodes),!a&&o)for(w={},d=0;d<e.attributes.length;d++)w[(g=e.attributes[d]).name]=g.value;for(d in w)g=w[d],d=="dangerouslySetInnerHTML"?m=g:d=="children"||d in S||d=="value"&&"defaultValue"in S||d=="checked"&&"defaultChecked"in S||je(e,d,null,g,s);for(d in S)g=S[d],d=="children"?c=g:d=="dangerouslySetInnerHTML"?p=g:d=="value"?_=g:d=="checked"?h=g:a&&typeof g!="function"||w[d]===g||je(e,d,g,w[d],s);p?(a||m&&(p.__html==m.__html||p.__html==e.innerHTML)||(e.innerHTML=p.__html),t.__k=[]):(m&&(e.textContent=""),(b=="foreignObject"||s=="http://www.w3.org/1998/Math/MathML"&&Mo.test(b))&&(s="http://www.w3.org/1999/xhtml"),Wi(f,vn(c)?c:[c],t,n,i,s,o,r,o?o[0]:n.__k&&ie(n,0),a,u),o&&o.some(ae)),a&&b!="textarea"||(d="value",b=="progress"&&_==null?e.removeAttribute(d):_==null||_===e[d]&&(b!="progress"||_)||je(e,d,_,w[d],s),d="checked",h!=null&&h!=e[d]&&je(e,d,h,w[d],s))}else w===S||a&&e.data==S||(e.data=S);return e}function yn(e,t,n,i){try{typeof e=="function"?t?t.__x=e(t)||1:i&&(i=i.__c||i.__e)&&(t=i.__x)&&(i.__x=null,typeof t=="function"?t():e(null)):e.current=t}catch(s){N.__e(s,n)}}function wn(e,t,n){var i,s,o,r;if(N.unmount&&N.unmount(e),!(i=e.ref)||i.current&&i.current!=e.__e||yn(i,null,t,e),i=e.__c){if(i.componentWillUnmount)try{i.componentWillUnmount()}catch(a){N.__e(a,t)}i.__P=i.__n=null}if(i=e.__k)for(r=0;r<i.length;r++)i[r]&&wn(i[r],t,typeof e.type!="function"||n&&!e.props.__P);!n&&(i=e.__c)&&(i=i.__z)&&(s=Je(i,o=[]))&&(i==e.__e&&o.some(ae),ae(s),ae(i)),n||ae(e.__e),e.__e=e.__c=e.__=null}function $o(e,t,n){return this.constructor(e,n)}function Lo(e,t){var n,i,s,o;N.__&&N.__(e,t),t.nodeType==9&&(t=t.documentElement),i=(n=e&&32&e.__u)?null:t.__k,t.__k=Ye(W,{children:[e]}),s=[],o=[],_n(t,t.__k,i||et,et,t.namespaceURI,i?null:t.firstChild?ji.call(t.childNodes):null,s,i?i.__e:t.firstChild,n,o),qi(s,t.__k,o),t.__k.props.children=null}N={__e:function(e,t,n,i){for(var s,o,r;t=t.__;)if((s=t.__c)&&!(1&s.__g)){s.__g|=4;try{if((r=(o=s.constructor)&&o.getDerivedStateFromError)&&s.setState(o.getDerivedStateFromError(e)),s.componentDidCatch&&(s.componentDidCatch(e,i||{}),r=1),r&&8&s.__g)return void(s.__g|=2)}catch(a){e=a}}throw Xe=0,e}},Ri=0,Ke.prototype.setState=function(e,t){var n=this.__s;n&&n!=this.state||(n=this.__s=le({},this.state)),typeof e=="function"&&(e=e(le({},n),this.props)),e&&(le(n,e),this.__v&&(t&&this.__k.push(t),Wn(this)))},Ke.prototype.forceUpdate=function(e){this.__v&&(this.__g|=4,e&&this.__h.push(e),Wn(this))},Ke.prototype.render=W,ee=[],Xe=0,Fi=function(e,t){return e.__v.__b-t.__v.__b},Ve=Symbol(),Bi=/(PointerCapture)$|Capture$/i,gn=0,Wt={};var Co=Symbol.for("pv"),No=0;function l(e,t,n,i,s,o){t||(t={});var r,a,u=t;if("ref"in u&&typeof e!="function")for(a in u={},t)a=="ref"?r=t[a]:u[a]=t[a];var f={type:e,props:u,key:n,ref:r,__k:null,__:null,__b:0,__e:null,__c:null,constructor:Co,__v:--No,__i:-1,__u:0};return N.vnode&&N.vnode(f),f}const Vi=10,Gn=new Map;function Io(e,t){const n=`${t}\\0${e}`,i=Gn.get(n);if(i)return i;const s=e.indexOf("query (");if(s<0)throw new Error("only queries with declared variables can be batched");const o=s+7,r=qn(e,o-1,"(",")"),a=e.indexOf("{",r),u=qn(e,a,"{","}"),f=e.slice(o,r).trim(),d=e.slice(a+1,u).trim(),p=e.slice(u+1),m=(_,h)=>_.replace(/\\$(\\w+)/g,`$$$1_${h}`),c=Array.from({length:t},(_,h)=>h),g=`\nquery (${c.map(_=>m(f,_)).join(", ")}) {\n${c.map(_=>`  q${_}: ${m(d,_)}`).join(`\n`)}\n}${p}`;return Gn.set(n,g),g}function Oo(e){const t={};return e.forEach((n,i)=>{for(const[s,o]of Object.entries(n))t[`${s}_${i}`]=o}),t}function Ht(e,t){const n=[];for(let i=0;i<e.length;i+=t)n.push(e.slice(i,i+t));return n}function qn(e,t,n,i){let s=0;for(let o=t;o<e.length;o++)if(e[o]===n)s++;else if(e[o]===i&&--s===0)return o;throw new Error(`unbalanced ${n}${i} in query`)}const Po="https://graphql.anilist.co";class Q extends Error{status;constructor(t,n=null){super(t),this.name="AniListError",this.status=n}}function Do(e={}){const t=e.fetch??fetch,n={Accept:"application/json","Content-Type":"application/json"};return e.token&&(n.Authorization=`Bearer ${e.token}`),async i=>{const s=await t(e.url??Po,{method:"POST",headers:n,body:JSON.stringify(i)});return{status:s.status,header:o=>s.headers.get(o),json:()=>s.json()}}}class Ro{transport;interval;maxRetries;sleep;now;epochSeconds;nextAllowed=0;blockedUntil=0;constructor(t,n={}){this.transport=t,this.interval=6e4/(n.requestsPerMinute??30),this.maxRetries=n.maxRetries??5,this.sleep=n.sleep??(i=>new Promise(s=>setTimeout(s,i))),this.now=n.now??(()=>performance.now()),this.epochSeconds=n.epochSeconds??(()=>Date.now()/1e3)}async query(t,n={}){for(let i=0;;i++){const s=i===this.maxRetries;await this.waitTurn();let o;try{o=await this.transport({query:t,variables:n})}catch(a){if(s)throw new Q(`could not reach AniList: ${String(a)}`);this.backOff(2**i*1e3);continue}if(o.status===429||o.status>=500){if(s)throw new Q(`AniList returned ${o.status}`,o.status);this.backOff(Bo(o)??2**i*1e3);continue}this.respectRemaining(o);const r=await o.json();if(r.errors?.length){const a=r.errors.map(u=>u.message??"unknown error").join("; ");throw new Q(a,o.status)}if(o.status!==200||r.data===void 0)throw new Q(`AniList returned ${o.status}`,o.status);return r.data}}async queryMany(t,n){if(n.length===0)return[];if(n.length===1)return[await this.query(t,n[0])];const i=await this.query(Io(t,n.length),Oo(n)),s=Fo(t);return n.map((o,r)=>({[s]:i[`q${r}`]}))}async waitTurn(){const t=this.now(),n=Math.max(t,this.nextAllowed,this.blockedUntil);this.nextAllowed=n+this.interval,n>t&&await this.sleep(n-t);for(let i=this.now();i<this.blockedUntil;i=this.now())await this.sleep(this.blockedUntil-i)}backOff(t){this.blockedUntil=Math.max(this.blockedUntil,this.now()+t),this.nextAllowed=Math.max(this.nextAllowed,this.blockedUntil)}respectRemaining(t){const n=t.header("X-RateLimit-Remaining"),i=Number(t.header("X-RateLimit-Reset"));n==="0"&&Number.isFinite(i)&&i>0&&this.backOff(Math.max(0,i-this.epochSeconds())*1e3)}}function Fo(e){const t=e.indexOf("{",e.indexOf(")")),n=/^\\s*(\\w+)/.exec(e.slice(t+1));if(!n?.[1])throw new Error("query has no root field");return n[1]}function Bo(e){const t=Number(e.header("Retry-After"));return e.header("Retry-After")!==null&&Number.isFinite(t)?t*1e3:null}function vt(e){const t=e.title??{},n=e.stats?.scoreDistribution??[];return{id:e.id,type:e.type,title:t.english||t.romaji||`#${e.id}`,format:e.format??null,status:e.status??null,isAdult:!!e.isAdult,year:e.startDate?.year??null,episodes:e.episodes??null,chapters:e.chapters??null,averageScore:e.averageScore??null,meanScore:e.meanScore??null,popularity:e.popularity??null,favourites:e.favourites??null,scoreDistribution:n.map(i=>[i.score,i.amount]).sort((i,s)=>i[0]-s[0]||i[1]-s[1]),siteUrl:e.siteUrl??null,coverUrl:e.coverImage?.large??null,genres:[...e.genres??[]],tags:(e.tags??[]).map(i=>({name:i.name,rank:i.rank??0,spoiler:!!i.isMediaSpoiler})),studios:(e.studios?.nodes??[]).map(i=>i.name),relations:(e.relations?.edges??[]).flatMap(i=>i.node?[{relationType:i.relationType,mediaId:i.node.id,mediaType:i.node.type??null}]:[]),titles:{romaji:t.romaji??null,english:t.english??null,native:t.native??null},country:e.countryOfOrigin??null}}function Yi(e){return(e.recommendations?.nodes??[]).flatMap(t=>t.mediaRecommendation?[[t.mediaRecommendation.id,t.rating??0]]:[])}function jo(e){const t=e.MediaListCollection??{},n={entries:[],media:[],recommendations:new Map,customLists:new Map,hasNext:!!t.hasNextChunk},i=new Set;for(const s of t.lists??[]){const o=s.entries??[];if(s.isCustomList){const r=s.name??"",a=n.customLists.get(r)??new Set;for(const u of o)a.add(u.media.id);n.customLists.set(r,a)}for(const r of o){const a=r.media;i.has(a.id)||(i.add(a.id),n.entries.push({mediaId:a.id,status:r.status,score:Math.trunc(r.score??0),progress:r.progress??0,repeat:r.repeat??0,updatedAt:r.updatedAt??0}),n.media.push(vt(a)),n.recommendations.set(a.id,Yi(a)))}}return n}const zo=`\nquery ($userName: String, $type: MediaType, $chunk: Int, $perChunk: Int) {\n  MediaListCollection(userName: $userName, type: $type, chunk: $chunk, perChunk: $perChunk) {\n    hasNextChunk\n    lists {\n      name\n      isCustomList\n      entries {\n        status\n        score(format: POINT_100)\n        progress\n        repeat\n        updatedAt\n        media {\n          ...MediaFields\n          recommendations(perPage: 10, sort: RATING_DESC) {\n            nodes { rating mediaRecommendation { id } }\n          }\n        }\n      }\n    }\n  }\n}\n\nfragment MediaFields on Media {\n  id\n  type\n  format\n  status\n  isAdult\n  siteUrl\n  title { romaji english native }\n  countryOfOrigin\n  coverImage { large }\n  episodes\n  chapters\n  startDate { year }\n  averageScore\n  meanScore\n  popularity\n  favourites\n  stats { scoreDistribution { score amount } }\n  genres\n  tags { name rank isMediaSpoiler }\n  studios(isMain: true) { nodes { name } }\n  relations { edges { relationType node { id type } } }\n}\n`,Uo=`\nquery ($ids: [Int], $page: Int, $perPage: Int) {\n  Page(page: $page, perPage: $perPage) {\n    pageInfo { hasNextPage }\n    media(id_in: $ids) { ...MediaFields }\n  }\n}\n\nfragment MediaFields on Media {\n  id\n  type\n  format\n  status\n  isAdult\n  siteUrl\n  title { romaji english native }\n  countryOfOrigin\n  coverImage { large }\n  episodes\n  chapters\n  startDate { year }\n  averageScore\n  meanScore\n  popularity\n  favourites\n  stats { scoreDistribution { score amount } }\n  genres\n  tags { name rank isMediaSpoiler }\n  studios(isMain: true) { nodes { name } }\n  relations { edges { relationType node { id type } } }\n}\n`,Wo=`\nquery ($ids: [Int], $page: Int, $perPage: Int) {\n  Page(page: $page, perPage: $perPage) {\n    pageInfo { hasNextPage }\n    media(id_in: $ids) {\n      ...MediaFields\n      recommendations(perPage: 10, sort: RATING_DESC) {\n        nodes { rating mediaRecommendation { id } }\n      }\n    }\n  }\n}\n\nfragment MediaFields on Media {\n  id\n  type\n  format\n  status\n  isAdult\n  siteUrl\n  title { romaji english native }\n  countryOfOrigin\n  coverImage { large }\n  episodes\n  chapters\n  startDate { year }\n  averageScore\n  meanScore\n  popularity\n  favourites\n  stats { scoreDistribution { score amount } }\n  genres\n  tags { name rank isMediaSpoiler }\n  studios(isMain: true) { nodes { name } }\n  relations { edges { relationType node { id type } } }\n}\n`,Ho=`\nquery (\n  $type: MediaType\n  $page: Int\n  $perPage: Int\n  $genreIn: [String]\n  $tagIn: [String]\n  $minimumTagRank: Int\n  $tagNotIn: [String]\n  $genreNotIn: [String]\n  $idNotIn: [Int]\n  $formatIn: [MediaFormat]\n  $startGreater: FuzzyDateInt\n  $startLesser: FuzzyDateInt\n  $statusIn: [MediaStatus]\n  $countryOfOrigin: CountryCode\n  $averageScoreGreater: Int\n) {\n  Page(page: $page, perPage: $perPage) {\n    media(\n      type: $type\n      genre_in: $genreIn\n      tag_in: $tagIn\n      minimumTagRank: $minimumTagRank\n      tag_not_in: $tagNotIn\n      genre_not_in: $genreNotIn\n      id_not_in: $idNotIn\n      format_in: $formatIn\n      startDate_greater: $startGreater\n      startDate_lesser: $startLesser\n      status_in: $statusIn\n      countryOfOrigin: $countryOfOrigin\n      averageScore_greater: $averageScoreGreater\n      isAdult: false\n      sort: SCORE_DESC\n    ) { ...MediaFields }\n  }\n}\n\nfragment MediaFields on Media {\n  id\n  type\n  format\n  status\n  isAdult\n  siteUrl\n  title { romaji english native }\n  countryOfOrigin\n  coverImage { large }\n  episodes\n  chapters\n  startDate { year }\n  averageScore\n  meanScore\n  popularity\n  favourites\n  stats { scoreDistribution { score amount } }\n  genres\n  tags { name rank isMediaSpoiler }\n  studios(isMain: true) { nodes { name } }\n  relations { edges { relationType node { id type } } }\n}\n`,Go=`\nquery ($id: Int) {\n  Media(id: $id) {\n    description(asHtml: false)\n    trailer { id site thumbnail }\n    characters(sort: [ROLE, RELEVANCE, ID], perPage: 12) {\n      edges {\n        role\n        node { id name { full } image { medium } }\n        voiceActors(language: JAPANESE, sort: [RELEVANCE, ID]) { id name { full } image { medium } }\n      }\n    }\n    staff(sort: [RELEVANCE, ID], perPage: 25) {\n      edges { role node { id name { full } image { medium } } }\n    }\n  }\n}\n`,qo="{ MediaTagCollection { name category } }",Vo=new Set(["Original Creator","Original Story","Story & Art","Story","Art","Director","Chief Director","Series Composition","Script Composition","Character Design","Original Character Design","Music"]);function Tt(e){return{id:e.id,name:e.name?.full??"",image:e.image?.medium??null}}const Yo=/^[\\w-]{1,32}$/;function Ko(e){const t=e?.id??"";if(!Yo.test(t))return null;const n=e?.thumbnail?.startsWith("https://")?e.thumbnail:null;return e?.site==="youtube"?{site:"youtube",url:`https://www.youtube.com/watch?v=${t}`,thumbnail:n??`https://i.ytimg.com/vi/${t}/hqdefault.jpg`}:e?.site==="dailymotion"?{site:"dailymotion",url:`https://www.dailymotion.com/video/${t}`,thumbnail:n}:null}function Jo(e){return e.split(" (")[0]?.trim()??e}function Qo(e){const t=(e.characters?.edges??[]).flatMap(i=>{if(!i?.node)return[];const s=i.voiceActors?.[0];return[{...Tt(i.node),role:i.role??"",voiceActor:s?Tt(s):null}]}),n=new Map;for(const i of e.staff?.edges??[]){if(!i?.node||!i.role)continue;const s=Jo(i.role);if(!Vo.has(s))continue;const o=n.get(i.node.id);o?o.roles.includes(s)||o.roles.push(s):n.set(i.node.id,{...Tt(i.node),roles:[s]})}return{description:e.description??"",trailer:Ko(e.trailer),characters:t,staff:[...n.values()]}}function $t(e){return e==="ANIME"?"MANGA":"ANIME"}function Ki(e){return e.type==="ANIME"?e.episodes:e.chapters}function Ji(e,t){return e.relations.filter(n=>n.relationType===t&&(n.mediaType===null||n.mediaType===e.type)).map(n=>n.mediaId)}function Le(e){return Ji(e,"PREQUEL")}function Zo(e){return Ji(e,"SEQUEL")}function Xo(e){return new Set([...e.genres.map(t=>`genre:${t}`),...e.tags.map(t=>`tag:${t.name}`),...e.studios.map(t=>`studio:${t}`)])}function Gt(e){const t=Xo(e);return e.country&&t.add(`country:${e.country}`),e.format&&t.add(`format:${e.format}`),t}const _t=30;function er(e){return Qi(e,"tag:")}function tr(e){return Qi(e,"genre:")}function Qi(e,t){return[...e.labels].filter(n=>n.startsWith(t)).map(n=>n.slice(t.length)).sort()}function nr(e,t,n){if(e.mediaIds.has(t.id))return!0;for(const i of Gt(t))if(e.labels.has(i))return!0;for(const i of ir(t,n))if(e.mediaIds.has(i))return!0;return!1}function ir(e,t){const n=new Set;let i=new Set(Le(e));for(let s=0;s<_t&&i.size;s++){for(const r of i)n.add(r);const o=new Set;for(const r of t(i).values())for(const a of Le(r))n.has(a)||o.add(a);i=o}return n}async function sr(e,t,n){const i=new Set(e);let s=new Set(i);for(let o=0;o<_t&&s.size;o++){n&&await n(s);const r=new Set;for(const a of t(s).values())for(const u of Zo(a))i.has(u)||r.add(u);for(const a of r)i.add(a);s=r}return i}const bn=["Action","Adventure","Comedy","Drama","Ecchi","Fantasy","Horror","Mahou Shoujo","Mecha","Music","Mystery","Psychological","Romance","Sci-Fi","Slice of Life","Sports","Supernatural","Thriller"],or={Action:["Theme-Action","Theme-Other-Organisations"],Comedy:["Theme-Comedy"],Drama:["Theme-Drama"],Fantasy:["Theme-Fantasy"],Mecha:["Theme-Sci-Fi-Mecha"],Music:["Theme-Arts-Music"],Romance:["Theme-Romance"],"Sci-Fi":["Theme-Sci-Fi","Theme-Sci-Fi-Mecha"],"Slice of Life":["Theme-Slice of Life"],Sports:["Theme-Game-Sport"]},rr={Action:["Super Power","War","Death Game","Survival","Kaiju"],Adventure:["Travel","Dungeon","Isekai","Virtual World","Lost Civilization"],Ecchi:["Nudity"],Fantasy:["Urban Fantasy","Demons","Gods","Vampire","Reincarnation","Dungeon"],Horror:["Body Horror","Cosmic Horror","Zombie","Gore","Survival"],"Mahou Shoujo":["Henshin","Magic"],Mecha:["Robots"],Mystery:["Detective","Conspiracy","Crime"],Psychological:["Psychosexual","Philosophy"],"Sci-Fi":["Robots","Aliens","Space","Cyborg","Post-Apocalyptic","Cyberpunk"],Supernatural:["Demons","Ghost","Youkai","Super Power","Curses","Exorcism"],Thriller:["Conspiracy","Crime","Death Game"]},ar=new Set(["Heterosexual"]),Zi=new Set(["Action","Adventure","Fantasy","Horror","Mahou Shoujo","Mecha","Mystery","Psychological","Romance","Sci-Fi","Sports","Supernatural","Thriller"]),lr=60,cr=50;class nt{tags;constructor(t){this.tags=new Map(bn.map(n=>{const i=or[n]??[],s=Object.entries(t).filter(([,o])=>i.includes(o)).map(([o])=>o);return[n,new Set([...s,...rr[n]??[]].filter(o=>!ar.has(o)))]}))}strength(t,n){const i=this.tags.get(n),s=Math.max(0,...t.tags.filter(o=>i?.has(o.name)).map(o=>o.rank));return t.genres.includes(n)?Math.max(s,cr):s}isMain(t,n){if(!t.genres.includes(n))return!1;const i=this.strength(t,n),s=t.genres.filter(o=>o!==n&&Zi.has(o)).map(o=>this.strength(t,o));return s.length===0||i>=lr&&s.every(o=>o<=i)}summary(t){return t.genres.map(n=>({genre:n,strength:this.strength(t,n),main:this.isMain(t,n)})).sort((n,i)=>i.strength-n.strength)}}const qt={ANIME:["TV","TV_SHORT","MOVIE","OVA","ONA","SPECIAL","MUSIC"],MANGA:["MANGA","NOVEL","ONE_SHOT"]},ur={ANIME:["FINISHED","RELEASING","NOT_YET_RELEASED","CANCELLED"],MANGA:["FINISHED","RELEASING","NOT_YET_RELEASED","HIATUS","CANCELLED"]};function _e(e={}){const{finishedOnly:t,...n}=e;return{genres:[],tags:[],mainTheme:!1,minTagRank:0,formats:[],yearFrom:null,yearTo:null,statuses:t?["FINISHED"]:[],hideListed:!0,hideSeenAdaptations:!1,minScore:0,countries:[],exclude:[],...n}}function yt(e){return new Set([...e.genres.map(t=>`genre:${t}`),...e.tags.map(t=>`tag:${t}`),...e.countries.map(t=>`country:${t}`),...e.formats.map(t=>`format:${t}`)])}function Vn(e){return!!(e.genres.length||e.tags.length||e.formats.length||e.yearFrom||e.yearTo||e.statuses.length||e.countries.length)}function Yn(e,t,n){const i=Math.max(1,e.minTagRank),s=new Map(t.tags.map(o=>[o.name,o.rank]));return e.genres.every(o=>t.genres.includes(o))&&e.tags.every(o=>(s.get(o)??0)>=i)&&!(e.mainTheme&&!fr(e).every(o=>n.isMain(t,o)))&&(e.formats.length===0||t.format!==null&&e.formats.includes(t.format))&&mr(e,t.year)&&(e.statuses.length===0||t.status!==null&&e.statuses.includes(t.status))&&pr(e,t)}function dr(e,t){return!e.minScore||t.averageScore!==null&&t.averageScore>=e.minScore}function fr(e){const t=e.genres.filter(n=>Zi.has(n));return t.length?t:e.genres}function hr(e){const t={};return e.genres.length&&(t.genreIn=[...e.genres]),e.tags.length&&(t.tagIn=[...e.tags],t.minimumTagRank=Math.max(1,e.minTagRank)),e.formats.length&&(t.formatIn=[...e.formats]),e.yearFrom&&(t.startGreater=e.yearFrom*1e4),e.yearTo&&(t.startLesser=e.yearTo*1e4+1231),e.statuses.length&&(t.statusIn=[...e.statuses]),e.minScore&&(t.averageScoreGreater=e.minScore-1),e.countries.length===1&&(t.countryOfOrigin=e.countries[0]),t}function pr(e,t){return!e.countries.length||t.country===void 0?!0:t.country!==null&&e.countries.includes(t.country)}function mr(e,t){return e.yearFrom||e.yearTo?t===null?!1:(e.yearFrom||t)<=t&&t<=(e.yearTo||t):!0}const Xi=new Set(["ADAPTATION","SOURCE","ALTERNATIVE","SUMMARY","COMPILATION","CONTAINS"]),gr=new Set(["COMPLETED","REPEATING","DROPPED","CURRENT","PAUSED"]);function Kn(e,t,n){const i=new Set(e.filter(s=>gr.has(s.status)).map(s=>s.mediaId));return es(i,t,n)}function Jn(e,t,n){return es(new Set(e.map(i=>i.mediaId)),t,n)}function es(e,t,n){const i=o=>new Set([...n(o).values()].flatMap(r=>r.relations.filter(a=>Xi.has(a.relationType)&&(a.mediaType===null||a.mediaType===t)).map(a=>a.mediaId))),s=i(e);for(const o of i(s))s.add(o);for(const o of e)s.delete(o);return{seen:e,linked:s}}function Qn(e,t){return e.linked.has(t.id)||t.relations.some(n=>Xi.has(n.relationType)&&e.seen.has(n.mediaId))}function vr(e,t,n,i,s){const o=e.length,r=n.reduce((p,m)=>p+m,0),a=new Float64Array(s);e.forEach((p,m)=>{p.indices.forEach((c,g)=>{a[c]=(a[c]??0)+(n[m]??0)*(p.values[g]??0)})});for(let p=0;p<s;p++)a[p]=(a[p]??0)/r;const u=t.reduce((p,m,c)=>p+(n[c]??0)*m,0)/r,f=o<s?yr(e,t,n,i,s,a,u):wr(e,t,n,i,s,a,u);let d=u;for(let p=0;p<s;p++)d-=(a[p]??0)*(f[p]??0);return{coef:f,intercept:d}}function _r(e,t){let n=e.intercept;return t.indices.forEach((i,s)=>{n+=(e.coef[i]??0)*(t.values[s]??0)}),n}function yr(e,t,n,i,s,o,r){const a=e.length,u=e.map(y=>br(y)),f=e.map(y=>y.indices.reduce((w,S,b)=>w+(y.values[b]??0)*(o[S]??0),0)),d=o.reduce((y,w)=>y+w*w,0),p=n.map(y=>Math.sqrt(y)),m=new Float64Array(a*a);for(let y=0;y<a;y++){for(let w=0;w<=y;w++){const S=Sr(e[y],u[w]),b=(p[y]??0)*(p[w]??0)*(S-(f[y]??0)-(f[w]??0)+d);m[y*a+w]=b,m[w*a+y]=b}m[y*a+y]=(m[y*a+y]??0)+i}const c=new Float64Array(a);for(let y=0;y<a;y++)c[y]=(p[y]??0)*((t[y]??0)-r);const g=ts(m,c,a),_=new Float64Array(s);let h=0;e.forEach((y,w)=>{const S=(g[w]??0)*(p[w]??0);h+=S,y.indices.forEach((b,v)=>{_[b]=(_[b]??0)+S*(y.values[v]??0)})});for(let y=0;y<s;y++)_[y]=(_[y]??0)-h*(o[y]??0);return _}function wr(e,t,n,i,s,o,r){const a=s,u=n.reduce((p,m)=>p+m,0),f=new Float64Array(a*a),d=new Float64Array(a);e.forEach((p,m)=>{const c=n[m]??0,g=(t[m]??0)-r;p.indices.forEach((_,h)=>{const y=p.values[h]??0;d[_]=(d[_]??0)+c*y*g,p.indices.forEach((w,S)=>{f[_*a+w]=(f[_*a+w]??0)+c*y*(p.values[S]??0)})})});for(let p=0;p<a;p++){for(let m=0;m<a;m++)f[p*a+m]=(f[p*a+m]??0)-u*(o[p]??0)*(o[m]??0);f[p*a+p]=(f[p*a+p]??0)+i}return ts(f,d,a)}function ts(e,t,n){const i=new Float64Array(n*n);for(let r=0;r<n;r++)for(let a=0;a<=r;a++){let u=e[r*n+a]??0;for(let f=0;f<a;f++)u-=(i[r*n+f]??0)*(i[a*n+f]??0);if(r===a){if(u<=0)throw new Error("matrix is not positive definite");i[r*n+r]=Math.sqrt(u)}else i[r*n+a]=u/(i[a*n+a]??1)}const s=new Float64Array(n);for(let r=0;r<n;r++){let a=t[r]??0;for(let u=0;u<r;u++)a-=(i[r*n+u]??0)*(s[u]??0);s[r]=a/(i[r*n+r]??1)}const o=new Float64Array(n);for(let r=n-1;r>=0;r--){let a=s[r]??0;for(let u=r+1;u<n;u++)a-=(i[u*n+r]??0)*(o[u]??0);o[r]=a/(i[r*n+r]??1)}return o}function br(e){const t=new Map;return e.indices.forEach((n,i)=>{t.set(n,e.values[i]??0)}),t}function Sr(e,t){let n=0;return e.indices.forEach((i,s)=>{n+=(e.values[s]??0)*(t.get(i)??0)}),n}const Mr=70,it=5,kr=.6,Er=150,xr=3;function Ar(e){const t=Er/Math.max(e,1);return Math.min(xr,kr*Math.max(1,t))}function ns(e){return e.target>=0}const Sn={rewatchBonus:1,tentativeWeight:.7,rewatched:[1.5,.8],completed:[1,.7],dropBase:-1,dropSlope:3,paused:[-.5,.3],current:[.5,.3],notInterested:[-2,.6]};function Tr(e){const t=e.filter(n=>n.score>0).map(n=>n.score);return t.length?t.reduce((n,i)=>n+i,0)/t.length:Mr}function $r(e,t,n,i=Sn){const s=e.repeat>0||e.status==="REPEATING";if(e.status==="PLANNING")return null;if(e.score>0){let o=(e.score-n)/10;s&&(o+=i.rewatchBonus);const r=e.status==="CURRENT"||e.status==="PAUSED";return[o,r?i.tentativeWeight:1]}if(s)return i.rewatched;if(e.status==="COMPLETED")return i.completed;if(e.status==="DROPPED"){const o=1-Lr(e,t);return[i.dropBase-i.dropSlope*o,1]}return e.status==="PAUSED"?i.paused:i.current}function Lr(e,t){const n=Ki(t);if(n)return Math.min(e.progress/n,1);const i=t.type==="ANIME"?12:50;return Math.min(e.progress/i,1)}function st(e,t,n=Sn){const i=Tr(e),s=[];for(const o of e){const r=t.get(o.mediaId),a=r?$r(o,r,i,n):null;r&&a&&s.push({media:r,target:a[0],weight:a[1],scored:o.score>0})}return s}function Cr(e,t=Sn){const[n,i]=t.notInterested;return e.map(s=>({media:s,target:n,weight:i,scored:!1}))}function Qe(e){const t=new Map;for(const n of e.genres)t.set(`genre:${n}`,1);for(const n of e.tags)t.set(`tag:${n.name}`,n.rank/100);for(const n of e.studios)t.set(`studio:${n}`,1);return e.format&&t.set(`format:${e.format}`,1),e.year&&t.set(`decade:${Math.floor(e.year/10)*10}s`,1),t}class is extends Error{constructor(t){super(t),this.name="NotEnoughHistory"}}class Nr{alpha;minFeatureCount;vocabulary=new Map;names=[];fit_=null;constructor(t=10,n=1){this.alpha=t,this.minFeatureCount=n}fit(t){if(t.length<it)throw new is(`need at least ${it} rated titles, got ${t.length}`);const n=t.map(s=>Qe(s.media)),i=new Map;for(const s of n)for(const o of s.keys())i.set(o,(i.get(o)??0)+1);return this.names=[...i].filter(([,s])=>s>=this.minFeatureCount).map(([s])=>s).sort(Ir),this.vocabulary=new Map(this.names.map((s,o)=>[s,o])),this.fit_=vr(n.map(s=>this.row(s)),t.map(s=>s.target),t.map(s=>s.weight),this.alpha,this.names.length),this}predict(t){const n=this.fitted();return t.map(i=>_r(n,this.row(Qe(i))))}contributions(t){const n=this.fitted(),i=[];for(const[s,o]of Qe(t)){const r=this.vocabulary.get(s);r!==void 0&&i.push([s,o*(n.coef[r]??0)])}return i.sort((s,o)=>o[1]-s[1])}weights(){const t=this.fitted();return this.names.map((n,i)=>[n,t.coef[i]??0]).sort((n,i)=>i[1]-n[1])}row(t){const n={indices:[],values:[]};for(const[i,s]of t){const o=this.vocabulary.get(i);o!==void 0&&(n.indices.push(o),n.values.push(s))}return n}fitted(){if(!this.fit_)throw new Error("TasteModel used before fit()");return this.fit_}}function Ir(e,t){return e<t?-1:e>t?1:0}const ss=new Map([["PLANNING","on your planning list"],["CURRENT","in progress on your list"],["PAUSED","paused on your list"]]),Vt=new Set(["COMPLETED","REPEATING"]),os=["format:","decade:"];function Or(e,t,n=[],i=new Map,s=[]){const o=st(e,t);if(o.length<it)throw new is(`need at least ${it} rated titles, got ${o.length}`);const r=new Set([...e,...n].map(p=>p.mediaId)),u=[...new Map(s.map(p=>[p.id,p])).values()].filter(p=>!r.has(p.id)).sort((p,m)=>p.id-m.id),f=new Nr().fit([...o,...st(n,i),...Cr(u)]),d=new Set(o.filter(ns).map(p=>p.media.id));return{model:f,entries:e,media:t,likedIds:d,communityWeight:Ar(o.length)}}function Pr(e,t=3){const n=e.weights().filter(([i])=>i.startsWith("tag:")).map(([i,s])=>[i.slice(4),s]);return{liked:n.filter(([,i])=>i>0).slice(0,t).map(([i])=>i),disliked:n.filter(([,i])=>i<0).reverse().slice(0,t).map(([i])=>i)}}function Dr(e,t,n={}){const i=new Map,s=(r,a)=>i.set(r,[...i.get(r)??[],a]),o=[...t].sort((r,a)=>a[2]-r[2]||r[0]-a[0]);for(const[r,a,u]of o){const f=e.media.get(r);u>0&&f&&e.likedIds.has(r)&&s(a,`liked ${f.title}`)}for(const[r,a]of n.extra??[])s(r,a);if(n.includeListed)for(const r of e.entries){const a=ss.get(r.status);a&&s(r.mediaId,a)}return i}function Rr(e,t,n){let i=e;const s=new Set([e.id]);for(let o=0;o<_t;o++){const r=Le(i);if(r.every(f=>Vt.has(t.get(f))))return i.id;if(r.some(f=>t.has(f)&&!Vt.has(t.get(f))))return null;const a=r.filter(f=>!t.has(f)&&!s.has(f)).sort((f,d)=>f-d),u=a.length?n(a.slice(0,1)).values().next().value:void 0;if(!u)return null;i=u,s.add(i.id)}return null}function Fr(e,t,n){const i=n(e.keys()),s=new Map;for(const[o,r]of e){const a=i.get(o),u=!a||t.has(o)?o:Rr(a,t,n);if(u===null)continue;const f=s.get(u)??[];for(const d of r)f.includes(d)||f.push(d);s.set(u,f)}return s}function Br(e,t,n,i={}){const s=new Map(e.entries.map(p=>[p.mediaId,p.status])),o=i.lookup??(()=>new Map),r=p=>{const m=new Map,c=[];for(const g of p){const _=n.get(g);_?m.set(g,_):c.push(g)}for(const[g,_]of o(c))m.set(g,_);return m},a=Fr(t,s,r),u=[];for(const p of a.keys()){const m=r([p]).get(p);if(!m)continue;const c=s.get(m.id);(c===void 0||i.includeListed&&ss.has(c))&&(i.includeAdult||!m.isAdult)&&Le(m).every(_=>Vt.has(s.get(_)))&&!(i.exclusions&&nr(i.exclusions,m,o))&&(!i.accept||i.accept(m))&&u.push(m)}const f=e.model.predict(u);return u.map((p,m)=>{const c=((p.averageScore??70)-70)/10,g=new Set(p.tags.filter(h=>h.spoiler).map(h=>`tag:${h.name}`)),_=e.model.contributions(p).filter(([h,y])=>y>0&&!g.has(h)&&!os.some(w=>h.startsWith(w))).slice(0,3).map(([h])=>{const y=h.indexOf(":");return{kind:h.slice(0,y),value:h.slice(y+1)}});return{media:p,score:(f[m]??0)+e.communityWeight*c,reasons:_,sources:a.get(p.id)??[]}}).sort((p,m)=>m.score-p.score).slice(0,i.limit??20)}const jr=500,Yt=50,Mn=720*3600*1e3;async function zr(e,t,n,i,s=()=>{}){const o=[],r=[],a=new Map,u=new Map,f=new Set;for(let m=1;;m++){s(`Reading your ${i.toLowerCase()} list`);const c=await e.query(zo,{userName:n,type:i,chunk:m,perChunk:jr}),g=jo(c);for(const[_,h]of g.entries.entries()){if(f.has(h.mediaId))continue;f.add(h.mediaId),o.push(h);const y=g.media[_];y&&r.push(y)}for(const[_,h]of g.recommendations)a.set(_,h);for(const[_,h]of g.customLists)u.set(_,new Set([...u.get(_)??[],...h]));if(!g.hasNext)break}await t.putMedia(r),await t.putList(n,i,o),await t.putRecommendations(a),await t.putCustomLists(n,i,u);const d=new Map(r.map(m=>[m.id,m])),p=await rs(e,t,o,d,a,s);return{entries:o.length,candidatesFetched:p}}async function Ur(e,t,n,i,s,o=new Map,r=()=>{},a=Mn){const u=new Set,f=s.filter(w=>!u.has(w.mediaId)&&!!u.add(w.mediaId));await t.putList(n,i,f),await t.putCustomLists(n,i,o);const d=f.map(w=>w.mediaId),p=new Set((await t.recommendationsFrom(d)).map(([w])=>w)),m=new Set([...await t.missingOrStale(d,a),...d.filter(w=>!p.has(w))]),c=d.filter(w=>m.has(w)),g=`Fetching details of your ${i==="ANIME"?"anime":"manga"} list`;await as(e,Wo,c,async w=>{await t.putMedia(w.map(vt)),await t.putRecommendations(new Map(w.map(S=>[S.id,Yi(S)])))},(w,S)=>r(g,w,S));const _=await t.getMedia(d),h=new Map;for(const[w,S,b]of await t.recommendationsFrom(d))h.set(w,[...h.get(w)??[],[S,b]]);const y=await rs(e,t,f,_,h,r);return{entries:f.length,candidatesFetched:y}}async function rs(e,t,n,i,s,o){const r=new Set(st(n,i).filter(ns).map(u=>u.media.id)),a=new Set;for(const[u,f]of s)if(r.has(u))for(const[d]of f)i.has(d)||a.add(d);return wt(e,t,a,Mn,(u,f)=>o("Fetching recommended titles",u,f))}async function wt(e,t,n,i=Mn,s=()=>{}){const o=await t.missingOrStale(n,i);return await as(e,Uo,o,async r=>t.putMedia(r.map(vt)),s),o.length}async function as(e,t,n,i,s){const o=Ht(Ht(n,Yt),Vi);if(!o.length)return;let r=0;s(0,o.length),await Promise.all(o.map(async a=>{const u=await e.queryMany(t,a.map(f=>({ids:f,page:1,perPage:Yt})));await i(u.flatMap(f=>f.Page.media)),s(++r,o.length)}))}async function Zn(e,t,n,i){const s=i.map(a=>({type:n,page:a.page??1,perPage:a.perPage??Yt,...Object.fromEntries(Object.entries(a.variables).filter(([,u])=>Wr(u)))})),r=(await Promise.all(Ht(s,Vi).map(a=>e.queryMany(Ho,a)))).flat().map(a=>a.Page.media.map(vt));return await t.putMedia(r.flat()),r}function Wr(e){return Array.isArray(e)?e.length>0:e!=null&&e!==!1&&e!==0&&e!==""}const Hr=6,Gr=720*3600*1e3;class Kt extends Error{constructor(t){super(t),this.name="NoSyncedList"}}function Jt(e={}){return{limit:20,discover:!0,includeAdult:!1,filters:_e(),...e}}async function Xn(e,t,n,i,s=Jt(),o=()=>{}){const r=await e.getList(n,i);if(!r.length)throw new Kt(`no synced ${i.toLowerCase()} list for ${n}`);const a=await e.getList(n,$t(i)),u=new Map;await ce(e,u,[...r,...a].map(M=>M.mediaId));const f=(await e.getExclusions(n)).notInterested??[];await ce(e,u,f);const d=f.flatMap(M=>{const x=u.get(M);return x?[x]:[]}),p=Or(r,u,a,u,d),m=s.discover?t:null,c=new Set(r.map(M=>M.mediaId)),{filters:g}=s,_=[],h=[];let y;try{y=await ei(e,n,i,u,m)}catch(M){if(!(M instanceof Q))throw M;h.push(`sequels of excluded titles may be missed: ${M.message}`),y=await ei(e,n,i,u,null)}const w=yt(g);y={...y,labels:new Set([...y.labels,...g.exclude??[]].filter(M=>!w.has(M)))};let S;try{S=new nt(await Ee(e,m))}catch(M){if(!(M instanceof Q))throw M;h.push(`main themes judged without tag categories: ${M.message}`),S=new nt(await Ee(e,null))}try{const{liked:M,disliked:x}=Pr(p.model),O=er(y),V={tagNotIn:[...new Set([...x,...O])].sort(),genreNotIn:tr(y),idNotIn:[...new Set([...c,...y.mediaIds])].sort((H,Y)=>H-Y),...hr(g)};if(m){const H=M.filter(j=>!O.includes(j)),Y=H.map(j=>({variables:{...V,tagIn:[j,...g.tags]},perPage:30})),U={...V,tagNotIn:[...O].sort()},E=Vn(g)?g.countries.length>1?g.countries.map(j=>({...U,countryOfOrigin:j})):[U]:[];o(Y.length?"Searching AniList by your top tags":"Searching AniList");const $=await Zn(m,e,i,[...Y,...E.map(j=>({variables:j,perPage:50,page:1}))]);for(const[j,se]of H.entries())for(const Be of $[j]??[])_.push([Be.id,`top-scored with ${se}`]);const F=j=>{for(const se of j)_.push([se.id,"top-scored for your filters"]);return j.filter(se=>Yn(g,se,S)).length},Fe=E.flatMap((j,se)=>{const Be=$[H.length+se]??[],bo=F(Be);return Be.length<50||bo>=s.limit?[]:Array.from({length:Hr-1},(Fc,So)=>({variables:j,perPage:50,page:So+2}))});if(Fe.length){o("Searching AniList with your filters");for(const j of await Zn(m,e,i,Fe))F(j)}}}catch(M){if(!(M instanceof Q))throw M;h.push(`some candidates skipped: ${M.message}`)}o("Ranking");const b=await e.recommendationsFrom(p.likedIds),v=Dr(p,b,{extra:_,includeListed:!g.hideListed});await ce(e,u,v.keys()),await Vr(e,u,v.keys(),m,h);let k=null;if(g.hideSeenAdaptations)if(await e.lastSynced(n,$t(i))===null){const M=$t(i).toLowerCase();h.push(`sync your ${M} list to hide titles you\'ve finished as ${M}`)}else k=await Yr(e,u,a,i);const A=g.hideListed?await Kr(e,u,r,i):null,C=Vn(g),I=M=>(!C||Yn(g,M,S))&&dr(g,M)&&!(k&&Qn(k,M))&&!(A&&Qn(A,M));let L=Br(p,v,u,{limit:s.limit,includeAdult:s.includeAdult,exclusions:y,lookup:ye(u),accept:I,includeListed:!g.hideListed});return m&&(L=await qr(m,e,L,h)),{recommendations:L,profile:p,warnings:h}}async function ei(e,t,n,i,s){const o=await e.getExclusions(t),r=new Set(o.titles),a=await e.getCustomLists(t,n);for(const f of o.customLists[n])for(const d of a.get(f)??[])r.add(d);const u=async f=>{s&&await wt(s,e,f),await ce(e,i,f,!0)};return{mediaIds:await sr(r,ye(i),u),labels:new Set(o.labels)}}async function Ee(e,t){const n=await e.getMeta("tag_categories");if(n){const o=JSON.parse(n);if(!t||Date.now()-o.at<Gr)return o.categories}if(!t)return{};const i=await t.query(qo),s=Object.fromEntries(i.MediaTagCollection.map(o=>[o.name,o.category]));return await e.setMeta("tag_categories",JSON.stringify({at:Date.now(),categories:s})),s}async function qr(e,t,n,i){const s=n.filter(r=>!r.media.coverUrl||r.media.scoreDistribution===null).map(r=>r.media.id);if(!s.length)return n;try{await wt(e,t,s,0)}catch(r){if(!(r instanceof Q))throw r;return i.push(`some covers and ratings skipped: ${r.message}`),n}const o=await t.getMedia(s);return n.map(r=>({...r,media:o.get(r.media.id)??r.media}))}async function ce(e,t,n,i=!1){const s=[...n].filter(o=>i||!t.has(o));for(const[o,r]of await e.getMedia(s))t.set(o,r)}async function Vr(e,t,n,i,s){const o=new Set(n);let r=new Set(o);for(let a=0;a<_t&&r.size;a++){const u=new Set;for(const f of r){const d=t.get(f);if(d)for(const p of Le(d))o.has(p)||u.add(p)}if(!u.size)break;if(i)try{await wt(i,e,u)}catch(f){if(!(f instanceof Q))throw f;s.push(`first seasons of some sequels may be missed: ${f.message}`),i=null}await ce(e,t,u);for(const f of u)o.add(f);r=u}}async function Yr(e,t,n,i){const s=Kn(n,i,ye(t));return await ce(e,t,s.linked),Kn(n,i,ye(t))}async function Kr(e,t,n,i){const s=Jn(n,i,ye(t));return await ce(e,t,s.linked),Jn(n,i,ye(t))}function ye(e){return t=>new Map([...t].flatMap(n=>e.has(n)?[[n,e.get(n)]]:[]))}function Jr(){return{titles:[],labels:[],customLists:{ANIME:[],MANGA:[]},notInterested:[]}}class xe{media=new Map;lists=new Map;links=new Map;customLists=new Map;exclusions=new Map;meta=new Map;now;constructor(t=Date.now){this.now=t}async getMedia(t){const n=new Map;for(const i of t){const s=this.media.get(i);s&&n.set(i,s.media)}return n}async putMedia(t){const n=this.now();for(const i of t)this.media.set(i.id,{media:i,fetchedAt:n})}async missingOrStale(t,n){const i=this.now()-n;return[...new Set(t)].filter(s=>(this.media.get(s)?.fetchedAt??-1/0)<i).sort((s,o)=>s-o)}async getList(t,n){return[...this.lists.get(Me(t,n))?.entries??[]]}async putList(t,n,i){this.lists.set(Me(t,n),{entries:[...i],syncedAt:this.now()})}async lastSynced(t,n){return this.lists.get(Me(t,n))?.syncedAt??null}async putRecommendations(t){for(const[n,i]of t)this.links.set(n,[...i])}async recommendationsFrom(t){return[...new Set(t)].flatMap(n=>(this.links.get(n)??[]).map(([i,s])=>[n,i,s]))}async getCustomLists(t,n){const i=this.customLists.get(Me(t,n))??new Map;return new Map([...i].map(([s,o])=>[s,new Set(o)]))}async putCustomLists(t,n,i){this.customLists.set(Me(t,n),new Map([...i].map(([s,o])=>[s,new Set(o)])))}async getExclusions(t){return structuredClone(this.exclusions.get(t.toLowerCase())??Jr())}async putExclusions(t,n){this.exclusions.set(t.toLowerCase(),structuredClone(n))}async getMeta(t){return this.meta.get(t)??null}async setMeta(t,n){this.meta.set(t,n)}toJSON(){return{media:[...this.media],lists:[...this.lists],links:[...this.links],customLists:[...this.customLists].map(([t,n])=>[t,[...n].map(([i,s])=>[i,[...s]])]),exclusions:[...this.exclusions],meta:[...this.meta]}}static fromJSON(t,n=Date.now){const i=new xe(n);return i.media=new Map(t.media),i.lists=new Map(t.lists),i.links=new Map(t.links),i.customLists=new Map(t.customLists.map(([s,o])=>[s,new Map(o.map(([r,a])=>[r,new Set(a)]))])),i.exclusions=new Map(t.exclusions),i.meta=new Map(t.meta),i}}function Me(e,t){return`${e.toLowerCase()}:${t}`}var Ce,R,Lt,ti,Qt=Object.is,Ne=0,ls=[],Zt=[],D=N,ni=D.__b,ii=D.__r,si=D.diffed,oi=D.__c,ri=D.unmount,ai=D.__;function kn(e,t){D.__h&&D.__h(R,e,Ne||t),Ne=0;var n=R.__H||(R.__H={__:[],__h:[]});return e>=n.__.length&&n.__.push({}),n.__[e]}function T(e){return Ne=1,Qr(us,e)}function Qr(e,t,n){var i=kn(Ce++,2);if(i.t=e,!i.__c&&(i.__=[us(void 0,t),function(o){var r=(i.__N||i.__)[0],a=i.t(r,o);Qt(r,a)||(i.__N=[a,i.__[1]],i.__c.setState({}))}],i.__c=R,!R.__f)){R.__f=!0;var s=R.shouldComponentUpdate;R.shouldComponentUpdate=function(o,r,a){var u=this.__H;if(!u)return!0;var f=!1,d=this.props!=o;if(u.__.some(function(m){m.__N&&(f=!0,Qt(m.__[0],m.__N[0])||(d=!0))}),s){var p=s.call(this,o,r,a);return f?p||d:p}return!f||d}}return i.__}function z(e,t){var n=kn(Ce++,3);!D.__s&&cs(n.__H,t)&&(n.__P=!0,n.__=e,n.u=t,R.__H.__h.push(n))}function Ie(e){return Ne=5,Oe(function(){return{current:e}},[])}function Oe(e,t){var n=kn(Ce++,7);return cs(n.__H,t)&&(n.__=e(),n.__H=t),n.__}function te(e,t){return Ne=8,Oe(function(){return e},t)}function Zr(){var e;do{for(;e=Zt.shift();)try{Ae(e)}catch(n){D.__e(n,{__:(e=e.__P)&&e.__v})}for(;e=ls.shift();){var t=e.__H;if(e.__P&&t)try{t.__h.some(Ae),t.__h.some(Xt),t.__h=[]}catch(n){t.__h=[],D.__e(n,e.__v)}}}while(Zt.length)}D.__b=function(e){R=null,ni&&ni(e)},D.__=function(e,t){e&&t.__k&&t.__k.__m&&(e.__m=t.__k.__m),ai&&ai(e,t)},D.__r=function(e){ii&&ii(e),Ce=0;var t=(R=e.__c).__H;t&&(Lt==R?R.__h=[]:(t.__h.some(Ae),t.__h.some(Xt),Ce=0),t.__h=[],t.__.some(function(n){n.__N&&(n.__=n.__N),n.u=n.__N=void 0})),Lt=R},D.diffed=function(e){si&&si(e);var t=e.__c;t&&t.__H&&(t.__H.__h.length&&ci(ls.push(t)),t.__H.__.some(function(n){n.u&&(n.__H=n.u)})),Lt=R=null},D.__c=function(e,t){t.some(function(n){try{n.__h.some(Ae),n.__h=n.__h.filter(function(i){return!i.__||Xt(i)})}catch(i){n.__h=[function(){throw i}]}}),oi&&oi(e,t)},D.unmount=function(e){ri&&ri(e);var t,n,i=e.__c;i&&i.__H&&(i.__H.__.some(function(s){try{if(s.__P&&s.__c){if(n===void 0){for(n=e.__;n&&(!n.__c||!n.__c.__P);)n=n.__;n=n&&n.__c}s.__P=n,ci(Zt.push(s))}else Ae(s)}catch(o){t=o}}),i.__H=void 0,t&&D.__e(t,i.__v))};var li=typeof requestAnimationFrame=="function";function Xr(e){var t,n=function(){clearTimeout(i),li&&cancelAnimationFrame(t),setTimeout(e)},i=setTimeout(n,35);li&&(t=requestAnimationFrame(n))}function ci(e){e!=1&&ti==D.requestAnimationFrame||((ti=D.requestAnimationFrame)||Xr)(Zr)}function Ae(e){var t=R,n=e.__c;typeof n=="function"&&(e.__c=void 0,n()),R=t}function Xt(e){var t=R;e.__c=e.__(),R=t}function cs(e,t){return!e||e.length!=t.length||t.some(function(n,i){return!Qt(n,e[i])})}function us(e,t){return typeof t=="function"?t(e):t}const ea="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiBwcmVzZXJ2ZUFzcGVjdFJhdGlvPSJ4TWlkWU1pZCIgd2lkdGg9IjE3MiIgaGVpZ2h0PSIxNzIiIHZpZXdCb3g9IjAgMCAxNzIgMTcyIj48ZGVmcz48c3R5bGU+IC5jbHMtMSB7IGZpbGw6ICMwMmE5ZmY7IH0gLmNscy0xLCAuY2xzLTIgeyBmaWxsLXJ1bGU6IGV2ZW5vZGQ7IH0gLmNscy0yIHsgZmlsbDogI2ZlZmVmZTsgfSA8L3N0eWxlPjwvZGVmcz48Zz48cGF0aCBkPSJNMTExLjMyMiwxMTEuMTU3IEwxMTEuMzIyLDQxLjAyOSBDMTExLjMyMiwzNy4wMTAgMTA5LjEwNSwzNC43OTIgMTA1LjA4NiwzNC43OTIgTDkxLjM2NSwzNC43OTIgQzg3LjM0NiwzNC43OTIgODUuMTI4LDM3LjAxMCA4NS4xMjgsNDEuMDI5IEM4NS4xMjgsNDEuMDI5IDg1LjEyOCw1Ni4zMzcgODUuMTI4LDc0LjMzMyBDODUuMTI4LDc1LjI3MSA5NC4xNjUsNzkuNjI2IDk0LjQwMSw4MC41NDcgQzEwMS4yODYsMTA3LjQ0OSA5NS44OTcsMTI4Ljk4MCA4OS4zNzAsMTI5Ljk4NSBDMTAwLjA0MiwxMzAuNTEzIDEwMS4yMTYsMTM1LjY0NCA5My4yNjcsMTMyLjEzOCBDOTQuNDgzLDExNy43ODQgOTkuMjI4LDExNy44MTIgMTEyLjg2OSwxMzEuNjEwIEMxMTIuOTg2LDEzMS43MjkgMTE1LjY2NiwxMzcuMzUxIDExNS44MzMsMTM3LjM1MSBDMTMxLjE3MCwxMzcuMzUxIDE0OC4wNTAsMTM3LjM1MSAxNDguMDUwLDEzNy4zNTEgQzE1Mi4wNjksMTM3LjM1MSAxNTQuMjg2LDEzNS4xMzQgMTU0LjI4NiwxMzEuMTE1IEwxNTQuMjg2LDExNy4zOTQgQzE1NC4yODYsMTEzLjM3NSAxNTIuMDY5LDExMS4xNTcgMTQ4LjA1MCwxMTEuMTU3IEwxMTEuMzIyLDExMS4xNTcgWiIgY2xhc3M9ImNscy0xIi8+PHBhdGggZD0iTTU0LjM2NSwzNC43OTIgTDE4LjMzMSwxMzcuMzUxIEw0Ni4zMjcsMTM3LjM1MSBMNTIuNDI1LDExOS42MTEgTDgyLjkxNSwxMTkuNjExIEw4OC44NzUsMTM3LjM1MSBMMTE2LjczMiwxMzcuMzUxIEw4MC44MzYsMzQuNzkyIEw1NC4zNjUsMzQuNzkyIFpNNTguODAwLDk2Ljg4MiBMNjcuNTMxLDY4LjQ3MCBMNzcuMDk0LDk2Ljg4MiBMNTguODAwLDk2Ljg4MiBaIiBjbGFzcz0iY2xzLTIiLz48L2c+PC9zdmc+",Ze=["ANIME","MANGA"],ui={limit:20,includeAdult:!1,showRatings:!0,titleLanguage:"english",advancedOpen:!1,filters:{ANIME:_e(),MANGA:_e()},tourSeen:!1},pe=200;function ke(e,t){const n=e.titles;return n?(t==="native"?[n.native,n.romaji,n.english]:t==="romaji"?[n.romaji,n.english]:[n.english,n.romaji]).find(s=>s)??e.title:e.title}const di="ui-settings",fi="ui-synced-at",ta=800;class En{constructor(t,n,i,s){this.host=t,this.store=n,this.user=i,this.client=s??new Ro(t.transport)}host;store;user;client;saveTimer=null;themes=null;details=new Map;taste=new Map;static async open(t,n,i){const s=await t.loadStore(),o=s?xe.fromJSON(JSON.parse(s)):new xe;return new En(t,o,n,i)}async lastSynced(){const t=await this.store.getMeta(fi);return t?Number(t):null}async sync(t=()=>{}){for(const n of Ze){if(t(`Reading your ${n.toLowerCase()} list`),this.host.list){const i=await this.host.list(n),s=new Map(Object.entries(i.customLists).map(([o,r])=>[o,new Set(r)]));await Ur(this.client,this.store,this.user,n,i.entries,s,t)}else await zr(this.client,this.store,this.user,n,t);this.taste.delete(n)}await this.store.setMeta(fi,String(Date.now())),await this.save(!0)}async settings(){const t=await this.store.getMeta(di);if(!t)return structuredClone(ui);const n=JSON.parse(t);return{...ui,...n,filters:{ANIME:_e(n.filters?.ANIME??{}),MANGA:_e(n.filters?.MANGA??{})}}}async setSettings(t){await this.store.setMeta(di,JSON.stringify(t)),await this.save()}async picks(t){const n=await this.store.getMeta(`ui-picks:${t}`);return n?JSON.parse(n):null}async recommend(t,n=()=>{},i=pe){const s=await this.settings();let o;try{o=await Xn(this.store,this.client,this.user,t,Jt({limit:i,includeAdult:s.includeAdult,filters:s.filters[t]}),n)}catch(a){if(a instanceof Kt)return null;throw a}this.taste.set(t,hi(o));const r={at:Date.now(),recommendations:o.recommendations,warnings:o.warnings};return await this.store.setMeta(`ui-picks:${t}`,JSON.stringify(r)),await this.save(),r}async tasteFor(t){const n=this.taste.get(t);if(n)return n;try{const i=await Xn(this.store,null,this.user,t,Jt({limit:1})),s=hi(i);return this.taste.set(t,s),s}catch(i){if(i instanceof Kt)return null;throw i}}async themesOf(t){if(!this.themes){const n=await Ee(this.store,null);if(!Object.keys(n).length)return new nt(n).summary(t);this.themes=new nt(n)}return this.themes.summary(t)}async tagNames(){try{return Object.keys(await Ee(this.store,this.client)).sort()}catch{return Object.keys(await Ee(this.store,null)).sort()}}async dropPicks(t,n=Ze){const i={};for(const s of Ze){const o=await this.picks(s);if(!o||!n.includes(s)){i[s]=o;continue}const r={...o,recommendations:o.recommendations.filter(a=>!t(a.media))};r.recommendations.length!==o.recommendations.length&&await this.store.setMeta(`ui-picks:${s}`,JSON.stringify(r)),i[s]=r}return await this.save(),i}async excludeLabels(t,n){const i=await this.settings(),s=i.filters[t],o=yt(s),r=n.filter(f=>!o.has(f)&&!s.exclude.includes(f)),a={...i,filters:{...i.filters,[t]:{...s,exclude:[...s.exclude,...r]}}};await this.setSettings(a);const u=await this.dropPicks(f=>{const d=Gt(f);return r.some(p=>d.has(p))},[t]);return{settings:a,excluded:r,left:u}}async blacklist(t){const n=await this.setExclusions(i=>i.labels.push(...t));return await this.dropPicks(i=>{const s=Gt(i);return t.some(o=>s.has(o))}),n}async notInterested(t){return await this.setExclusions(n=>{n.titles.push(t.id),n.notInterested=[...n.notInterested??[],t.id]}),this.dropPicks(n=>n.id===t.id)}async excludeTitle(t){return await this.setExclusions(n=>n.titles.push(t.id)),this.dropPicks(n=>n.id===t.id)}async titleDetails(t){const n=this.details.get(t);if(n)return n;const i=await this.client.query(Go,{id:t}),s=Qo(i.Media),o={...s,description:ia(s.description)};return this.details.set(t,o),o}async exclusions(){return this.store.getExclusions(this.user)}async setExclusions(t){const n=structuredClone(await this.exclusions());return t(n),n.titles=[...new Set(n.titles)],n.labels=[...new Set(n.labels)],n.notInterested=[...new Set(n.notInterested??[])],await this.store.putExclusions(this.user,n),await this.save(),n}async customListNames(t){return[...(await this.store.getCustomLists(this.user,t)).keys()].sort()}async media(t){return this.store.getMedia(t)}async addToPlanning(t){if(!this.host.addToPlanning)throw new Error("this host can\'t change your list");const n=await this.store.getList(this.user,t.type);if(n.some(s=>s.mediaId===t.id))throw new Error("it\'s already on your list");await this.host.addToPlanning(t);const i={mediaId:t.id,status:"PLANNING",score:0,progress:0,repeat:0,updatedAt:Math.floor(Date.now()/1e3)};await this.store.putList(this.user,t.type,[...n,i]),await this.save()}async clear(){await this.host.saveStore(JSON.stringify(new xe().toJSON()))}async save(t=!1){this.saveTimer&&clearTimeout(this.saveTimer),this.saveTimer=null;const n=()=>this.host.saveStore(JSON.stringify(this.store.toJSON()));if(t)return n();this.saveTimer=setTimeout(()=>{this.saveTimer=null,n()},ta)}}const na=2;function hi(e){const{profile:t}=e,n=t.entries,i=new Map;for(const r of n){const a=t.media.get(r.mediaId);if(a)for(const u of Qe(a).keys())i.set(u,(i.get(u)??0)+1)}const s=t.model.weights().filter(([r])=>!os.some(a=>r.startsWith(a))&&r.includes(":")&&(i.get(r)??0)>=na),o=n.filter(r=>r.score>0);return{onList:n.length,scored:o.length,mean:o.length?o.reduce((r,a)=>r+a.score,0)/o.length/10:null,learnedFrom:st(n,t.media).length,likes:s.filter(([,r])=>r>0).slice(0,8),likedTags:s.filter(([r,a])=>a>0&&r.startsWith("tag:")).slice(0,10).map(([r])=>r.slice(4)),dislikes:s.filter(([,r])=>r<0).sort((r,a)=>r[1]-a[1]).slice(0,8)}}function ia(e){return e.replace(/<br\\s*\\/?>/gi,`\n`).replace(/<[^>]+>/g,"").replace(/\\n{3,}/g,`\n\n`).trim()}function ds(e,t,n){fs(e);let i={step:t,controller:new AbortController,placeholder:n,latched:!1};return e.state.__activation=i,e.state.__lastAnnouncement=void 0,i}function fs(e){let t=e.state.__activation;t&&(e.state.__activation=void 0,t.waitController?.abort(),t.controller.abort())}function we(e,t){return e.state.__activation===t}function hs(e,t,n){e.state.__keepReturnFocus||(e.state.__activeOnDestroyed=document.activeElement),e.state.__keepReturnFocus=n,e.state.activeIndex=t}function sa(e,t){e.state.__transitionCallback=t}function bt(e){return!!e.state.__transitionCallback}function pi(e,t){return e.state.__transitionCallback===t}function oa(e){let t=!!e.state.__refreshMissed;return e.state.__transitionCallback=void 0,t&&(e.state.__refreshMissed=!1),t}function ra(e){e.state.__refreshMissed=!0}function aa(e,t){let n=e.state.__activation;n&&(n.waitController?.abort(),n.waitController=void 0,n.wait=t)}function la(e){let t=e.state.__activation;return t?.wait?(t.wait=void 0,t.waitController?.abort(),t.waitController=void 0,!0):!1}function Re(e){return!!e.state.__activation?.wait}function en(e,t){e.state.__pendingWaitCancel=t}function xn(e){return!!e.state.__pendingWaitCancel}function Ct(e){let t=e.state.__pendingWaitCancel;t&&(en(e),t())}function ot(e){let t=e.state.__activation;return t?.placeholder&&{...t.placeholder,step:t.step}}function ue(e){return ot(e)?.step??e.state.__activeStep}function ca(e){let t=e.state.__activation;return t?.placeholder?(t.placeholder=void 0,!0):!1}function mi(e,t){e.settling=t}function ua(e,t){return!we(e,t)||t.latched?!1:(t.latched=!0,!0)}function da(e){e.done=!0}function tn(e,t){!we(e,t)||xn(e)||(t.latched=!1,t.recheck?.())}function ps(e,t){return t.latched||xn(e)}function gi(e,t){return!!t.settling||ps(e,t)}function ms(e,t){let n=e.state.__activation;return n?.step===t&&!!n.done}function P(e,t,n){return t?.[n]??e.config[n]}function An(e){return!!P(e,e.state.activeStep,"allowPageInteraction")}function gs(e,t){if(t.advanceOn!==void 0)return t.advanceOn||void 0;if(t.advanceOnClick!==void 0)return t.advanceOnClick?"click":void 0;let n=e.config.advanceOn;return n===void 0?e.config.advanceOnClick?"click":void 0:n||void 0}function fa(e,t){return t.advanceOn===void 0?t.advanceOnClick??(e.config.advanceOn===void 0&&!!e.config.advanceOnClick):!1}function Tn(e){return e?typeof e=="string"||Array.isArray(e)?{types:[e].flat()}:{types:[e.event].flat(),when:e.when,strict:e.strict}:{types:[]}}const de=["press0","click"],vs={click:de,dblclick:[...de,"dblclick"],mousedown:de,mouseup:de,pointerdown:de,pointerup:de,contextmenu:["press2","contextmenu","auxclick"],auxclick:["press1","press2","auxclick"]};function rt(e){return e in vs}function nn(e,t={}){e.config={animate:!0,duration:400,allowClose:!0,allowScroll:!0,overlayClickBehavior:"close",overlayOpacity:.7,smoothScroll:!1,disableActiveInteraction:!1,advanceOnClick:!1,skipMissingElement:!1,waitForElement:0,showProgress:!1,stagePadding:10,stageRadius:5,popoverOffset:10,showButtons:["next","previous","close"],disableButtons:[],overlayColor:"#000",...t}}function B(e,t,n){let i=t||e.state;return{config:e.config,state:i,driver:e.driver,index:i.activeIndex,...n?{reason:n}:{}}}function ha(e,t,n){let i={tour:n,ui:t,config:{},state:{},consumed:new WeakSet};return nn(i,e),Object.assign(i.tour,t.controls?.(i)),i}const _s=["pointerdown","mousedown","pointerup","mouseup","click"],sn=new WeakMap;function ys(e,t,n){$n(e);let i=s=>{let o=s.target;e.contains(o)&&((!n||n(o))&&(s.preventDefault(),s.stopPropagation(),s.stopImmediatePropagation()),s.type==="click"&&t?.(s))};for(let s of _s)document.addEventListener(s,i,!0);sn.set(e,i)}function $n(e){let t=sn.get(e);if(t){for(let n of _s)document.removeEventListener(n,t,!0);sn.delete(e)}}function be(e){return typeof e=="function"?e():typeof e=="string"?document.querySelector(e):e}const on="driver-dummy-element";function q(e){return!e||e.id==="driver-dummy-element"}const me="driver-allowed-element",at="driver-active-element-raised",ws="driver-page-interactive";function lt(e){return!!e.closest(`.${me}`)}function pa(e){let t=window.getComputedStyle(e);return[t.overflow,t.overflowX,t.overflowY].some(n=>n==="auto"||n==="scroll")}function ze(e,t,n,i){return(e/=i/2)<1?n/2*e*e+t:-n/2*(--e*(e-2)-1)+t}const vi=\'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, audio[controls], video[controls], [contenteditable]:not([contenteditable="false"]), [tabindex]:not([tabindex="-1"]):not([disabled])\';function ma(e){return e.flatMap(t=>{let n=t.matches(vi),i=Array.from(t.querySelectorAll(vi));return[...n?[t]:[],...i]})}function ga(e){return getComputedStyle(e).pointerEvents!=="none"&&Ma(e)}function bs(e){return ma(e).filter(ga)}function Ss(e,t,n){if(!e||_a(e))return;let i=e.offsetHeight>window.innerHeight;e.scrollIntoView({behavior:!t||va(e)?"auto":"smooth",inline:n?.inline??"center",block:n?.block??(i?"start":"center")})}function va(e){if(!e||!e.parentElement)return;let t=e.parentElement;return t.scrollHeight>t.clientHeight}function _a(e){let t=e.getBoundingClientRect();return t.top>=0&&t.left>=0&&t.bottom<=(window.innerHeight||document.documentElement.clientHeight)&&t.right<=(window.innerWidth||document.documentElement.clientWidth)&&!Sa(e,t)}function _i(e){let t=e.assignedSlot??e.parentElement;if(t)return t;let n=e.parentNode;return n instanceof ShadowRoot?n.host:null}function ya(e,t){try{return e.matches(t)}catch{return!1}}function wa(e){return/paint|strict|content/.test(e.contain||"")}function ba(e,t){return t!=="absolute"&&t!=="fixed"||(e.transform||"none")!=="none"||(e.perspective||"none")!=="none"||(e.filter||"none")!=="none"||/layout|paint|strict|content/.test(e.contain||"")||/transform|perspective|filter/.test(e.willChange||"")||t==="absolute"&&e.position!=="static"}const Ue=e=>!!e&&e!=="visible",We=(e,t,n)=>Math.min(Math.max(e,t),n);function Pe(e){let{left:t,top:n,right:i,bottom:s}=e.getBoundingClientRect(),o=getComputedStyle(e).position;for(let r=_i(e);r&&!(r===document.body||r===document.documentElement);r=_i(r)){let a=getComputedStyle(r);if(!ba(a,o))continue;let u=wa(a),f=(a.overflow||"").split(" "),d=u||Ue(a.overflowX)||Ue(f[0]),p=u||Ue(a.overflowY)||Ue(f[1]??f[0]);if(d||p){let m=r.getBoundingClientRect(),c=m.left+r.clientLeft,g=m.top+r.clientTop,_=c+(r.clientWidth||m.width),h=g+(r.clientHeight||m.height);d&&(t=We(t,c,_),i=We(i,c,_)),p&&(n=We(n,g,h),s=We(s,g,h))}if(ya(r,":modal, :popover-open"))break;o=a.position}return new DOMRect(t,n,i-t,s-n)}function Sa(e,t){let n=Pe(e);return n.width<t.width||n.height<t.height}function Ma(e){return!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length)}const yi=new WeakSet;function Ln(e){let t=e.closest("dialog[open]");if(!t)return document.body;if(!("showPopover"in t))return t;let n=t.querySelector(":scope > .driver-layer");return n||(n=document.createElement("div"),n.className="driver-layer",n.setAttribute("popover","manual"),t.appendChild(n)),yi.has(t)||(yi.add(t),t.addEventListener("close",()=>{t.querySelector(":scope > .driver-layer:popover-open")?.hidePopover()})),n.matches(":popover-open")||n.showPopover(),n}function Ms(e){e?.classList.contains("driver-layer")&&!e.childElementCount&&e.remove()}function ks(e){let t=e.parentElement;e.remove(),Ms(t)}function Es(e,t,n=!1){if(n&&t!==document.body){t.prepend(e);return}t.appendChild(e)}function xs(e,t,n=!1){let i=Ln(t),s=e.parentElement;return s===i?!1:(Es(e,i,n),Ms(s),!0)}function ka(e){return e instanceof HTMLElement?e.isContentEditable||!!e.closest("input, textarea, select, [role=combobox], [role=grid], [role=listbox], [role=menu], [role=menubar], [role=radiogroup], [role=slider], [role=spinbutton], [role=tablist], [role=textbox], [role=tree], [role=treegrid]"):!1}const Ea=2**31-1;function As(e){return e>Ea}function wi(e,t,n,i,s,o,r){let a;if(e==="start")a=t-o;else if(e==="end")a=t-i+n+o;else if(e==="center")a=t+n/2-i/2;else return 0;return Math.max(Math.min(a,s-i-r),r)}function St(e,t,n){let{align:i,side:s}=n,o=n.centered?"over":s,r=n.padding,{style:a,classList:u}=e.wrapper,{width:f,height:d}=e.wrapper.getBoundingClientRect(),p=f+n.offset,m=d+n.offset,c=e.arrow.getBoundingClientRect(),g=Pe(t),_=g.top-m,h=_>=0,y=window.innerHeight-(g.bottom+m),w=y>=0,S=g.left-p,b=S>=0,v=window.innerWidth-(g.right+p),k=v>=0,A=c.width,C=()=>wi(i,g.top,g.height,d,window.innerHeight,r,A),I=()=>wi(i,g.left,g.width,f,window.innerWidth,r,A),L=!h&&!w&&!b&&!k,M=o;o==="top"&&h?k=b=w=!1:o==="bottom"&&w?k=b=h=!1:o==="left"&&b?k=h=w=!1:o==="right"&&k&&(b=h=w=!1);let x=(E,$)=>{a[E]=$===void 0?"auto":`${$}px`},O=window.innerWidth/2-f/2,V=window.innerWidth-f-A,H=window.innerHeight-d-A;o==="over"?(x("left",O),x("right"),x("top",window.innerHeight/2-d/2),x("bottom")):L?(x("left",O),x("right"),x("bottom",10),x("top")):b?(x("left",Math.min(S,V)),x("top",C()),x("bottom"),x("right"),M="left"):k?(x("right",Math.min(v,V)),x("top",C()),x("bottom"),x("left"),M="right"):h?(x("top",Math.min(_,H)),x("left",I()),x("bottom"),x("right"),M="top"):w&&(x("left",I()),x("bottom",Math.min(y,H)),x("top"),x("right"),M="bottom"),Aa(e,L?"over":M,i,g);let Y=`driver-popover-side-${M}`,U=`driver-popover-align-${i}`;[...u].filter(E=>E.startsWith("driver-popover-side-")||E.startsWith("driver-popover-align-")).filter(E=>E!==Y&&E!==U).forEach(E=>u.remove(E)),u.contains(Y)||u.add(Y),u.contains(U)||u.add(U),n.onPositioned?.()}function bi(e,t,n,i,s,o=10){let r=i-n;return e<=n&&t>=i?s==="start"?15+o/2:s==="end"?r-15-o/2:r/2:(Math.min(Math.max(e,n),i)+Math.min(Math.max(t,n),i))/2-n}function Si(e,t,n=10){let i=t-15-n;if(i<15)return Math.max(0,(t-n)/2);let s=e-n/2;return Math.min(Math.max(s,15),i)}function xa(e,t,n){return e==="left"||e==="right"?t.bottom>n.top&&t.top<n.bottom?e:t.bottom<=n.top?"bottom":"top":t.right>n.left&&t.left<n.right?e:t.right<=n.left?"right":"left"}function Aa(e,t,n,i){let s=e.arrow;if(s.className="driver-popover-arrow",s.style.top="",s.style.right="",s.style.bottom="",s.style.left="",t==="over"){s.classList.add("driver-popover-arrow-none");return}let o=e.wrapper.getBoundingClientRect(),r=s.getBoundingClientRect().width||10,a=xa(t,i,o);if(s.classList.add(`driver-popover-arrow-side-${a}`),a==="left"||a==="right"){let u=bi(i.top,i.bottom,o.top,o.bottom,n,r);s.style.top=`${Si(u,o.height,r)}px`}else{let u=bi(i.left,i.right,o.left,o.right,n,r);s.style.left=`${Si(u,o.width,r)}px`}}function Ta(e){e&&(e.wrapper.style.display="none")}const Mi=new WeakMap,ki=new WeakMap;function oe(e,t){ki.get(e)!==t&&(e.innerHTML=t,ki.set(e,t))}function J(e,t){e.style.display=t?"":"none"}const Ei=new WeakSet;function Ts(e){e?.setAttribute("tabindex","-1"),e?.focus()}function Te(e,t){let n=e.closest(".driver-popover");t&&document.activeElement===e&&(Ts(n),Ei.add(e)),e.disabled=t,e.classList.toggle($s,t),!t&&Ei.delete(e)&&n&&document.activeElement===n&&e.focus()}const ct="driver-popover-instruction-text",$s="driver-popover-btn-disabled";function $a(e,t,n){let i=(e.getAttribute("aria-describedby")||"").split(/\\s+/).filter(s=>s&&s!==t);n&&i.push(t),e.setAttribute("aria-describedby",i.join(" "))}function Ls(e,t){let n=G("div",t),i=e.footer.parentNode===e.wrapper?e.footer:null;return e.wrapper.insertBefore(n,i),n}function La(e){let t=Ls(e,"driver-popover-instruction"),n=G("span","driver-popover-instruction-indicator");n.setAttribute("aria-hidden","true"),t.append(G("span",ct,ct),n),e.instruction=t,e.instructionIndicator=n}function Ca(e,t){let n=!!t.isGated;(n||t.instruction)&&!e.instruction&&La(e);let{instruction:i,instructionIndicator:s,wrapper:o,nextButton:r}=e;if(!i||!s)return;let a=t.instruction||"";o.classList.toggle("driver-popover-has-instruction",n),o.classList.toggle("driver-popover-instruction-done",n&&!!t.isDone),$a(o,ct,!!a);let u=i.querySelector(`:scope > .${ct}`);u&&a&&oe(u,a),J(i,!!a),n?(r.setAttribute("aria-disabled","true"),r.classList.add($s)):r.removeAttribute("aria-disabled")}function Na(e,t){t.feedback&&!e.feedback&&(e.feedback=Ls(e,"driver-popover-feedback")),e.feedback&&(oe(e.feedback,t.feedback||""),J(e.feedback,!!t.feedback))}function Cs(e,t){let{title:n,description:i,showButtons:s,disableButtons:o,showProgress:r,nextBtnText:a,prevBtnText:u,progressText:f}=t;oe(e.nextButton,a),oe(e.previousButton,u),oe(e.progress,f),e.closeButton.setAttribute("aria-label",t.closeBtnLabel),e.nextButton.classList.toggle("driver-popover-done-btn",!!t.doneButton),n&&oe(e.title,n),J(e.title,!!n),i&&oe(e.description,i),J(e.description,!!i);let d=s.includes("next")||s.includes("previous")||r;J(e.closeButton,s.includes("close")),J(e.footer,d),J(e.progress,r),J(e.nextButton,s.includes("next")),J(e.previousButton,s.includes("previous")),Te(e.nextButton,o.includes("next")),Te(e.previousButton,o.includes("previous")),Te(e.closeButton,o.includes("close")),Ca(e,t),Na(e,t);let p=e.wrapper;p.classList.remove(...Mi.get(p)||[]);let m=(t.popoverClass||"").split(/\\s+/).filter(Boolean);p.classList.add(...m),Mi.set(p,m)}function Ia(e,t){if(e.disabled)return!0;for(let n=e;n&&n!==t;n=n.parentElement)if(n.style?.display==="none")return!0;return!1}function Oa(e,t,n){let i=document.activeElement,s=!!i&&e.wrapper.contains(i)&&i!==e.wrapper;Cs(e,n),s&&(!i.isConnected||Ia(i,e.wrapper))&&(e.wrapper.setAttribute("tabindex","-1"),e.wrapper.focus()),St(e,t,n.position),Ns(e,t,n.position)}function Pa(e,t){let n=Ra();Ln(e).appendChild(n.wrapper);let i=n.wrapper;return i.className="driver-popover",Cs(n,t),i.style.display="block",i.style.left="",i.style.top="",i.style.bottom="",i.style.right="",i.id="driver-popover-content",i.setAttribute("role","dialog"),i.setAttribute("aria-labelledby","driver-popover-title"),n.arrow.className="driver-popover-arrow",ys(n.wrapper,s=>{let o=s.target instanceof Element?s.target:s.target?.parentElement;if(o){if(o.closest(".driver-popover-next-btn"))return t.onNextClick?.();if(o.closest(".driver-popover-prev-btn"))return t.onPrevClick?.();if(o.closest(".driver-popover-close-btn"))return t.onCloseClick?.()}},s=>n.description.contains(s)||n.title.contains(s)?!1:!!s.closest(".driver-popover-prev-btn, .driver-popover-next-btn, .driver-popover-close-btn")),t.onRender?.(n),St(n,e,t.position),Ns(n,e,t.position),t.scrollIntoView!==!1&&Ss(i,t.smoothScroll,{block:"nearest",inline:"nearest"}),t.keepFocus||Da(n),n}function Da(e){let{nextButton:t,wrapper:n}=e;t.isConnected&&t.style.display!=="none"&&!t.disabled&&!t.hasAttribute("aria-disabled")&&t.focus(),document.activeElement!==t&&Ts(n)}const xi=new WeakMap,Nt=new WeakSet;function Ns(e,t,n){xi.set(e,{anchor:t,position:n}),e.wrapper.querySelectorAll("img").forEach(i=>{if(i.complete||Nt.has(i))return;Nt.add(i);let s=()=>{Nt.delete(i);let o=xi.get(e);o&&e.wrapper.isConnected&&St(e,o.anchor,o.position)};i.addEventListener("load",s,{once:!0}),i.addEventListener("error",s,{once:!0})})}function G(e,t,n){let i=document.createElement(e);return n&&(i.id=n),i instanceof HTMLButtonElement&&(i.type="button"),i.className=t,i}function Ra(){let e=G("div","driver-popover");e.setAttribute("aria-describedby","driver-popover-description");let t=G("div","driver-popover-arrow"),n=G("div","driver-popover-title","driver-popover-title");n.style.display="none",n.innerText="Popover Title";let i=G("div","driver-popover-description","driver-popover-description");i.style.display="none",i.innerText="Popover description is here";let s=G("button","driver-popover-close-btn");s.innerHTML="&times;";let o=G("div","driver-popover-footer"),r=G("span","driver-popover-progress-text"),a=G("span","driver-popover-navigation-btns"),u=G("button","driver-popover-prev-btn driver-popover-footer-btn");u.innerHTML="Previous";let f=G("button","driver-popover-next-btn driver-popover-footer-btn");return f.innerHTML="Next",a.append(u,f),o.append(r,a),e.append(s,t,n,i,o),{wrapper:e,arrow:t,title:n,description:i,footer:o,previousButton:u,nextButton:f,closeButton:s,footerButtons:a,progress:r}}function Cn(e){e&&($n(e.wrapper),ks(e.wrapper))}const Ai="http://www.w3.org/2000/svg";function Is(){return`0 0 ${window.innerWidth} ${window.innerHeight}`}function Fa(e,t,n,i){let s=document.createElementNS(Ai,"svg");s.setAttribute("class",e),s.setAttribute("viewBox",Is()),s.setAttribute("preserveAspectRatio","xMinYMin slice"),s.style.fillRule="evenodd";let o=document.createElementNS(Ai,"path");return o.setAttribute("d",t),o.style.fill=n,o.style.opacity=`${i}`,o.style.pointerEvents="auto",s.appendChild(o),s}function Os(e,t){let n=e.width+t.padding*2,i=e.height+t.padding*2,s=Math.min(t.radius,n/2,i/2);return{x:e.x-t.padding,y:e.y-t.padding,width:n,height:i,radius:Math.floor(Math.max(s,0))}}function Ps(e,t){let n=window.innerWidth,i=window.innerHeight,s=Os(e,t),o=s.radius,r=s.x+o,a=s.y,u=s.width-o*2,f=s.height-o*2;return`M${n},0L0,0L0,${i}L${n},${i}L${n},0Z\n    M${r},${a} h${u} a${o},${o} 0 0 1 ${o},${o} v${f} a${o},${o} 0 0 1 -${o},${o} h-${u} a${o},${o} 0 0 1 -${o},-${o} v-${f} a${o},${o} 0 0 1 ${o},-${o} z`}function Ti(e,t,n){return t>e.x&&t<e.x+e.width&&n>e.y&&n<e.y+e.height}function Ba(e,t){let n=(u,f)=>t.some(d=>Ti(d,u,f)),i=(u,f)=>[...new Set([e,...t].flatMap(d=>[d[u],d[u]+d[f]]))].sort((d,p)=>d-p),s=i("x","width"),o=i("y","height"),r="";s.forEach((u,f)=>{o.forEach((d,p)=>{let m=s[f+1]-u,c=o[p+1]-d,g=u+m/2,_=d+c/2;n(g,_)&&!Ti(e,g,_)&&(r+=`M${u},${d}h${m}v${c}h-${m}z`)})});let a=e.radius;for(let u of[0,1])for(let f of[0,1]){let d=e.x+u*e.width,p=e.y+f*e.height,m=u?-a:a,c=f?-a:a;a&&n(d+m/2,p+c/2)&&(r+=`M${d},${p}h${m}a${a},${a} 0 0 ${u^f} ${-m},${c}z`)}return r}function ja(e,t,n,i,s){let o=e.state.__activeStagePosition,r=o||Pe(i),a=Pe(s);o={x:ze(t,r.x,a.x-r.x,n),y:ze(t,r.y,a.y-r.y,n),width:ze(t,r.width,a.width-r.width,n),height:ze(t,r.height,a.height-r.height,n)},In(e,o,s),e.state.__activeStagePosition=o}function Nn(e,t){if(!t)return;let n=Pe(t),i={x:n.x,y:n.y,width:n.width,height:n.height};e.state.__activeStagePosition=i,In(e,i,t)}function $i(e){let t=e.state.__activeStagePosition,n=e.state.__overlaySvg;!t||!n||n.setAttribute("viewBox",Is())}function za(e,t,n){let i=Ga(e,t);return Es(i,Ln(n),!0),ys(i,s=>{s.target.tagName==="path"&&e.tour.overlayClick()}),e.state.__overlaySvg=i,i}function Ua(e){e.style.animation="none"}function Wa(e,t){xs(e,t,!0)&&Ua(e)}function Ha(e,t){let n=e.closest("dialog");return n?Ba(t,Array.from(n.querySelectorAll(".driver-allowed-element")).map(i=>i.getBoundingClientRect())):""}function In(e,t,n){let i=e.state.__overlaySvg??za(e,t,n);Wa(i,n);let s=i.firstElementChild;if(s?.tagName!=="path")return;let o=Ds(e),r=Ps(t,o)+Ha(i,Os(t,o));s.getAttribute("d")!==r&&s.setAttribute("d",r)}function Li(e,t=!1){let n=e.state.__activeStagePosition,i=e.state.activeElement,s=e.state.__overlaySvg;n&&i&&s&&(t||s.closest("dialog"))&&In(e,n,i)}function Ds(e){let t=e.state.activeElement;return t&&(q(t)||lt(t))?{padding:0,radius:0}:{padding:e.config.stagePadding||0,radius:e.config.stageRadius||0}}function Ga(e,t){let n=Fa("driver-overlay driver-overlay-animated",Ps(t,Ds(e)),e.config.overlayColor||"rgb(0,0,0)",`${e.config.overlayOpacity}`);return n.setAttribute("version","1.1"),n.style.cssText+="clip-rule:evenodd;stroke-linejoin:round;stroke-miterlimit:2;z-index:10000;position:fixed;top:0;left:0;width:100%;height:100%",n.firstElementChild.style.cursor="auto",n}function qa(e){let t=e.state.__overlaySvg;t&&($n(t),ks(t))}function Rs(e,t){return P(e,t,"allowedElements")}function Fs(e){return e?typeof e=="function"?Array.from(e()||[]):(Array.isArray(e)?e:[e]).flatMap(t=>typeof t=="string"?Array.from(document.querySelectorAll(t)):t?[t]:[]):[]}function Va(e,t,n){let i=Rs(e,t);if(!i)return;let s=new Set,o,r=()=>{if(n.aborted)return;let d=new Set(Fs(i));s.forEach(c=>{!d.has(c)&&c.classList.contains("driver-allowed-element")&&c.classList.remove(me)}),d.forEach(c=>{c.classList.contains("driver-allowed-element")||c.classList.add(me)}),s=d;let p=e.state.activeElement,m=!!p&&!q(p)&&lt(p);p&&m!==p.classList.contains("driver-active-element-raised")&&(p.classList.toggle(at,m),Li(e,!0))},a=()=>{o===void 0&&(o=window.requestAnimationFrame(()=>{o=void 0,r(),Li(e)}))},u=new MutationObserver(d=>{let p=!1;d.forEach(m=>{let c=m.target;c.closest?.(".driver-layer, .driver-overlay, .driver-popover")||(p=!0,m.attributeName==="class"&&s.has(c)&&!c.classList.contains("driver-allowed-element")&&c.classList.add(me))}),p&&a()}),f=typeof i=="function"||[i].flat().some(d=>typeof d=="string");r(),u.observe(document.body,{childList:!0,subtree:!0,attributes:!0,...f?{}:{attributeFilter:["class"]}}),e.state.__syncAllowedElements=r,n.addEventListener("abort",()=>{u.disconnect(),o!==void 0&&window.cancelAnimationFrame(o),s.forEach(d=>d.classList.remove(me)),e.state.__syncAllowedElements===r&&(e.state.__syncAllowedElements=void 0)})}function Bs(e,t,n){let i=document.activeElement;if(!i||i===document.body)return!1;let s=P(e,n,"disableActiveInteraction")!==!0;return!q(t)&&s&&t.contains(i)?!0:Fs(Rs(e,n)).some(o=>o.contains(i))}function Ya(e){if(e.state.__liveRegion)return;let t=document.createElement("div");t.className="driver-live-region",t.setAttribute("aria-live","polite"),t.setAttribute("aria-atomic","true"),t.style.cssText="position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0",document.body.appendChild(t),e.state.__liveRegion=t}function On(e,t){let n=e.state.__liveRegion,i=t.trim();!n||!i||e.state.__lastAnnouncement===i||(e.state.__lastAnnouncement=i,n.textContent=i)}function Ka(e){e.state.__liveRegion?.remove()}function js(e,t){return!P(e,t,"skipMissingElement")||!t.element?!1:!be(t.element)}function ut(e,t,n){let i=e.config.steps||[];for(let s=t;s>=0&&s<i.length;s+=n)if(!js(e,i[s]))return s}function re(e,t){let n=e.state.activeIndex;return n!==void 0&&ut(e,n+t,t)===void 0}function Ja(e,t){let n=re(e,1),i=t?.popover?.onDoneClick||e.config.onDoneClick;return n&&i?i:t?.popover?.onNextClick||e.config.onNextClick}function zs(e,t){return t?.popover?.onPrevClick||e.config.onPrevClick}function Us(e,t){return t?.popover?.onCloseClick||e.config.onCloseClick}function Ws(e,t,n){let i=(e.config.steps||[]).length;return t.replace("{{current}}",`${n+1}`).replace("{{total}}",`${i}`)}const Qa=["next","previous","close"];function Za(e,t){return{index:t,hasNext:ut(e,t+1,1)!==void 0,hasPrevious:ut(e,t-1,-1)!==void 0}}function Pn(e,t={},n){let i=e.config,s=t.showButtons||i.showButtons,o=i.progressText||"{{current}} of {{total}}",r={showProgress:t.showProgress??i.showProgress??!1,prevBtnText:t.prevBtnText??(i.prevBtnText||"Previous"),closeBtnLabel:t.closeBtnLabel??(i.closeBtnLabel||"Close"),popoverClass:t.popoverClass||i.popoverClass||""};return n?{...r,showButtons:Qa.filter(a=>(a!=="close"||i.allowClose)&&(!s||s.includes(a))),disableButtons:[...i.disableButtons||[],...n.hasPrevious?[]:["previous"]],progressText:Ws(e,t.progressText||o,n.index),nextBtnText:n.hasNext?t.nextBtnText??(i.nextBtnText||"Next"):t.doneBtnText||i.doneBtnText||"Done"}:{...r,showButtons:s||[],disableButtons:t.disableButtons||i.disableButtons||[],progressText:t.progressText??o,nextBtnText:t.nextBtnText??(i.nextBtnText||"Next")}}function dt(e,t){let n=(e.config.steps||[])[t],i=n.popover||{},s=Za(e,t),o=Pn(e,i,s);return{...n,popover:{showButtons:o.showButtons,nextBtnText:s.hasNext?void 0:o.nextBtnText,disableButtons:o.disableButtons,showProgress:o.showProgress,onNextClick:i.onNextClick||e.config.onNextClick||e.tour.moveNext,onPrevClick:zs(e,n)||e.tour.movePrevious,onCloseClick:Us(e,n)||e.tour.close,...i,progressText:o.progressText}}}function Se(e){return!!e?.popover?.instruction&&!Mt(e)}const Hs=new WeakSet;function Mt(e){return!!e&&Hs.has(e)}function Xa(e){return Hs.add(e),e}function Gs(e,t,n){let i=e.config.stagePadding||0;return{side:n.popover?.side||"bottom",align:n.popover?.align||"start",offset:i+(e.config.popoverOffset||0),padding:i,centered:q(t),onPositioned:()=>{let s=n.popover?.onPopoverPositioned||e.config.onPopoverPositioned;s&&e.state.popover&&s(e.state.popover,B(e))}}}function el(e,t){let n=e.state.__activation;return n?.popoverPatch&&n.step===t?n.popoverPatch:void 0}function qs(e,t){let n=el(e,t),i={...t.popover,...n},s=Pn(e,i);return n?.popoverClass!==void 0&&(s.popoverClass=n.popoverClass),n?.progressText!==void 0&&(s.progressText=Ws(e,n.progressText,e.state.activeIndex??0)),{popover:i,options:s}}function Vs(e,t){let{showButtons:n,disableButtons:i}=t?qs(e,t).options:Pn(e);return{showButtons:n,disableButtons:i}}function Ys(e,t,n){let{popover:i,options:s}=qs(e,n),o=e.state.__activation,r=Se(n);return{...s,title:i.title,description:i.description,isGated:r,isDone:r&&ms(e,n),instruction:r||Mt(n)?i.instruction:void 0,feedback:o?.step===n?o.feedback:void 0,doneButton:re(e,1),smoothScroll:e.config.smoothScroll,scrollIntoView:P(e,n,"scrollIntoView"),onNextClick:e.tour.pressNext,onPrevClick:e.tour.previous,onCloseClick:()=>{e.state.__destroyReason="close";let a=Us(e,n);return a?a(e.state.activeElement??t,n,B(e)):e.tour.requestClose()},onRender:a=>{e.state.popover=a,(i.onPopoverRender||e.config.onPopoverRender)?.(a,B(e))},position:Gs(e,t,n)}}function Ks(e,t,n){let i=!q(t)&&P(e,n,"disableActiveInteraction")!==!0;if(!(P(e,n,"focus")!=="element"||!i))return bs([t])[0]}function tl(e,t,n){Bs(e,t,n)||Ks(e,t,n)?.focus({preventScroll:!0})}function rn(e,t,n){Cn(e.state.popover);let i=Bs(e,t,n)||P(e,n,"focus")==="none"||!!Ks(e,t,n),s=Pa(t,{...Ys(e,t,n),keepFocus:i});Js(e),i&&On(e,an(s).filter(Boolean).join(". "))}function an(e){return[e.title,e.description,e.instruction].map(t=>!t||t.style.display==="none"?"":t.textContent||"")}function Js(e){Re(e)&&Xs(e)}function Qs(e,t,n){let i=e.state.popover;i&&(Oa(i,t,Ys(e,t,n)),Js(e))}function Zs(e,t,n){let i=e.state.popover;i&&St(i,t,Gs(e,t,n))}function Xs(e){let t=e.state.popover;!t||t.wrapper.style.display==="none"||(t.wrapper.classList.add("driver-popover-waiting"),t.wrapper.setAttribute("aria-busy","true"),Te(t.nextButton,!0),Te(t.previousButton,!0))}function nl(e,t,n){let i=e.state.popover;!i||i.wrapper.style.display==="none"||(i.wrapper.classList.remove("driver-popover-waiting"),i.wrapper.removeAttribute("aria-busy"),t&&n&&Qs(e,t,n))}function Ci(e,t){if(!ua(e,t))return;let n=P(e,t.step,"advanceDelay")??0;if(n<=0){e.tour.next(),tn(e,t);return}da(t),e.tour.refreshPopover(),Se(t.step)&&e.ui.announce(e,t.step.popover?.doneBtnText||e.config.doneBtnText||"Done");let i=window.setTimeout(()=>{we(e,t)&&(e.tour.next(),tn(e,t))},n);t.controller.signal.addEventListener("abort",()=>window.clearTimeout(i))}function kt(e){let t=ot(e);return{element:t?.element??e.state.activeElement,step:t?.step??e.state.activeStep}}function ft(e,t){aa(e,t),e.ui.showWaiting(e)}function eo(e,t,n,i){let s=e.state.__activation,o=P(e,t,"onWaitingForElement");if(!o||!s?.wait)return;s.waitController?.abort();let r=new AbortController;s.waitController=r,o(i,t,{...B(e),index:n,signal:r.signal})}function ln(e){let t=kt(e);la(e)&&e.ui.hideWaiting(e,t.element,t.step)}function il(e,t,n,i){let s=e.state.__activation,o,r=()=>{f.disconnect(),window.clearTimeout(d),o!==void 0&&window.cancelAnimationFrame(o)},a=p=>{r(),en(e),i(p),s&&tn(e,s)},u=()=>{o=void 0,be(t.element)&&a(!0)},f=new MutationObserver(()=>{o??(o=window.requestAnimationFrame(u))}),d=As(n)?void 0:window.setTimeout(()=>a(!1),n);en(e,r),f.observe(document.documentElement,{childList:!0,subtree:!0,attributes:!0})}function sl(e,t){let n=dt(e,t),i=cn(e,n),s=!!e.state.activeStep;if(i==="stay"||typeof i=="string"&&!s){e.tour.drive(t,!0);return}let o=e.state.__activation;if(ln(e),typeof i=="string")return;let r=i(void 0,n,{...B(e),index:t,cause:"timeout"}),a=!e.state.isInitialized||!we(e,o)||xn(e);r===!1||a||e.tour.drive(t,!0)}function cn(e,t){return P(e,t,"onElementMissing")??"stay"}function ol(e,t){let n=e.state.activeIndex;if(!n)return;let i=e.config.steps||[];for(let s=n-1;t==="previousAction"&&s>=0;s--){let o=i[s];if(Se(o)&&o.element&&be(o.element)?.isConnected){e.tour.drive(s);return}}e.tour.drive(n-1)}function rl(e,t){let{step:n}=t,{signal:i}=t.controller;if(!n.element)return;let s,o,r=!1,a=c=>{window.clearTimeout(o),o=void 0,r=!1,e.ui.rebind(e,c),ps(e,t)||ln(e)},u=()=>{let c=be(n.element);if(!c||!c.isConnected)return!1;let g=e.state.activeElement;a(c);let _=P(e,n,"onElementReplaced");return _&&c!==g&&_(c,n,{...B(e),signal:i}),!0},f=c=>{r=!0,ln(e);let g=cn(e,n);if(typeof g=="function"){g(c,n,{...B(e),cause:"removed"});return}g!=="stay"&&ol(e,g)},d=()=>{s=void 0;let c=e.state.activeElement;if(i.aborted||!c||q(c))return;if(c.isConnected){(r||o!==void 0)&&a(c);return}if(gi(e,t)||u()||r||o||cn(e,n)==="stay")return;let g=P(e,n,"waitForRemovedElement")??P(e,n,"waitForElement")??0;if(g<=0){f(c);return}ft(e,"missing"),o=As(g)?-1:window.setTimeout(()=>{o=void 0,!(i.aborted||gi(e,t)||u())&&f(c)},g),eo(e,n,e.state.activeIndex,c)},p=()=>{s===void 0&&(s=window.requestAnimationFrame(d))},m=new MutationObserver(p);m.observe(document.documentElement,{childList:!0,subtree:!0}),t.recheck=p,i.addEventListener("abort",()=>{m.disconnect(),window.clearTimeout(o),s!==void 0&&window.cancelAnimationFrame(s)})}function al(e,t){if(!t)return!1;let n=e.composedPath();return n.length>0?n.includes(t):e.target instanceof Node&&t.contains(e.target)}function ll(e,t,n,i){let{signal:s}=n.controller,{types:o,when:r}=Tn(t),a=()=>fa(e,n.step)&&bt(e),u=_=>{let h=e.state.__advanceClick,y=_;return!h||y.detail<2||y.timeStamp-h.timeStamp>500?!1:Math.abs(y.clientX-h.clientX)<8&&Math.abs(y.clientY-h.clientY)<8},f=_=>a()||u(_),d=_=>{if(!r)return!0;let h=e.state.activeElement;return!!h&&r(h,n.step,{...B(e),event:_})},p,m,c=_=>{p===_&&(window.clearTimeout(m),p=void 0,m=void 0,mi(n,!1),!s.aborted&&(!e.consumed.has(_)&&d(_)&&(rt(_.type)&&(e.state.__advanceClick=_),i()),n.recheck?.()))},g=_=>{al(_,e.state.activeElement)&&(rt(_.type)&&f(_)||(p=_,mi(n,!0),window.clearTimeout(m),m=window.setTimeout(()=>c(_),0)))};for(let _ of o)window.addEventListener(_,g,{capture:!0,signal:s}),window.addEventListener(_,c,{signal:s});s.addEventListener("abort",()=>window.clearTimeout(m))}let fe;function cl(e,t){let n=ha(e,t,{drive:h,next:s,moveNext:o,movePrevious:r,close:()=>S("close"),destroy:S,refreshPopover:g}),i=()=>S("replaced",!1);function s(){let{element:v,step:k}=kt(n),A=Ja(n,k);if(!k||!A){Mt(k)||o();return}re(n,1)&&(n.state.__destroyReason="done"),A(v,k,B(n))}function o(){let v=n.state.activeIndex,k=n.config.steps||[];if(v===void 0)return;let A=v+1;k[A]?h(A):S("done")}function r(){let v=n.state.activeIndex,k=n.config.steps||[];if(v===void 0)return;let A=v-1;k[A]?h(A):S("api")}function a(v){if(!(n.config.steps||[])[v]){S("api");return}_(),h(v)}function u(){let v=n.state.__activation;!v||Re(n)||Ci(n,v)}let f=new WeakSet;function d(v,k){let{types:A}=Tn(k);if(!(t.blocksInteraction&&P(n,v,"disableActiveInteraction"))||!A.length||!A.every(rt))return;let C=n.state.activeIndex,I=C!==void 0&&n.config.steps?.[C]||v;if(f.has(I))return;f.add(I);let L=C===void 0?"The highlight":`Step ${C+1}`;console.warn(`[driver.js] ${L} can\'t complete: disableActiveInteraction blocks its advanceOn events.`)}function p(v){if(!we(n,v))return;let{step:k}=v;t.trackAllowed(n,k,v.controller.signal),rl(n,v);let A=gs(n,k);d(k,A),A&&ll(n,A,v,()=>Ci(n,v))}function m(v){let k=n.state.__activation;k&&(k.popoverPatch=v?{...k.popoverPatch,...v}:void 0,g())}function c(v){let k=n.state.__activation;!k||(k.feedback||"")===v||(k.feedback=v,g(),t.announce(n,n.state.popover?.feedback?.textContent||""))}function g(){t.refreshPopover(n)}function _(){n.state.isInitialized||(fe&&fe!==i&&fe(),fe=i,n.state.isInitialized=!0,t.mount(n))}function h(v=0,k=!1){Ct(n),n.state.__destroyReason=void 0;let A=n.config.steps;if(!A){console.error("No steps to drive through"),S("api");return}if(!A[v]){S("api");return}let C=A[v],I=P(n,C,"waitForElement")??0;if(!k&&I>0&&C.element&&!be(C.element)){ot(n)?.index===v?ft(n,"initial"):n.state.activeStep?ft(n,"next"):(t.endInitialWait(n),t.showInitialWait(n,v)),il(n,C,I,L=>{L?h(v,!0):sl(n,v)}),eo(n,dt(n,v),v);return}if(t.endInitialWait(n),js(n,C)){let L=n.state.activeIndex,M=typeof L=="number"&&v<L?-1:1;A[v+M]?h(v+M):M===1&&S("done");return}hs(n,v,!1),y(dt(n,v))}function y(v){let k=ds(n,v);t.highlight(n,v),p(k)}function w(){fe===i&&(fe=void 0),t.detach(n),Ct(n),fs(n),t.unmount(n);let v=n.state;return n.state={},v}function S(v,k=!0){if(!n.state.isInitialized)return;v==="api"&&(v=n.state.__destroyReason??"api");let A=!!n.state.__activeElement||!!n.state.__activeStep,C=A?n.state.__activeElement:n.state.activeElement,I=n.state.__activeStep??ot(n)?.step??n.state.activeStep??n.state.__activation?.step,L=q(C)?void 0:C,M=document.activeElement,x=!M||M===document.body||n.state.popover?.wrapper.contains(M)?n.state.__activeOnDestroyed:void 0,O=n.config.onDestroyStarted,V=ue(n)??n.state.activeStep??n.state.__activation?.step;if(k&&O&&V){n.state.__destroyReason=v,O(L,V,B(n,void 0,v));return}let H=I?.onDeselected||n.config.onDeselected,Y=n.config.onDestroyed,U=w();I&&(A&&H&&H(L,I,B(n,U,v)),Y?.(L,I,B(n,U,v))),x&&t.restoreFocus(x)}let b={isActive:()=>n.state.isInitialized||!1,refresh:()=>t.refresh(n),drive:(v=0)=>{_(),h(v)},setConfig:v=>nn(n,v),setSteps:v=>{n.state.isInitialized?w():n.state={},nn(n,{...n.config,steps:v})},getConfig:(v=>v?n.config[v]:n.config),getState:v=>v?n.state[v]:n.state,getActiveIndex:()=>n.state.activeIndex,isFirstStep:()=>re(n,-1),isLastStep:()=>re(n,1),getActiveStep:()=>n.state.activeStep,getActiveElement:()=>n.state.activeElement,getPreviousElement:()=>n.state.previousElement,getPreviousStep:()=>n.state.previousStep,getNextStep:()=>{let v=n.config.steps||[],k=n.state.activeIndex;if(k===void 0)return;let A=ut(n,k+1,1);return A===void 0?void 0:v[A]},moveNext:o,movePrevious:r,moveTo:a,hasNextStep:()=>n.state.activeIndex!==void 0&&!re(n,1),hasPreviousStep:()=>n.state.activeIndex!==void 0&&!re(n,-1),highlight:v=>{_(),Ct(n),t.endInitialWait(n),n.state.__destroyReason=void 0,y(Xa({...v,popover:v.popover?{showButtons:[],showProgress:!1,progressText:"",...v.popover}:void 0}))},updatePopover:m,advance:u,nudge:v=>{typeof v=="object"&&m(v),c(typeof v=="string"?v:""),t.nudge(n)},destroy:()=>{S("api",!1)}};return n.driver=b,b}function ul(e,t,n){let i=e.state.__activation,s=()=>!we(e,i),o=e.state.__activeStep,r=e.state.__activeElement||(o?void 0:t),a=n.onHighlightStarted||e.config.onHighlightStarted,u=n.onHighlighted||e.config.onHighlighted,f=o?.onDeselected||e.config.onDeselected,d=i?.controller.signal,p=B(e);if(!(o&&o!==n&&f&&(f(q(r)?void 0:r,o,p),s()))&&!(a&&(a(q(t)?void 0:t,n,{...p,signal:d}),s())))return e.state.previousStep=o,e.state.previousElement=r,e.state.activeStep=n,e.state.activeElement=t,m=>{e.state.__previousStep=o,e.state.__previousElement=r,e.state.__activeStep=n,e.state.__activeElement=m,u&&u(q(t)?void 0:m,n,{...B(e),signal:d})}}function dl(e,t,n){return(e.state.activeStep===t?e.state.activeElement:void 0)||n}const un={"aria-haspopup":"dialog","aria-expanded":"true","aria-controls":"driver-popover-content"},ht=new WeakSet;function fl(e){if(!(Object.keys(un).some(t=>e.hasAttribute(t))&&!ht.has(e))){for(let[t,n]of Object.entries(un))e.setAttribute(t,n);ht.add(e)}}function hl(e){if(ht.has(e)){for(let[t,n]of Object.entries(un))e.getAttribute(t)===n&&e.removeAttribute(t);ht.delete(e)}}function to(){let e=document.getElementById(on);if(e)return e;let t=document.createElement("div");return t.id=on,t.style.cssText="width:0;height:0;pointer-events:none;opacity:0;position:fixed;top:50%;left:50%",document.body.appendChild(t),t}function pl(e,t){let n=be(t.element);n||(n=to()),ml(e,n,t)}function dn(e,t){let n=e.state.__resizeObserver;n?.disconnect(),t&&n?.observe(t)}function no(e){let t=e.state.__activeElement,n=e.state.__activeStep;if(!(!t||!n)){if(bt(e)){ra(e),$i(e);return}e.state.__syncAllowedElements?.(),io(e,t),Nn(e,t),$i(e),Zs(e,t,n)}}function io(e,t){let n=e.state.popover?.wrapper;n&&xs(n,t)}function ml(e,t,n){dn(e);let i=e.config.duration||400,s=Date.now(),o=e.config.animate,r=ul(e,t,n);if(!r)return;let a=e.state.previousElement||t,u=a!==t&&o,f=!1;Ta(e.state.popover);let d=()=>{if(!pi(e,d))return;let m=Date.now()-s,c=i-m<=i/2,g=dl(e,n,t);if(n.popover&&c&&!f&&u&&(rn(e,g,n),f=!0),e.config.animate&&m<i)ja(e,m,i,a,g);else{if(Nn(e,g),r(g),!pi(e,d))return;tl(e,g,n);let _=oa(e);dn(e,g),_&&no(e);return}window.requestAnimationFrame(d)};sa(e,d),window.requestAnimationFrame(d),Rn(e);let p=P(e,n,"scrollIntoView");p!==!1&&Ss(t,e.config.smoothScroll,typeof p=="object"?p:void 0),!u&&n.popover&&rn(e,t,n),Dn(e),so(e,t,n)}const pt=new WeakMap;function gl(e,t){pt.get(e)?.disconnect();let n=new MutationObserver(()=>{let i=t().filter(s=>!e.classList.contains(s));i.length>0&&e.classList.add(...i)});n.observe(e,{attributes:!0,attributeFilter:["class"]}),pt.set(e,n)}function vl(e){pt.get(e)?.disconnect(),pt.delete(e),e.classList.remove("driver-active-element","driver-no-interaction",at),hl(e)}function Dn(e){let t=e.state.__marked?.element;new Set([t,...document.querySelectorAll(".driver-active-element")]).forEach(n=>{n&&vl(n)})}function Rn(e){let t=e.state.__marked?.parent;new Set([t,...document.querySelectorAll(".driver-active-element-parent")]).forEach(n=>{n?.classList.remove("driver-active-element-parent","driver-active-element-parent-no-scroll")})}function so(e,t,n){document.body.classList.toggle(ws,!!P(e,n,"allowPageInteraction"));let i=P(e,n,"disableActiveInteraction")===!0;i&&t.classList.add("driver-no-interaction");let s=t.parentElement,o=s&&s!==document.body?s:void 0;o&&(o.classList.add("driver-active-element-parent"),pa(o)&&o.classList.add("driver-active-element-parent-no-scroll")),e.state.__marked={element:t,parent:o},t.classList.add("driver-active-element"),q(t)||(fl(t),t.classList.toggle(at,lt(t)),gl(t,()=>["driver-active-element",...i?["driver-no-interaction"]:[],...lt(t)?[at]:[]]))}function oo(){document.getElementById(on)?.remove()}function _l(e){oo(),Rn(e),Dn(e)}function yl(e,t){let n=e.state.activeStep;n&&(Rn(e),Dn(e),so(e,t,n),e.state.activeElement=t,e.state.__activeElement=t,dn(e,t),io(e,t),Nn(e,t),Zs(e,t,n))}function ro(e,t){let n=e.state.activeElement;return!q(n)&&!!n&&t.includes(n)}function Fn(e,t){let n=e.state.popover?.wrapper;return n&&t.includes(n)?"popover":ro(e,t)?"element":e.ui.isAllowed(e,t)?"allowed":"outside"}function wl(e){let t=[];for(let n=e;n;)t.push(n),n=n.parentNode||(n instanceof ShadowRoot?n.host:null);return t}const bl=new Set(["pointerdown","mousedown","pointerup","mouseup"]),ao=["click","auxclick","contextmenu","dblclick"];function Sl(e){if(e instanceof MouseEvent)return bl.has(e.type)?`press${e.button}`:ao.includes(e.type)?e.type:void 0}function Ml(e,t){let{types:n,strict:i}=Tn(gs(e,t));if(!(!i||!n.length))return n.every(rt)?n:void 0}function It(e,t){let n=e.state.activeStep,i=Sl(t);if(!n||!i||!ro(e,t.composedPath()))return;if(e.ui.blocksInteraction&&P(e,n,"disableActiveInteraction"))return"disabled";let s=Ml(e,n);if(!(!s||s.some(o=>vs[o].includes(i))))return"strict"}function Ot(e){return e.isTrusted}const kl=["pointerdown","mousedown","touchstart"],El=["pointerup","mouseup","touchend"],xl=new Set(["touchstart","touchend"]),Al=new Set(["pointerdown","mousedown","pointerup","mouseup","click"]);function lo(e,t){t.preventDefault(),t.stopImmediatePropagation(),e.consumed.add(t)}function Pt(e,t){if(!e.ui.blocksInteraction||An(e))return;let n=t.composedPath();if(Fn(e,n)!=="outside")return;let i=n[0];if(i===document.body||i===document.documentElement)return"root";let s=e.state.__overlaySvg;if(s&&n.includes(s))return"overlay"}function Dt(e){Al.has(e.type)&&e.preventDefault(),e.stopImmediatePropagation()}function Tl(e,t){if(!e.state.isInitialized)return;let n=e.state.activeStep,i=P(e,n,"onInteraction");if(!n||!i||t.type==="auxclick"&&t.button===2)return;let s=Fn(e,t.composedPath());if(s==="popover")return;let o=e.state.activeElement;i(q(o)?void 0:o,n,{...B(e),event:t,region:s})===!1&&lo(e,t)}function $l(e){let t=new AbortController,n=!1,i=a=>{!e.state.isInitialized||!Ot(a)||(n=!!Pt(e,a),(n||It(e,a))&&Dt(a))},s=a=>{!e.state.isInitialized||!Ot(a)||(n&&Pt(e,a)||It(e,a))&&Dt(a)},o=a=>{if(Tl(e,a),!e.state.isInitialized||e.consumed.has(a)||!Ot(a))return;let u=a.type==="dblclick"||a.type==="auxclick"&&a.button===2;if(n&&Pt(e,a)==="root"){Dt(a),Se(e.state.activeStep)&&!u&&e.ui.nudge(e);return}let f=It(e,a);f&&(lo(e,a),f==="strict"&&!u&&e.ui.nudge(e))},r=(a,u)=>{window.addEventListener(a,u,{capture:!0,passive:xl.has(a)||void 0,signal:t.signal})};return kl.forEach(a=>r(a,i)),El.forEach(a=>r(a,s)),ao.forEach(a=>r(a,o)),()=>t.abort()}function Ll(e,t){let n=Fn(e,t);return n==="element"||n==="allowed"||n==="outside"&&An(e)}function co(e,t){return ka(t[0])&&Ll(e,t)}function uo(e){return co(e,wl(document.activeElement))}function ne(e){return e.code||e.key}function Bn(e){let t=e.state.__handledKeys;return t||(t=new Set,e.state.__handledKeys=t),t}function fo(e,t){let n=e.state.__pressedKeys,i=ne(t);return n?.has(i)?n.get(i)!==e.state.__activation:t.repeat}function Cl(e){let t=new AbortController,n=new Map;e.state.__pressedKeys=n;let i=s=>{let o=s;o.type==="keydown"&&!o.repeat&&n.set(ne(o),e.state.__activation);let r=e.state.popover?.wrapper;r&&o.composedPath().includes(r)&&fo(e,o)&&o.preventDefault()};return["keydown","keypress","keyup"].forEach(s=>window.addEventListener(s,i,{capture:!0,signal:t.signal})),window.addEventListener("blur",()=>{e.state.__widgetKey=void 0,n.clear()},{signal:t.signal}),()=>t.abort()}function $e(e){let t=e.state.__resizeTimeout;t&&window.cancelAnimationFrame(t),e.state.__resizeTimeout=window.requestAnimationFrame(()=>no(e))}function Nl(e){let t=e.state.__activeElement?.getBoundingClientRect();!t||t.width===0&&t.height===0||$e(e)}function Il(e,t){if(!e.state.isInitialized||!(t.key==="Tab"||t.keyCode===9)||An(e))return;let n=e.state.__activeElement,i=e.state.popover?.wrapper,s=[...new Set(bs([...i?[i]:[],...n?[n]:[],...Array.from(document.querySelectorAll(`.${me}`))]))],o=s[0],r=s[s.length-1];t.preventDefault(),t.shiftKey?(s[s.indexOf(document.activeElement)-1]||r)?.focus():(s[s.indexOf(document.activeElement)+1]||o)?.focus()}function Ol(e,t){Bn(e).add(ne(t)),(co(e,t.composedPath())||uo(e))&&(e.state.__widgetKey=ne(t))}function Pl(e,t){let n=ne(t);!t.defaultPrevented&&e.state.__widgetKey!==n&&Bn(e).delete(n)}function Dl(e,t){let n=e.config.allowKeyboardControl??!0,i=Bn(e).delete(ne(t)),s=fo(e,t);e.state.__pressedKeys?.delete(ne(t)),e.state.__widgetKey===ne(t)&&(e.state.__widgetKey=void 0),!(!n||i||s||uo(e))&&(t.key==="Escape"?e.tour.escape():t.key==="ArrowRight"?e.tour.arrowRight():t.key==="ArrowLeft"&&e.tour.arrowLeft())}function Rl(e){if(e.state.__events)return;let t=f=>Dl(e,f),n=f=>{Pl(e,f),Il(e,f)},i=f=>Ol(e,f),s=()=>$e(e),o=f=>{f.target instanceof Node&&e.state.popover?.wrapper.contains(f.target)||$e(e)};e.state.__events={onKeyup:t,onKeydown:n,onKeydownCapture:i,onResize:s,onScroll:o},typeof ResizeObserver<"u"&&(e.state.__resizeObserver=new ResizeObserver(()=>Nl(e)));let r=new MutationObserver(()=>$e(e));r.observe(document.documentElement,{attributes:!0,attributeFilter:["open"],subtree:!0}),e.state.__openObserver=r;let a=$l(e),u=Cl(e);e.state.__teardownGate=()=>{a(),u()},window.addEventListener("keydown",i,!0),window.addEventListener("keyup",t,!1),window.addEventListener("keydown",n,!1),window.addEventListener("resize",s),window.addEventListener("scroll",o,!0),document.addEventListener("close",s,!0)}function Fl(e){let t=e.state.__events;t&&(window.removeEventListener("keyup",t.onKeyup),window.removeEventListener("keydown",t.onKeydown),window.removeEventListener("keydown",t.onKeydownCapture,!0),e.state.__teardownGate?.(),e.state.__resizeObserver?.disconnect(),e.state.__openObserver?.disconnect(),window.removeEventListener("resize",t.onResize),document.removeEventListener("close",t.onResize,!0),window.removeEventListener("scroll",t.onScroll,!0))}function ho(e){let t=e.state.__activation?.step??ue(e);return!Re(e)&&!Se(t)}function jn(e){let t=e.state.__activation;return Se(t?.step??ue(e))?(!(t&&ms(e,t.step))&&!Re(e)&&e.ui.nudge(e),!0):!1}function po(e,t){if(t==="previous"&&Re(e)||t==="next"&&!ho(e))return!1;let n=Vs(e,ue(e));return n.showButtons.includes(t)&&!n.disableButtons.includes(t)}function mo(e,t="close"){e.config.allowClose&&e.tour.destroy(t)}function Bl(e){Vs(e,ue(e)).disableButtons.includes("close")||mo(e,"escape")}function jl(e){jn(e)||e.tour.next()}function go(e){let{element:t,step:n}=kt(e),i=zs(e,n);if(!n||!i){Mt(n)||e.tour.movePrevious();return}i(t,n,B(e))}function zl(e){let t=e.config.overlayClickBehavior;if(!(typeof t!="function"&&t!=="none"&&jn(e))){if(e.config.allowClose&&t==="close"){e.tour.destroy("overlay");return}if(typeof t=="function"){e.state.__destroyReason="overlay";let n=ue(e)??e.state.activeStep;n&&t(e.state.__activeElement,n,B(e));return}t==="nextStep"&&ho(e)&&e.tour.next()}}function Ul(e){let t=e.state.activeIndex;bt(e)||t===void 0||!e.state.__activeStep||!(e.config.steps||[])[t-1]||!po(e,"previous")||go(e)}function Wl(e){let t=e.state.activeIndex!==void 0&&!!ue(e);bt(e)||!t||jn(e)||!po(e,"next")||e.tour.next()}function Hl(e){return{pressNext:()=>jl(e),previous:()=>go(e),requestClose:()=>mo(e),overlayClick:()=>zl(e),escape:()=>Bl(e),arrowLeft:()=>Ul(e),arrowRight:()=>Wl(e)}}const fn="driver-popover-nudge",He=new WeakMap;function Gl(){let e=getComputedStyle(document.documentElement).getPropertyValue("--driver-nudge-duration").trim(),t=parseFloat(e);return Number.isNaN(t)?500:e.endsWith("ms")||!e.endsWith("s")?t:t*1e3}function ql(e,t){window.clearTimeout(He.get(e));let n=()=>{window.clearTimeout(He.get(e)),He.delete(e),e.removeEventListener("animationend",i),t()},i=s=>{let o=s.animationName;o&&!o.startsWith("driver-nudge")||n()};e.addEventListener("animationend",i),He.set(e,window.setTimeout(n,Gl()+150))}function Vl(e){e.classList.remove(fn),e.offsetWidth,e.classList.add(fn)}function Yl(e){let t=e.state.popover?.wrapper;!e.state.isInitialized||!t||!t.isConnected||t.style.display==="none"||(Vl(t),ql(t,()=>t.classList.remove(fn)))}function Kl(e){document.body.classList.add("driver-active",e.config.animate?"driver-fade":"driver-simple"),e.config.allowScroll||document.body.classList.add("driver-no-scroll"),document.body.style.setProperty("--driver-animation-duration",`${e.config.duration||400}ms`),Rl(e),Ya(e)}function Jl(){document.body.classList.remove("driver-active","driver-fade","driver-simple","driver-no-scroll",ws),document.body.style.removeProperty("--driver-animation-duration")}function Ql(e){Fl(e),Ka(e),Cn(e.state.popover),_l(e),qa(e)}function Zl(e,t){let n=dt(e,t);if(!n.popover)return;let i=to();hs(e,t,!0),ds(e,n,{element:i,index:t}),rn(e,i,n),ft(e,"initial")}function Xl(e){ca(e)&&(Cn(e.state.popover),e.state.popover=void 0,oo())}function ec(e){let t=e.state.__activation;if(!t)return;let n=e.state.popover,{element:i,step:s}=kt(e);if(!n||!i||s!==t.step||n.wrapper.style.display==="none"||!n.wrapper.isConnected)return;let o=an(n);Qs(e,i,t.step),On(e,an(n).filter((r,a)=>r&&r!==o[a]).join(". "))}const tc={blocksInteraction:!0,controls:Hl,mount:Kl,detach:Jl,unmount:Ql,highlight:pl,rebind:yl,refresh:$e,trackAllowed:Va,isAllowed:(e,t)=>t.some(n=>n instanceof Element&&n.classList.contains("driver-allowed-element")),showWaiting:Xs,hideWaiting:nl,showInitialWait:Zl,endInitialWait:Xl,refreshPopover:ec,nudge:Yl,announce:On,restoreFocus:e=>e.focus()};function nc(e={}){return cl(e,tc)}const Rt=e=>()=>[...document.querySelectorAll(`[data-tour="nav-${e}"]`)].find(n=>n.getClientRects().length>0)??document.querySelector("main")??document.body,ic=()=>document.querySelector(\'[data-tour="filters"]\')??document.querySelector("main")??document.body;function sc(e){return[{view:"foryou",title:`Welcome to ${e}`,description:"A quick look around: three pages, under a minute. Press Skip any time to leave the tour."},{view:"foryou",target:Rt("foryou"),title:"For you",description:"Your picks, ranked from what you\'ve watched and how you scored it on AniList. Open a card for details, or mark it Not interested."},{view:"foryou",target:ic,title:"Filters",description:"Narrow your picks by genre, format, year and more. Switch between anime and manga at the top of the page."},{view:"stats",target:Rt("stats"),title:"Stats",description:"What the recommendations learned from your lists: what you tend to enjoy and avoid."},{view:"settings",target:Rt("settings"),title:"Settings",description:"Title language, ratings, picks per page, and the titles and tags you\'ve excluded."},{view:"settings",title:"You\'re all set",description:"You can replay this tour any time from Settings."}]}const Ni=()=>new Promise(e=>requestAnimationFrame(()=>setTimeout(e)));function oc(e){const t=sc(e.appName),n=async s=>{if(!(s<0)){if(s>=t.length){i.destroy();return}e.setView(t[s].view),await Ni(),i.moveTo(s)}},i=nc({steps:t.map(s=>({...s.target?{element:s.target}:{},popover:{title:s.title,description:s.description}})),popoverClass:"tour-popover",showProgress:!0,progressText:"{{current}} of {{total}}",showButtons:["next","previous"],overlayClickBehavior:"none",nextBtnText:"Next",prevBtnText:"Back",doneBtnText:"Done",stageRadius:10,onNextClick:(s,o,{index:r})=>{n((r??0)+1)},onPrevClick:(s,o,{index:r})=>{n((r??0)-1)},onPopoverRender:(s,{index:o})=>{if(o===t.length-1)return;const r=document.createElement("button");r.type="button",r.className="tour-skip",r.textContent="Skip",r.addEventListener("click",()=>i.destroy()),s.footer.insertBefore(r,s.footer.firstChild)},onDestroyed:()=>e.onEnd()});e.setView("foryou"),Ni().then(()=>i.drive())}const Ii="Konomi.moe",rc=2,ac=e=>`hsl(${Math.max(0,Math.min(120,(e-45)*2.6))}, 70%, 55%)`,hn=e=>e>=1e6?`${(e/1e6).toFixed(1)}M`:e>=1e4?`${Math.round(e/1e3)}k`:e.toLocaleString(),pn=e=>e==="ANIME"?"anime":"manga",lc={TV:"TV",TV_SHORT:"TV short",MOVIE:"Movie",OVA:"OVA",ONA:"ONA",SPECIAL:"Special",MUSIC:"Music",MANGA:"Manga",NOVEL:"Light novel",ONE_SHOT:"One shot"},De=e=>e?lc[e]??e:"\u2014",zn=[["JP","Japan"],["KR","South Korea"],["CN","China"],["TW","Taiwan"]],Et=e=>zn.find(([t])=>t===e)?.[1]??e,cc={FINISHED:"Finished",RELEASING:"Releasing",NOT_YET_RELEASED:"Not yet released",CANCELLED:"Cancelled",HIATUS:"On hiatus"},mt=e=>cc[e]??e;function xt(e){const t=e.indexOf(":");return t<0?["",e]:[e.slice(0,t),e.slice(t+1)]}const vo={genre:"Genre",tag:"Tag",studio:"Studio",country:"Country",format:"Format"};function X(e){const[t,n]=xt(e);return t==="country"?Et(n):t==="format"?De(n):n}const At=e=>`${vo[xt(e)[0]]??"Label"}: ${X(e)}`;function mn(e){if(e===null)return"never";const t=Math.round((Date.now()-e)/6e4);if(t<1)return"just now";if(t<60)return`${t} min ago`;const n=Math.round(t/60);return n<24?`${n} h ago`:`${Math.round(n/24)} d ago`}const Z=e=>e instanceof Error?e.message:String(e),K=(e,t)=>e.includes(t)?e.filter(n=>n!==t):[...e,t];function ge({d:e,cls:t="icon"}){return l("svg",{class:t,"aria-hidden":"true",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":"2",children:l("path",{d:e})})}const ve={foryou:"M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4z",stats:"M4 20V10M10 20V4M16 20v-7M22 20H2",settings:"M12 15a3 3 0 100-6 3 3 0 000 6zM12 2v3M12 19v3M2 12h3M19 12h3",filters:"M3 5h18M6 12h12M10 19h4",caret:"M6 9l6 6 6-6",next:"M9 6l6 6-6 6",sliders:"M4 7h9M17 7h3M15 5v4M4 17h3M11 17h9M9 15v4"};function _o(e){return l("fieldset",{class:"seg","aria-label":e.label,children:e.options.map(([t,n])=>l("button",{type:"button",class:t===e.value?"on":"","aria-pressed":t===e.value,onClick:()=>e.onChange(t),children:n},t))})}function Oi(e){return l("label",{class:"switch",children:[l("input",{type:"checkbox","aria-label":e.label,checked:e.checked,onChange:t=>e.onChange(t.target.checked)}),l("span",{})]})}function Un({busy:e,note:t}){const n=e.total!==void 0&&e.total>0,i=Math.min(e.done??0,e.total??0),s=n?Math.max(0,(e.total??0)-i)*rc:0;return l("div",{class:"overlay",role:"status","aria-live":"polite",children:l("div",{class:"overlay-card",children:[l("span",{class:"spinner big"}),l("h2",{children:[e.step,"\u2026"]}),l("div",{class:`progress ${n?"":"indeterminate"}`,children:l("i",{style:n?{width:`${i/(e.total??1)*100}%`}:void 0})}),n&&s>=5&&l("p",{class:"muted",children:["About ",s<60?`${s} s`:`${Math.ceil(s/60)} min`," left"]}),t&&l("p",{class:"overlay-note",children:t})]})})}function uc({host:e}){const[t,n]=T(null),[i,s]=T(!1),[o,r]=T(null),[a,u]=T(null),f=te(async d=>{try{await e.setUser?.(d),await e.waitForSetup?.((p,m,c)=>u({step:p,done:m,total:c})).catch(()=>{}),u(null),n(await En.open(e,d)),s(!1)}catch(p){r(Z(p))}},[e]);return z(()=>{e.user().then(d=>d?f(d.name):s(!0),d=>r(Z(d)))},[e,f]),o?l("div",{class:"empty",children:[l("h2",{children:"Something went wrong"}),l("p",{children:o})]}):i?l(dc,{onUser:f}):a?l(Un,{busy:a,note:yo}):t?l(fc,{session:t}):l("div",{class:"empty",children:l("span",{class:"spinner"})})}function dc({onUser:e}){const[t,n]=T("");return l("div",{class:"welcome",children:l("form",{onSubmit:i=>{i.preventDefault(),t.trim()&&e(t.trim())},children:[l("div",{class:"logo",style:"width:44px;height:44px;border-radius:12px"}),l("h1",{children:"Find your next favourite"}),l("p",{class:"muted",children:"Recommendations learned from your own anime and manga list: what you scored, finished and dropped. Everything stays on this device."}),l("label",{class:"label",for:"username",children:"AniList username"}),l("input",{id:"username",class:"field",value:t,placeholder:"Your public AniList username",onInput:i=>n(i.target.value)}),l("button",{class:"btn primary",type:"submit",style:"justify-content:center;height:42px",children:"See my picks"})]})})}function fc({session:e}){const t=e.host.kind==="seanime",[n,i]=T("foryou"),[s,o]=T("ANIME"),[r,a]=T(null),[u,f]=T(null),[d,p]=T(null),m=Ie(null),c=te(v=>{p(v),m.current&&clearTimeout(m.current),m.current=setTimeout(()=>p(null),2600)},[]);z(()=>{e.settings().then(a),e.lastSynced().then(f)},[e]);const g=te(async v=>{a(v),await e.setSettings(v)},[e]),_=te(()=>{const v=n;oc({appName:Ii,setView:i,onEnd:async()=>{i(v),await g({...await e.settings(),tourSeen:!0})}})},[e,g,n]),[h,y]=T(!1),w=te(()=>y(!0),[]),S=Ie(!1);if(z(()=>{!r||r.tourSeen||!h||S.current||(S.current=!0,_())},[r,h,_]),!r)return null;const b=[["foryou","For you"],["stats","Stats"],["settings","Settings"]];return l("div",{class:`shell ${t?"host-seanime":""}`,children:[l("aside",{class:"side",children:[l("div",{class:"brand",children:[l("div",{class:"logo"}),Ii]}),b.map(([v,k])=>l("button",{type:"button",class:`nav ${n===v?"on":""}`,"data-tour":`nav-${v}`,"aria-current":n===v?"page":void 0,onClick:()=>i(v),children:[l(ge,{d:ve[v]}),k]},v)),l("div",{class:"side-foot",children:[l("div",{class:"sync",children:[l("span",{class:"dot"}),"Synced ",mn(u)]}),l("div",{class:"me",children:[l("div",{class:"avatar",children:e.user.slice(0,1).toUpperCase()}),l("div",{children:[e.user,l("small",{children:"AniList"})]})]})]})]}),l("main",{children:[l("div",{class:"page-tabs",role:"tablist",children:[b.map(([v,k])=>l("button",{type:"button",role:"tab","aria-selected":n===v,class:`page-tab ${n===v?"on":""}`,"data-tour":`nav-${v}`,onClick:()=>i(v),children:k},v)),l("span",{class:"note",children:["Signed in through Seanime \xB7 synced ",mn(u)]})]}),n==="foryou"&&l(hc,{session:e,kind:s,setKind:o,settings:r,saveSettings:g,setSynced:f,toast:c,onLoaded:w}),n==="stats"&&l(xc,{session:e,kind:s,setKind:o}),n==="settings"&&l(Ac,{session:e,settings:r,saveSettings:g,toast:c,startTour:_})]}),l("div",{class:`toast ${d?"show":""}`,role:"status",children:d})]})}const yo="Setting up your recommendations. The first sync reads your whole anime and manga list and fetches details from AniList, which can take up to a minute.";function hc(e){const{session:t,kind:n,settings:i,toast:s,onLoaded:o}=e,r=i.titleLanguage,[a,u]=T(null),[f,d]=T(null),[p,m]=T(!1),[c,g]=T(!1),[_,h]=T(null),[y,w]=T(new Map),[S,b]=T(null),[v,k]=T(1),[A,C]=T(pe),I=Ie(!1),L=te((E,$,F)=>d({step:E,done:$,total:F}),[]),M=te(async(E,$=pe)=>{if(!I.current){I.current=!0,h(null);try{E&&(m(await t.lastSynced()===null),await t.sync(L),e.setSynced(await t.lastSynced())),L("Finding your picks");const F=await t.recommend(n,L,$);u(F),C($),$===pe&&k(1),!F&&E&&h(`No titles came back from your ${pn(n)} list, so there\'s nothing to learn from yet.`)}catch(F){h(Z(F))}finally{I.current=!1,d(null),m(!1),o()}}},[t,n,L,e.setSynced,o]);z(()=>{let E=!0;return(async()=>{const $=await t.picks(n);E&&(u($),k(1),C(Math.max(pe,$?.recommendations.length??0)),$?o():await M(await t.lastSynced()===null))})(),()=>{E=!1}},[t,n,M,o]);const x=Oe(()=>(a?.recommendations??[]).slice(0,v*i.limit),[a,v,i.limit]);z(()=>{Promise.all(x.map(async E=>[E.media.id,(await t.themesOf(E.media)).filter($=>$.main).map($=>$.genre)])).then(E=>w(new Map(E)))},[t,x]);const O=async E=>{const $=E[n];if(u($),$&&$.recommendations.length<v*i.limit&&!I.current){g(!0),I.current=!0;try{u(await t.recommend(n,()=>{},A))}catch(F){h(Z(F))}finally{I.current=!1,g(!1)}}},V=a?.recommendations.length??0,H=V>x.length||V>=A,Y=async()=>{V>x.length||await M(!1,A+pe),k(v+1)},U=i.filters[n];return l("section",{class:"view on",children:[l("div",{class:"head",children:[l("div",{children:[l("h1",{children:"For you"}),l("div",{class:"sub",children:a?`${n==="ANIME"?"Anime":"Manga"} picks from your AniList \xB7 updated ${mn(a.at)}`:"Picks from your AniList"})]}),l("div",{class:"tools",children:l(_o,{label:"Anime or manga",value:n,options:[["ANIME","Anime"],["MANGA","Manga"]],onChange:e.setKind})})]}),l(gc,{session:t,advancedOpen:i.advancedOpen,setAdvancedOpen:E=>e.saveSettings({...i,advancedOpen:E}),kind:n,filters:U,busy:f!==null,version:a?.at??0,onApply:async E=>{const $=yt(E),F={...E,exclude:E.exclude.filter(Fe=>!$.has(Fe))};await e.saveSettings({...i,filters:{...i.filters,[n]:F}}),await M(!0)},onUnexclude:async E=>{const $={...U,exclude:U.exclude.filter(F=>F!==E)};await e.saveSettings({...i,filters:{...i.filters,[n]:$}}),await M(!1),s(`${X(E)} is back in this search`)}}),f&&l(Un,{busy:f,note:p?yo:null}),c&&l("div",{class:"status",children:[l("span",{class:"spinner"}),"Finding more picks\u2026"]}),_&&l("div",{class:"warn error",children:_}),a?.warnings.map(E=>l("div",{class:"warn",children:E},E)),!f&&a===null&&!_&&l("div",{class:"empty",children:[l("h2",{children:"No picks yet"}),l("p",{children:"Press Apply above to read your lists and find picks."})]}),a&&x.length===0&&!f&&!c&&l("div",{class:"empty",children:[l("h2",{children:"Nothing matches"}),l("p",{children:"Try fewer filters or fewer exclusions."})]}),l("div",{class:"grid",children:x.map((E,$)=>l(pc,{rec:E,rank:$+1,title:ke(E.media,r),mains:y.get(E.media.id)??[],showRatings:i.showRatings,onOpen:()=>b(E),onNope:async()=>{const F=ke(E.media,r);await O(await t.notInterested(E.media)),s(`Not interested in ${F}. Future picks will lean away from it.`)}},E.media.id))}),x.length>0&&H&&l("div",{class:"more",children:l("button",{type:"button",class:"btn",disabled:f!==null,onClick:Y,children:"Show more"})}),S&&l(bc,{session:t,rec:S,title:ke(S.media,r),showRatings:i.showRatings,onClose:()=>b(null),filters:U,onExcludeLabels:async E=>{b(null);const $=await t.excludeLabels(n,E);await e.saveSettings($.settings),await O($.left),$.excluded.length&&s(`Excluded ${$.excluded.map(X).join(", ")} from this search`)},onPlanned:async E=>{u((await t.dropPicks($=>$.id===E.id))[n]),s(`Added ${ke(E,r)} to your planning list`)},toast:s})]})}function pc(e){const{media:t,reasons:n}=e.rec;return l("div",{class:"card",role:"button",tabIndex:0,"aria-label":`#${e.rank} ${e.title}`,onClick:e.onOpen,onKeyDown:i=>(i.key==="Enter"||i.key===" ")&&e.onOpen(),children:[l("div",{class:"cv",children:[t.coverUrl?l("img",{src:t.coverUrl,alt:"",loading:"lazy"}):l("span",{class:"ph",children:"No cover"}),l("span",{class:`rank ${e.rank<=3?"top3":""}`,children:["#",e.rank]}),l("span",{class:"format",children:De(t.format)}),l("button",{type:"button",class:"nope",title:"Not interested: hides it and its sequels, and teaches your picks to lean away","aria-label":`Not interested in ${e.title}`,onClick:i=>{i.stopPropagation(),e.onNope()},children:"\u2715"}),e.showRatings&&t.averageScore!==null&&l("span",{class:"score",children:[l("i",{style:{background:ac(t.averageScore)}}),t.averageScore,"%"]}),e.showRatings&&t.popularity!==null&&l("span",{class:"users",children:hn(t.popularity)})]}),l("h3",{children:e.title}),l("div",{class:"meta",children:[t.year??"\u2014",t.status?` \xB7 ${mt(t.status)}`:"",t.country&&t.country!=="JP"?` \xB7 ${Et(t.country)}`:""]}),e.mains.length>0&&l("div",{class:"main",children:["Mainly ",e.mains.join(" & ")]}),l("div",{class:"tags",children:n.slice(0,2).map(i=>l("span",{class:"pill",children:i.value},i.value))})]})}const mc=[["Last 5 years",e=>[e-4,null]],["2010s",()=>[2010,2019]],["2000s",()=>[2e3,2009]],["Before 2000",()=>[null,1999]]];function Pi(e){return e.tags.length+e.countries.length+(e.minTagRank&&e.tags.length?1:0)+(e.minScore?1:0)+(e.hideListed?0:1)+(e.hideSeenAdaptations?1:0)}function gc(e){const[t,n]=T(e.filters);z(()=>n(e.filters),[e.filters]);const[i,s]=T(new Set);z(()=>{e.session.exclusions().then(h=>s(new Set(h.labels)))},[e.session]);const[o,r]=T(null);z(()=>{if(!o)return;const h=w=>{w.target.closest?.(".dd")||r(null)},y=w=>w.key==="Escape"&&r(null);return document.addEventListener("mousedown",h),document.addEventListener("keydown",y),()=>{document.removeEventListener("mousedown",h),document.removeEventListener("keydown",y)}},[o]);const a=JSON.stringify(t)!==JSON.stringify(e.filters),u=e.kind==="ANIME"?"reading":"watching",f=h=>/^\\d{4}$/.test(h.trim())?Number(h.trim()):null,d=(h,y,w,S)=>{const b=i.has(h)&&!y;return l("button",{type:"button",class:`pill btnlike ${y?"on":""} ${b?"blocked":""}`,"aria-pressed":y,disabled:b,title:b?`${w} is blacklisted in Settings`:void 0,onClick:S,children:w},h)},p=h=>l("button",{type:"button",class:"linkish",onClick:h,children:"Clear"}),m=(h,y,w,S,b)=>l("div",{class:"dd",children:[l("button",{type:"button",class:`trigger ${S?"set":""} ${o===h?"open":""}`,"aria-expanded":o===h,onClick:()=>r(o===h?null:h),children:[l("span",{class:"t-name",children:y}),w>0&&l("span",{class:"count",children:w}),l(ge,{d:ve.caret,cls:"caret"})]}),o===h&&l("div",{class:`pop ${h==="genres"?"wide":""}`,children:b})]}),c=t.yearFrom&&t.yearTo?t.yearFrom===t.yearTo?`${t.yearFrom}`:`${t.yearFrom}\u2013${t.yearTo}`:t.yearFrom?`From ${t.yearFrom}`:t.yearTo?`Until ${t.yearTo}`:null,_=[...[...t.genres.map(h=>[`genre:${h}`,h,()=>n({...t,genres:K(t.genres,h)})]),...t.mainTheme&&t.genres.length?[["main","Main theme",()=>n({...t,mainTheme:!1})]]:[],...t.formats.map(h=>[`format:${h}`,De(h),()=>n({...t,formats:K(t.formats,h)})]),...c?[["years",c,()=>n({...t,yearFrom:null,yearTo:null})]]:[],...t.statuses.map(h=>[`status:${h}`,mt(h),()=>n({...t,statuses:K(t.statuses,h)})]),...t.minScore?[["score",`Score ${t.minScore}%+`,()=>n({...t,minScore:0})]]:[],...t.tags.map(h=>[`tag:${h}`,h,()=>n({...t,tags:K(t.tags,h)})]),...t.minTagRank&&t.tags.length?[["rank",`Tags ${t.minTagRank}%+`,()=>n({...t,minTagRank:0})]]:[],...t.countries.map(h=>[`country:${h}`,Et(h),()=>n({...t,countries:K(t.countries,h)})]),...t.hideListed?[]:[["listed","Showing my titles",()=>n({...t,hideListed:!0})]],...t.hideSeenAdaptations?[["seen",`Hiding my ${u} list`,()=>n({...t,hideSeenAdaptations:!1})]]:[]].map(([h,y,w])=>l("button",{type:"button",class:"pill btnlike on",title:`Remove ${y}`,onClick:w,children:[y," ",l("span",{class:"x",children:"\u2715"})]},h)),...t.exclude.map(h=>l("button",{type:"button",class:"pill btnlike excluded",title:`Excluded from this search. Put ${At(h)} back`,"aria-label":`Put ${X(h)} back in this search`,disabled:e.busy,onClick:()=>e.onUnexclude(h),children:[l("span",{class:"kind",children:"not"})," ",X(h)," ",l("span",{class:"x",children:"\u2715"})]},`not:${h}`))];return l("div",{class:"fx","data-tour":"filters",children:[l("div",{class:"fx-row",children:[m("genres","Genres",t.genres.length,t.genres.length>0,l(W,{children:[l("div",{class:"pop-grid",children:bn.map(h=>l(Ft,{on:t.genres.includes(h),text:h,blocked:i.has(`genre:${h}`),onClick:()=>n({...t,genres:K(t.genres,h)})},h))}),l("div",{class:"pop-theme",children:l(Bt,{small:!0,label:"Enforce as main theme",checked:t.mainTheme,onChange:h=>n({...t,mainTheme:h})})}),l("div",{class:"pop-foot",children:[l("span",{class:"muted",children:"Titles must have every genre you pick"}),p(()=>n({...t,genres:[]}))]})]})),m("format","Format",t.formats.length,t.formats.length>0,l(W,{children:[l("div",{class:"pop-list",children:(qt[e.kind]??[]).map(h=>l(Ft,{on:t.formats.includes(h),text:De(h),blocked:i.has(`format:${h}`),onClick:()=>n({...t,formats:K(t.formats,h)})},h))}),l("div",{class:"pop-foot end",children:p(()=>n({...t,formats:[]}))})]})),m("years","Released",0,!!(t.yearFrom||t.yearTo),l(W,{children:[l("div",{class:"label",children:"First released"}),l("div",{class:"years",children:[l("input",{class:"field","aria-label":"From year",placeholder:"Any",value:t.yearFrom??"",onChange:h=>n({...t,yearFrom:f(h.target.value)})}),l("span",{class:"muted",children:"to"}),l("input",{class:"field","aria-label":"To year",placeholder:"Any",value:t.yearTo??"",onChange:h=>n({...t,yearTo:f(h.target.value)})})]}),l("div",{class:"label",style:"margin-top:.85rem",children:"Quick picks"}),l("div",{class:"pills",children:mc.map(([h,y])=>l("button",{type:"button",class:"pill btnlike",onClick:()=>{const[w,S]=y(new Date().getFullYear());n({...t,yearFrom:w,yearTo:S})},children:h},h))}),l("div",{class:"pop-foot end",children:p(()=>n({...t,yearFrom:null,yearTo:null}))})]})),m("status","Status",t.statuses.length,t.statuses.length>0,l(W,{children:[l("div",{class:"pop-list",children:(ur[e.kind]??[]).map(h=>l(Ft,{on:t.statuses.includes(h),text:mt(h),onClick:()=>n({...t,statuses:K(t.statuses,h)})},h))}),l("div",{class:"pop-foot end",children:p(()=>n({...t,statuses:[]}))})]})),l("button",{type:"button",class:`adv-btn ${e.advancedOpen?"open":""}`,"aria-expanded":e.advancedOpen,onClick:()=>e.setAdvancedOpen(!e.advancedOpen),children:[l(ge,{d:ve.sliders}),"Advanced",Pi(t)>0&&l("span",{class:"count",children:Pi(t)}),l(ge,{d:ve.caret,cls:"caret"})]}),l(vc,{count:_.length,children:_.length?_:l("span",{class:"muted",children:"No filters: picks from everything"})}),_.length>0&&l("button",{type:"button",class:"round small",title:"Clear all filters","aria-label":"Clear all filters",onClick:()=>n(_e()),children:"\u2715"}),l("button",{type:"button",class:`btn primary ${a?"":"idle"}`,disabled:e.busy,title:a?"Unapplied changes":"Apply also rereads your lists",onClick:()=>e.onApply(t),children:["Apply",a&&l("span",{class:"dot-new"})]})]}),e.advancedOpen&&l("div",{class:"adv-body",children:[l("div",{class:"adv-col",children:[l("div",{children:[l("div",{class:"label",children:"Tags"}),l(wc,{session:e.session,kind:e.kind,version:e.version,chosen:t.tags,blocked:i,onChange:h=>n({...t,tags:h})})]}),l(_c,{value:t.minTagRank,active:t.tags.length>0,onChange:h=>n({...t,minTagRank:h})})]}),l("div",{class:"adv-col",children:[l("div",{children:[l("div",{class:"label",children:"Country of origin"}),l("div",{class:"pills",children:zn.map(([h,y])=>d(`country:${h}`,t.countries.includes(h),y,()=>n({...t,countries:K(t.countries,h)})))}),l("div",{class:"label",style:"margin-top:1rem",children:"Your list"}),l("div",{class:"toggles",children:[l(Bt,{label:"Hide my titles",checked:t.hideListed,onChange:h=>n({...t,hideListed:h})}),l(Bt,{label:`Hide titles on my ${u} list`,checked:t.hideSeenAdaptations,onChange:h=>n({...t,hideSeenAdaptations:h})})]})]}),l(yc,{value:t.minScore,onChange:h=>n({...t,minScore:h})})]})]})]})}function Ft(e){const t=!!e.blocked&&!e.on;return l("button",{type:"button",role:"menuitemcheckbox","aria-checked":e.on,class:`check ${e.on?"on":""} ${t?"blocked":""}`,disabled:t,title:t?`${e.text} is blacklisted in Settings`:void 0,onClick:e.onClick,children:[l("span",{class:"box",children:e.on?"\u2713":""}),e.text]})}function vc(e){const t=Ie(null),[n,i]=T({left:!1,right:!1,hidden:0}),s=Ie(e.count),o=te(()=>{const a=t.current;if(!a)return;const u=a.scrollWidth>a.clientWidth+1,f=a.scrollLeft+a.clientWidth;i({left:u&&a.scrollLeft>1,right:u&&f<a.scrollWidth-1,hidden:[...a.children].filter(d=>d.offsetLeft+d.offsetWidth/2>f).length})},[]);z(()=>{const a=t.current;if(!a)return;const u=d=>{a.scrollWidth<=a.clientWidth||Math.abs(d.deltaX)>Math.abs(d.deltaY)||(a.scrollLeft+=d.deltaY,d.preventDefault())},f=new ResizeObserver(o);return f.observe(a),a.addEventListener("wheel",u,{passive:!1}),()=>{f.disconnect(),a.removeEventListener("wheel",u)}},[o]),z(()=>{const a=t.current;a&&e.count>s.current&&a.scrollTo({left:a.scrollWidth,behavior:"smooth"}),s.current=e.count,o()});const r=a=>{const u=t.current;u?.scrollBy({left:a*u.clientWidth*.8,behavior:"smooth"})};return l("div",{class:`chip-strip ${n.left?"fade-l":""} ${n.right?"fade-r":""}`,children:[l("div",{class:"chip-track",ref:t,onScroll:o,children:e.children}),l("button",{type:"button",class:"chip-more l","aria-label":"Scroll filters left",onClick:()=>r(-1),children:l(ge,{d:ve.next,cls:"caret"})}),l("button",{type:"button",class:"chip-more r","aria-label":`${n.hidden} more filters`,onClick:()=>r(1),children:[n.hidden>0&&`+${n.hidden}`,l(ge,{d:ve.next,cls:"caret"})]})]})}function _c(e){const t=e.value>0;return l("div",{class:`tagmin ${t?"on":""} ${e.active?"":"idle"}`,children:[l("div",{class:"tagmin-head",children:[l("span",{children:"Minimum tag percentage"}),l("b",{children:t?`${e.value}%+`:"Off"}),t&&l("button",{type:"button",class:"linkish muted",onClick:()=>e.onChange(0),children:"Turn off"})]}),l("input",{type:"range",min:0,max:100,step:5,value:e.value,"aria-label":"Minimum tag percentage","aria-valuetext":t?`${e.value}% or more`:"Off",style:{"--p":`${e.value}%`},onInput:n=>e.onChange(Number(n.target.value))}),l("div",{class:"tagmin-ticks",children:[l("span",{children:"Off"}),l("span",{children:"25%"}),l("span",{children:"50%"}),l("span",{children:"75%"}),l("span",{children:"100%"})]}),l("div",{class:"hint",children:e.active?"Only count a tag where AniList ranks it at least this relevant to the title.":"Applies once you pick a tag."})]})}function yc(e){const t=e.value>0;return l("div",{class:`tagmin ${t?"on":""}`,children:[l("div",{class:"tagmin-head",children:[l("span",{children:"Minimum AniList score"}),l("b",{children:t?`${e.value}%+`:"Off"}),t&&l("button",{type:"button",class:"linkish muted",onClick:()=>e.onChange(0),children:"Turn off"})]}),l("input",{type:"range",min:0,max:100,step:5,value:e.value,"aria-label":"Minimum AniList score","aria-valuetext":t?`${e.value}% or more`:"Off",style:{"--p":`${e.value}%`},onInput:n=>e.onChange(Number(n.target.value))}),l("div",{class:"tagmin-ticks",children:[l("span",{children:"Off"}),l("span",{children:"25%"}),l("span",{children:"50%"}),l("span",{children:"75%"}),l("span",{children:"100%"})]}),l("div",{class:"hint",children:"Only titles AniList\'s users average at least this high; titles without a score yet are left out."})]})}function wc(e){const[t,n]=T([]),[i,s]=T([]),[o,r]=T(""),[a,u]=T(!1);z(()=>{e.session.tagNames().then(n)},[e.session]),z(()=>{e.session.tasteFor(e.kind).then(c=>s(c?.likedTags.slice(0,8)??[]),()=>s([]))},[e.session,e.kind,e.version]);const f=o.trim().toLowerCase(),d=c=>!e.chosen.includes(c)&&!e.blocked?.has(`tag:${c}`),p=(f?t.filter(c=>c.toLowerCase().includes(f)):t).filter(d),m=c=>{e.onChange([...e.chosen,c]),r("")};return l("div",{class:"tag-picker",children:[e.chosen.length>0&&l("div",{class:"pills",style:"margin-bottom:.5rem",children:e.chosen.map(c=>l("button",{type:"button",class:"pill btnlike on",title:`Remove ${c}`,onClick:()=>e.onChange(e.chosen.filter(g=>g!==c)),children:[c," ",l("span",{class:"x",children:"\u2715"})]},c))}),l("input",{class:"field","aria-label":"Search tags",placeholder:t.length?`Search ${t.length} AniList tags\u2026`:"Loading tags\u2026",value:o,onInput:c=>r(c.target.value),onFocus:()=>u(!0),onBlur:()=>setTimeout(()=>u(!1),150),onKeyDown:c=>{c.key==="Enter"&&p[0]&&(c.preventDefault(),m(p[0]))}}),a&&p.length>0&&l("div",{class:"tag-menu",role:"listbox",children:p.map(c=>l("button",{type:"button",role:"option","aria-selected":!1,onMouseDown:g=>g.preventDefault(),onClick:()=>m(c),children:c},c))}),i.filter(d).length>0&&l("div",{class:"pills",style:"margin-top:.5rem;align-items:center",children:[l("span",{class:"muted",style:"font-size:.78rem",children:"Your top tags:"}),i.filter(d).map(c=>l("button",{type:"button",class:"pill btnlike",onClick:()=>m(c),children:["+ ",c]},c))]})]})}function Bt(e){return l("label",{class:`toggle ${e.small?"small":""}`,children:[l("span",{class:"switch",children:[l("input",{type:"checkbox",checked:e.checked,onChange:t=>e.onChange(t.target.checked)}),l("span",{})]}),e.label]})}function bc(e){const{session:t,rec:n,onClose:i}=e,s=n.media,o=t.host,[r,a]=T([]),[u,f]=T(null),[d,p]=T([]),[m,c]=T("idle");z(()=>{t.themesOf(s).then(a),t.titleDetails(s.id).then(f,()=>f("failed"));const b=v=>v.key==="Escape"&&i();return document.addEventListener("keydown",b),document.documentElement.classList.add("dialog-open"),()=>{document.removeEventListener("keydown",b),document.documentElement.classList.remove("dialog-open")}},[t,s,i]);const g=Oe(()=>[...s.genres.map(b=>`genre:${b}`),...s.tags.filter(b=>!b.spoiler).slice(0,8).map(b=>`tag:${b.name}`),...s.studios.map(b=>`studio:${b}`),...s.format?[`format:${s.format}`]:[],...s.country?[`country:${s.country}`]:[]],[s]),_=Oe(()=>yt(e.filters),[e.filters]),h=s.scoreDistribution??[],y=Math.max(1,...h.map(([,b])=>b)),w=Ki(s),S=s.type==="ANIME"?"episode":"chapter";return l(W,{children:[l("button",{type:"button",class:"scrim open",tabIndex:-1,"aria-label":"Close",onClick:i}),l("div",{class:"drawer open",role:"dialog","aria-modal":"true","aria-label":e.title,children:[l("button",{type:"button",class:"close",title:"Close","aria-label":"Close",onClick:i,children:"\u2715"}),l("div",{class:"dtop",children:[l("div",{class:"dcover",children:[s.coverUrl?l("img",{src:s.coverUrl,alt:""}):null,u&&u!=="failed"&&u.trailer&&l(Mc,{trailer:u.trailer,onOpen:async b=>{if(!o.openTrailer){window.open(b.url,"_blank","noopener");return}try{await o.openTrailer(s,b)}catch(v){e.toast(`Couldn\'t open the trailer: ${Z(v)}`)}}})]}),l("div",{class:"dinfo",children:[l("h2",{children:e.title}),l("div",{class:"muted",style:"font-size:.88rem",children:[De(s.format)," \xB7 ",s.year??"\u2014",s.status?` \xB7 ${mt(s.status)}`:"",w?` \xB7 ${w} ${S}${w===1?"":"s"}`:"",s.studios[0]?` \xB7 ${s.studios[0]}`:"",s.country?` \xB7 ${Et(s.country)}`:""]}),l("div",{class:"themes",children:r.slice(0,5).map(b=>l("span",{class:`theme ${b.main?"main":""}`,children:[b.genre,b.main?" \xB7 main theme":""]},b.genre))}),e.showRatings&&s.averageScore!==null&&l("div",{class:"ratings",children:[l("div",{class:"metrics",children:[l(Ge,{name:"Average",value:`${s.averageScore}%`}),l(Ge,{name:"Mean",value:s.meanScore!==null?`${s.meanScore}%`:"\u2014"}),l(Ge,{name:"Users",value:s.popularity!==null?hn(s.popularity):"\u2014"}),l(Ge,{name:"Favourites",value:s.favourites!==null?hn(s.favourites):"\u2014"})]}),h.length>0&&l(W,{children:[l("div",{class:"dist",children:h.map(([b,v])=>l("span",{title:`${b}: ${v.toLocaleString()} users`,style:{height:`${Math.max(3,v/y*100)}%`,background:`hsl(${(b-10)/90*120},65%,52%)`}},b))}),l("div",{class:"dist-axis",children:h.map(([b])=>l("span",{children:b},b))})]})]}),l("div",{class:"synopsis",children:u===null?"Loading the description\u2026":u==="failed"?"":u.description})]})]}),l("div",{class:"dfoot",children:[l("div",{class:"actions",children:[o.addToPlanning?l("button",{type:"button",class:`btn primary ${m==="done"||m==="listed"?"done":""}`,disabled:m!=="idle","aria-busy":m==="busy",onClick:async()=>{c("busy");try{await t.addToPlanning(s),c("done"),e.onPlanned(s)}catch(b){const v=Z(b).includes("already on your list");c(v?"listed":"idle"),e.toast(v?"It\'s already on your list":`Couldn\'t add it: ${Z(b)}`)}},children:m==="busy"?l(W,{children:[l("span",{class:"spinner small","aria-hidden":"true"}),"Adding\u2026"]}):m==="done"?"\u2713 On your planning list":m==="listed"?"Already on your list":"\uFF0B Add to planning"}):null,o.kind==="seanime"&&l("button",{type:"button",class:"btn",onClick:()=>o.openTitle(s),children:"Open in Seanime"}),l("button",{type:"button",class:"btn site",title:"Open on AniList",onClick:async()=>{if(!o.openOnSite){s.siteUrl&&window.open(s.siteUrl,"_blank","noopener");return}try{await o.openOnSite(s)}catch(b){e.toast(`Couldn\'t open AniList: ${Z(b)}`)}},children:[l("img",{src:ea,alt:"",width:18,height:18}),"AniList"]})]}),l("div",{children:[l("div",{class:"label",children:"Exclude from this search"}),l("div",{class:"chips dtags",style:"margin:0",children:g.map(b=>{const v=_.has(b);return l("button",{type:"button",class:`pill btnlike ${d.includes(b)?"on":""} ${v?"blocked":""}`,"aria-pressed":d.includes(b),disabled:v,title:v?`You\'re filtering by ${X(b)}, so it can\'t be excluded`:At(b),onClick:()=>p(K(d,b)),children:X(b)},b)})}),l("button",{type:"button",class:"btn",disabled:!d.length,style:{marginTop:".6rem",opacity:d.length?1:.5},onClick:()=>e.onExcludeLabels(d),children:d.length?`Exclude ${d.length} selected`:"Exclude selected"})]}),u===null&&l("div",{class:"muted people-loading",children:"Loading characters and staff\u2026"}),u&&u!=="failed"&&l(Ec,{details:u})]})]})]})}const Sc={youtube:"YouTube",dailymotion:"Dailymotion"};function Mc(e){const{trailer:t}=e,n=Sc[t.site];return l("button",{type:"button",class:"trailer",title:`Watch the trailer on ${n}`,"aria-label":`Watch the trailer on ${n}`,style:t.thumbnail?{backgroundImage:`url("${t.thumbnail}")`}:void 0,onClick:()=>e.onOpen(t),children:[l("span",{class:"tr-play","aria-hidden":"true"}),l("span",{class:"tr-tag",children:["\u25B6 Trailer \xB7 ",n]})]})}const kc={MAIN:"Main",SUPPORTING:"Supporting",BACKGROUND:"Background"};function jt({src:e,round:t,size:n}){const i={width:`${n}px`,height:`${t?n:Math.round(n*1.33)}px`};return e?l("img",{class:`avatar-img ${t?"round":""}`,src:e,alt:"",loading:"lazy",style:i}):l("span",{class:`avatar-img ph ${t?"round":""}`,style:i})}function Ec({details:e}){return l(W,{children:[e.characters.length>0&&l("div",{children:[l("div",{class:"label",children:"Characters"}),l("div",{class:"people-grid",children:e.characters.map(t=>l("div",{class:"person",children:[l(jt,{src:t.image,size:44}),l("div",{class:"who",children:[l("b",{children:t.name}),l("small",{children:kc[t.role]??t.role}),t.voiceActor&&l("span",{class:"va",title:"Japanese voice actor",children:[l(jt,{src:t.voiceActor.image,size:18,round:!0}),t.voiceActor.name]})]})]},t.id))})]}),e.staff.length>0&&l("div",{children:[l("div",{class:"label",children:"Staff"}),l("div",{class:"people-grid",children:e.staff.map(t=>l("div",{class:"person",children:[l(jt,{src:t.image,size:38,round:!0}),l("div",{class:"who",children:[l("b",{children:t.name}),l("small",{children:t.roles.join(", ")})]})]},t.id))})]})]})}function Ge({name:e,value:t}){return l("div",{class:"metric",children:[l("span",{children:e}),l("b",{children:t})]})}function xc(e){const[t,n]=T(void 0),[i,s]=T(null);z(()=>{n(void 0),e.session.tasteFor(e.kind).then(n,r=>s(Z(r)))},[e.session,e.kind]);const o=(r,a)=>{const u=Math.max(1e-9,...r.map(([,f])=>Math.abs(f)));return r.map(([f,d])=>{const[p,m]=xt(f);return l("div",{class:"barrow",children:[l("span",{children:[m,l("small",{children:p})]}),l("div",{class:"bar",children:l("i",{style:{width:`${Math.abs(d)/u*100}%`,background:a}})}),l("span",{class:"muted",children:Math.abs(d).toFixed(2)})]},f)})};return l("section",{class:"view on",children:[l("div",{class:"head",children:[l("div",{children:[l("h1",{children:"Stats"}),l("div",{class:"sub",children:t?`Learned from your anime and manga lists together; showing what appears in your ${pn(e.kind)} list`:"What the recommendations learned from your lists"})]}),l("div",{class:"tools",children:l(_o,{label:"Anime or manga",value:e.kind,options:[["ANIME","Anime"],["MANGA","Manga"]],onChange:e.setKind})})]}),i&&l("div",{class:"warn error",children:i}),t===void 0&&!i&&l(Un,{busy:{step:"Reading your list"}}),t===null&&l("div",{class:"empty",children:[l("h2",{children:["No ",pn(e.kind)," list yet"]}),l("p",{children:"Sync your list from the For you page first."})]}),t&&l(W,{children:[l("div",{class:"stats",children:[l(qe,{name:"On your list",value:String(t.onList)}),l(qe,{name:"Scored",value:String(t.scored)}),l(qe,{name:"Your average",value:t.mean!==null?t.mean.toFixed(1):"\u2014",suffix:" / 10"}),l(qe,{name:"Learned from",value:String(t.learnedFrom)})]}),l("div",{class:"two",children:[l("div",{class:"panel",children:[l("h2",{children:"You tend to enjoy"}),o(t.likes,"linear-gradient(90deg, var(--accent), #a99cff)")]}),l("div",{class:"panel",children:[l("h2",{children:"You tend to avoid"}),o(t.dislikes,"linear-gradient(90deg, var(--accent-2), #ff9cc0)")]})]})]})]})}function qe({name:e,value:t,suffix:n}){return l("div",{class:"stat",children:[l("span",{class:"muted",children:e}),l("b",{children:[t,n&&l("span",{class:"muted",style:"font-size:1rem",children:n})]})]})}function Ac(e){const{session:t,settings:n}=e,i=t.host.kind==="seanime",s=r=>e.saveSettings({...n,...r}),o=[["english","English (Attack on Titan)"],["romaji","Romaji (Shingeki no Kyojin)"],["native","Native (\u9032\u6483\u306E\u5DE8\u4EBA)"]];return l("section",{class:"view on",children:[l("div",{class:"head",children:l("div",{children:[l("h1",{children:"Settings"}),l("div",{class:"sub",children:i?"Uses the AniList account you\'re signed in with in Seanime":`Signed in as ${t.user} \xB7 stored on this device`})]})}),l("div",{class:"settings",children:[l("h2",{class:"section",children:"Preferences"}),l(he,{name:"Title language",hint:"Falls back to another language when AniList has none",children:l("select",{class:"field",style:"width:240px","aria-label":"Title language",value:n.titleLanguage,onChange:r=>s({titleLanguage:r.target.value}),children:o.map(([r,a])=>l("option",{value:r,children:a},r))})}),l(he,{name:"Show AniList ratings",hint:"Score and users on cards, distribution in details",children:l(Oi,{label:"Show AniList ratings",checked:n.showRatings,onChange:r=>s({showRatings:r})})}),l(he,{name:"Include adult titles",children:l(Oi,{label:"Include adult titles",checked:n.includeAdult,onChange:r=>s({includeAdult:r})})}),l(he,{name:"Picks per page",hint:"Show more adds another page",children:l("select",{class:"field",style:"width:110px","aria-label":"Picks per page",value:n.limit,onChange:r=>s({limit:Number(r.target.value)}),children:[20,40,60].map(r=>l("option",{value:r,children:r},r))})}),l("h2",{class:"section",children:"Exclusions"}),l(Tc,{session:t,language:n.titleLanguage}),l("h2",{class:"section",children:"Help"}),l(he,{name:"Tour",hint:"A quick look at each page",children:l("button",{type:"button",class:"btn",onClick:e.startTour,children:"Start tour"})}),l("h2",{class:"section",children:"Data"}),l(he,{name:"Clear all data",hint:i?"Deletes this plugin\'s saved picks, settings and exclusions (your Seanime sign-in is untouched)":"Deletes everything stored locally",children:l("button",{type:"button",class:"btn",style:"color:var(--bad)",onClick:async()=>{confirm("Delete all saved picks, settings and exclusions?")&&(await t.clear(),e.toast("Cleared. Reloading\u2026"),setTimeout(()=>location.reload(),600))},children:"Clear"})})]})]})}function he(e){return l("div",{class:"setting",children:[l("div",{children:[e.name,e.hint&&l("small",{children:e.hint})]}),e.children]})}function Tc({session:e,language:t}){const[n,i]=T(null),[s,o]=T(new Map),[r,a]=T({ANIME:[],MANGA:[]});if(z(()=>{(async()=>{const c=await e.exclusions();i(c),o(await e.media([...c.titles,...c.notInterested??[]])),a({ANIME:await e.customListNames("ANIME"),MANGA:await e.customListNames("MANGA")})})()},[e]),!n)return null;const u=async c=>i(await e.setExclusions(c)),f=l("span",{class:"muted",children:"Nothing yet."}),d=n.notInterested??[],p=n.titles.filter(c=>!d.includes(c)),m=c=>{const g=s.get(c);return g?ke(g,t):`#${c}`};return l(W,{children:[l("div",{class:"panel",children:[l("h2",{children:["Not interested"," ",l("span",{class:"muted",style:"font-weight:400;font-size:.8rem",children:"hidden, and your picks lean away from them"})]}),l("div",{class:"chips",style:"margin:0",children:d.length?d.map(c=>l(zt,{text:m(c),onRemove:()=>u(g=>{g.titles=g.titles.filter(_=>_!==c),g.notInterested=(g.notInterested??[]).filter(_=>_!==c)})},c)):f})]}),l("div",{class:"panel",children:[l("h2",{children:["Excluded titles"," ",l("span",{class:"muted",style:"font-weight:400;font-size:.8rem",children:"sequels follow"})]}),l("div",{class:"chips",style:"margin:0",children:p.length?p.map(c=>l(zt,{text:m(c),onRemove:()=>u(g=>g.titles=g.titles.filter(_=>_!==c))},c)):f})]}),l("div",{class:"panel",children:[l("h2",{children:["Blacklisted"," ",l("span",{class:"muted",style:"font-weight:400;font-size:.8rem",children:"always left out of every search; exclude from a title to leave it out of one search"})]}),l(Lc,{session:e,taken:new Set(n.labels),onAdd:async c=>i(await e.blacklist([c]))}),l("div",{class:"chips",style:"margin:.6rem 0 0",children:n.labels.length?n.labels.map(c=>l(zt,{text:X(c),title:At(c),onRemove:()=>u(g=>g.labels=g.labels.filter(_=>_!==c))},c)):f})]}),l("div",{class:"panel",children:[l("h2",{children:"Excluded custom lists"}),Ze.map(c=>l("div",{class:"chips",style:"margin:.2rem 0",children:[l("span",{class:"muted",style:"width:60px",children:c==="ANIME"?"Anime":"Manga"}),r[c].length?r[c].map(g=>{const _=n.customLists[c].includes(g);return l("button",{type:"button",class:`pill btnlike ${_?"on":""}`,"aria-pressed":_,onClick:()=>u(h=>{h.customLists[c]=K(h.customLists[c],g)}),children:g},g)}):l("span",{class:"muted",children:"No custom lists"})]},c))]})]})}function zt({text:e,title:t,onRemove:n}){return l("button",{type:"button",class:"pill btnlike",title:`Remove ${t??e}`,onClick:n,children:[e," ",l("span",{class:"x",children:"\u2715"})]})}function $c(e){const t=[...new Set([...qt.ANIME??[],...qt.MANGA??[]])];return[...bn.map(n=>`genre:${n}`),...e.map(n=>`tag:${n}`),...zn.map(([n])=>`country:${n}`),...t.map(n=>`format:${n}`)]}function Lc(e){const[t,n]=T([]),[i,s]=T(""),[o,r]=T(!1);z(()=>{e.session.tagNames().then(n)},[e.session]);const a=i.trim().toLowerCase(),u=a?$c(t).filter(m=>!e.taken.has(m)&&At(m).toLowerCase().includes(a)).slice(0,40):[],f=`studio:${i.trim()}`,d=a&&!e.taken.has(f)?[...u,f]:u,p=m=>{e.onAdd(m),s("")};return l("div",{class:"tag-picker",children:[l("input",{class:"field","aria-label":"Blacklist a genre, tag, country, format or studio",placeholder:"Add a genre, tag, country, format or studio\u2026",value:i,onInput:m=>s(m.target.value),onFocus:()=>r(!0),onBlur:()=>setTimeout(()=>r(!1),150),onKeyDown:m=>{m.key==="Enter"&&d[0]&&(m.preventDefault(),p(d[0]))}}),o&&d.length>0&&l("div",{class:"tag-menu",role:"listbox",children:d.map(m=>l("button",{type:"button",role:"option","aria-selected":!1,onMouseDown:c=>c.preventDefault(),onClick:()=>p(m),children:[l("span",{class:"muted",children:vo[xt(m)[0]]})," ",X(m)]},m))})]})}function Cc(e,t=document.body){Lo(l(uc,{host:e}),t)}const Nc="rpc",Ic="rpc-reply",Oc="seanime",wo=6e4,Pc=1e3;function Dc(e,t=wo){let n=1;const i=new Map;return e.on(Ic,s=>{const o=s,r=i.get(o?.id);r&&(i.delete(o.id),clearTimeout(r.timer),o.ok?r.resolve(o.result):r.reject(new Error(o.error)))}),function(o,...r){const a=n++;return new Promise((u,f)=>{const d=setTimeout(()=>{i.delete(a),f(new Error(`Seanime didn\'t answer (${o})`))},t);i.set(a,{resolve:u,reject:f,timer:d}),e.send(Nc,{id:a,method:o,args:r})})}}function Rc(e,t=wo,n=Pc){const i=Dc(e,t);return{kind:"seanime",transport:Do({}),user:async()=>({name:Oc}),waitForSetup:async s=>{for(;;){const o=await i("setupStatus");if(!o.running)return;s(o.step??"Setting up",o.done,o.total),await new Promise(r=>setTimeout(r,n))}},list:s=>i("list",s),loadStore:()=>i("loadStore"),saveStore:async s=>{await i("saveStore",s)},addToPlanning:async s=>{await i("addToPlanning",s.id,s.type)},openTitle:s=>{i("openTitle",s.id,s.type)},openOnSite:async s=>{const o=s.siteUrl??`https://anilist.co/${s.type.toLowerCase()}/${s.id}`;await i("openOnSite",o,s.titles?.english??s.title)},openTrailer:async(s,o)=>{await i("openTrailer",o.url,s.titles?.english??s.title)}}}const Di=window.webview;Di?Cc(Rc(Di),document.getElementById("app")??document.body):document.body.textContent="This page only works inside Seanime.";</script>\n    <style rel="stylesheet" crossorigin>.driver-layer{width:auto!important;max-width:none!important;height:auto!important;max-height:none!important;color:inherit!important;pointer-events:none!important;background:0 0!important;border:0!important;margin:0!important;padding:0!important;position:fixed!important;inset:0!important;overflow:visible!important}.driver-layer::backdrop{display:none}.driver-layer .driver-popover{pointer-events:auto}.driver-popover{all:unset;font-family:var(--driver-popover-font-family,"Helvetica Neue", Inter, ui-sans-serif, "Apple Color Emoji", Helvetica, Arial, sans-serif);box-sizing:border-box;pointer-events:auto;color:#2d2d2d;z-index:1000000000;background-color:#fff;border-radius:5px;min-width:250px;max-width:300px;margin:0;padding:15px;position:fixed;top:0;right:0;box-shadow:0 1px 10px #0006}.driver-popover-title{zoom:1;margin:0;font-size:19px;font-weight:700;line-height:1.5;display:block;position:relative}.driver-popover-close-btn{all:unset;cursor:pointer;color:#d2d2d2;z-index:1;text-align:center;width:32px;height:28px;font-size:18px;font-weight:500;transition:color .2s;position:absolute;top:0;right:0}.driver-popover-close-btn:hover,.driver-popover-close-btn:focus-visible{color:#2d2d2d}.driver-popover-title:not([style*=none])+.driver-popover-description{margin-top:5px}.driver-popover-description{zoom:1;margin-bottom:0;font-size:14px;font-weight:400;line-height:1.5}.driver-popover-footer{text-align:right;zoom:1;justify-content:space-between;align-items:center;margin-top:15px;display:flex}.driver-popover-progress-text{color:#727272;zoom:1;font-size:13px;font-weight:400}.driver-popover-footer-btn{all:unset;box-sizing:border-box;color:#2d2d2d;cursor:pointer;zoom:1;background-color:#fff;border:1px solid #ccc;border-radius:3px;outline:0;padding:3px 7px;font-size:12px;line-height:1.3;text-decoration:none;display:inline-block}.driver-popover-footer .driver-popover-btn-disabled{opacity:.5;pointer-events:none}.driver-popover-footer-btn:hover,.driver-popover-footer-btn:focus-visible{background-color:#f7f7f7}.driver-popover-navigation-btns{flex-grow:1;justify-content:flex-end;display:flex}.driver-popover-navigation-btns button+button{margin-inline-start:4px}.driver-popover-arrow{content:"";border:5px solid #fff;position:absolute}.driver-popover-arrow-side-over{display:none}.driver-popover-arrow-side-left{border-top-color:#0000;border-bottom-color:#0000;border-right-color:#0000;left:100%}.driver-popover-arrow-side-right{border-top-color:#0000;border-bottom-color:#0000;border-left-color:#0000;right:100%}.driver-popover-arrow-side-top{border-bottom-color:#0000;border-left-color:#0000;border-right-color:#0000;top:100%}.driver-popover-arrow-side-bottom{border-top-color:#0000;border-left-color:#0000;border-right-color:#0000;bottom:100%}.driver-popover-arrow-side-center,.driver-popover-arrow-none{display:none}.driver-active .driver-overlay{pointer-events:none}.driver-active.driver-no-scroll{overflow:hidden}.driver-active :where(:not(.driver-page-interactive *,.driver-active-element,.driver-active-element *,.driver-allowed-element,.driver-allowed-element *,.driver-popover,.driver-popover *)){pointer-events:none}.driver-page-interactive .driver-overlay path{pointer-events:none!important}.driver-active .driver-active-element,.driver-popover{pointer-events:auto}.driver-active .driver-allowed-element{pointer-events:auto;z-index:var(--driver-allowed-z-index,10001)}.driver-active .driver-active-element-raised{outline:var(--driver-raised-highlight-width,2px) solid var(--driver-raised-highlight-color,#2563eb);outline-offset:var(--driver-raised-highlight-offset,-2px);box-shadow:inset 0 0 0 100vmax var(--driver-raised-highlight-background,#2563eb1a)}@keyframes animate-fade-in{0%{opacity:0}to{opacity:1}}.driver-fade .driver-overlay{animation:animate-fade-in var(--driver-animation-duration,.4s) ease-in-out}.driver-fade .driver-popover{animation:animate-fade-in var(--driver-animation-duration,.4s)}.driver-active-element-parent-no-scroll{overflow:hidden!important}.driver-no-interaction,.driver-no-interaction *{pointer-events:none!important}.driver-popover.driver-popover-waiting .driver-popover-title,.driver-popover.driver-popover-waiting .driver-popover-description,.driver-popover.driver-popover-waiting .driver-popover-footer{opacity:.55;transition:opacity .15s ease-in-out}@keyframes driver-nudge-shake{0%,to{transform:translate(0)}20%{transform:translate(calc(-1 * var(--driver-nudge-distance,6px)))}40%{transform:translate(var(--driver-nudge-distance,6px))}60%{transform:translate(calc(-.5 * var(--driver-nudge-distance,6px)))}80%{transform:translate(calc(.5 * var(--driver-nudge-distance,6px)))}}@keyframes driver-nudge-flash{0%{box-shadow:0 0 0 3px var(--driver-nudge-color,#f59e0b)}to{box-shadow:0 0 0 3px #0000}}.driver-popover.driver-popover-nudge{animation:driver-nudge-shake var(--driver-nudge-duration,.5s) ease-in-out}.driver-fade .driver-popover.driver-popover-nudge{animation:animate-fade-in var(--driver-animation-duration,.4s),driver-nudge-shake var(--driver-nudge-duration,.5s) ease-in-out}@media(prefers-reduced-motion:reduce){.driver-popover.driver-popover-nudge{animation:driver-nudge-flash var(--driver-nudge-duration,.5s) ease-out}.driver-fade .driver-popover.driver-popover-nudge{animation:animate-fade-in var(--driver-animation-duration,.4s),driver-nudge-flash var(--driver-nudge-duration,.5s) ease-out}}.driver-popover-instruction{padding:var(--driver-instruction-padding,8px 10px);border-radius:var(--driver-instruction-radius,4px);background-color:var(--driver-instruction-background,#f2f2f2);color:var(--driver-instruction-color,inherit);align-items:flex-start;gap:10px;margin-top:12px;font-size:14px;line-height:1.5;display:flex}.driver-popover-instruction-text{overflow-wrap:break-word;flex:1;min-width:0}.driver-popover-instruction-indicator{--size:var(--driver-instruction-indicator-size,8px);box-sizing:border-box;width:var(--size);height:var(--size);margin:calc((1.5em - var(--size)) / 2) 2px 0;background-color:var(--driver-instruction-indicator-color,#f59e0b);border-radius:50%;flex:none;animation:1.6s ease-in-out infinite driver-instruction-pulse}:where(.driver-popover:not(.driver-popover-has-instruction)) .driver-popover-instruction-indicator{display:none}@keyframes driver-instruction-pulse{50%{opacity:.35;transform:scale(.7)}}.driver-popover-instruction-done .driver-popover-instruction{background-color:var(--driver-instruction-done-background,#dcfce7);color:var(--driver-instruction-done-color,#15803d)}.driver-popover-instruction-done .driver-popover-instruction-indicator{width:calc(var(--size) * .7);height:calc(var(--size) * 1.3);margin-top:calc((1.5em - var(--size) * 1.3) / 2 - 1px);background:0 0;border:2px solid;border-width:0 2px 2px 0;border-radius:0;animation:none;transform:rotate(45deg)}.driver-popover-footer .driver-popover-btn-disabled[aria-disabled]{pointer-events:auto;cursor:default;opacity:1;color:var(--driver-instruction-next-color,#a3a3a3);background-color:#fff}.driver-popover-instruction-done .driver-popover-footer .driver-popover-next-btn{border-color:var(--driver-instruction-done-color,#15803d);background-color:var(--driver-instruction-done-color,#15803d);color:#fff}.driver-popover-nudge .driver-popover-instruction{box-shadow:0 0 0 2px var(--driver-instruction-indicator-color,#f59e0b)}@media(prefers-reduced-motion:reduce){.driver-popover-instruction-indicator{animation:none}}.driver-popover-feedback{color:var(--driver-feedback-color,#b45309);overflow-wrap:break-word;margin-top:8px;font-size:13px;line-height:1.4}:root{--bg: #0d0f14;--surface: #151821;--surface-2: #1c202b;--surface-3: #252a37;--line: #2a2f3c;--text: #e9ebf1;--muted: #8d94a6;--faint: #5d6476;--accent: #8b7bff;--accent-2: #ff6fa3;--accent-soft: rgba(139, 123, 255, .14);--good: #4ade80;--ok: #facc15;--bad: #f87171;--radius: 14px;--shadow: 0 10px 30px rgba(0, 0, 0, .35);color-scheme:dark}[data-theme=light]{--bg: #f5f6fa;--surface: #ffffff;--surface-2: #f0f1f6;--surface-3: #e6e8ef;--line: #e1e4ec;--text: #171a22;--muted: #646b7d;--faint: #9aa0ae;--accent: #6b5cf0;--accent-2: #e5508a;--accent-soft: rgba(107, 92, 240, .1);--shadow: 0 10px 30px rgba(20, 24, 40, .12);color-scheme:light}*{box-sizing:border-box}html,body{margin:0}body{font:14px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;background:var(--bg);color:var(--text);-webkit-font-smoothing:antialiased}button{font:inherit;color:inherit}a{color:var(--accent);text-decoration:none}h1,h2,h3{margin:0;letter-spacing:-.01em}.muted{color:var(--muted)}.icon{width:18px;height:18px;flex:none}.btn{display:inline-flex;align-items:center;gap:.45rem;height:36px;padding:0 .9rem;border-radius:10px;border:1px solid var(--line);background:var(--surface-2);cursor:pointer;transition:background .15s,border-color .15s,transform .1s;white-space:nowrap}.btn:hover{background:var(--surface-3)}.btn:active{transform:scale(.98)}.btn.primary{background:linear-gradient(135deg,var(--accent),#6a5cff);border-color:transparent;color:#fff;box-shadow:0 6px 18px #7c6cff59}.btn.primary:hover{filter:brightness(1.08)}.btn.ghost{background:transparent;border-color:transparent;color:var(--muted)}.btn.ghost:hover{color:var(--text);background:var(--surface-2)}.btn.danger{color:var(--bad);background:transparent;border-color:transparent;padding:0;height:auto}.badge{min-width:20px;height:20px;padding:0 6px;border-radius:999px;background:var(--accent);color:#fff;font-size:.72rem;font-weight:700;display:inline-grid;place-items:center}.seg{display:inline-flex;padding:3px;border-radius:11px;background:var(--surface-2);border:1px solid var(--line)}.seg button{border:0;background:transparent;padding:.35rem .95rem;border-radius:8px;cursor:pointer;color:var(--muted);font-weight:600}.seg button.on{background:var(--surface);color:var(--text);box-shadow:0 1px 3px #00000040}.pill{display:inline-flex;align-items:center;gap:.35rem;padding:.28rem .7rem;border-radius:999px;background:var(--surface-2);border:1px solid var(--line);font-size:.8rem;color:var(--text);cursor:pointer;transition:background .15s,border-color .15s}.pill:hover{border-color:var(--faint)}.pill.on{background:var(--accent-soft);border-color:var(--accent);color:var(--accent)}.pill .x{opacity:.6}.pill:hover .x{opacity:1}.switch{position:relative;display:inline-block;cursor:pointer;width:38px;height:22px;flex:none}.switch input{opacity:0;width:0;height:0}.switch span{position:absolute;inset:0;border-radius:999px;background:var(--surface-3);transition:background .15s;cursor:pointer}.switch span:after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .15s}.switch input:checked+span{background:var(--accent)}.switch input:checked+span:after{transform:translate(16px)}.field{height:36px;padding:0 .75rem;border-radius:10px;border:1px solid var(--line);background:var(--surface-2);color:var(--text);font:inherit;width:100%}.label{font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:.45rem}.toast{position:fixed;bottom:24px;left:50%;transform:translate(-50%,20px);opacity:0;pointer-events:none;background:var(--surface-3);color:var(--text);padding:.65rem 1rem;border-radius:12px;box-shadow:var(--shadow);transition:all .2s;z-index:60;border:1px solid var(--line)}.toast.show{opacity:1;transform:translate(-50%)}.shell{display:grid;grid-template-columns:236px 1fr;min-height:100vh}.shell.top{grid-template-columns:1fr;grid-template-rows:auto 1fr}.side{position:sticky;top:0;height:100vh;display:flex;flex-direction:column;gap:.25rem;padding:1.1rem .85rem;background:var(--surface);border-right:1px solid var(--line)}.shell.top .side{position:sticky;top:0;z-index:20;height:auto;flex-direction:row;align-items:center;padding:.6rem 1.2rem;border-right:0;border-bottom:1px solid var(--line)}.brand{display:flex;align-items:center;gap:.6rem;font-weight:800;font-size:1.05rem;padding:.2rem .5rem 1rem}.shell.top .brand{padding:0 1.2rem 0 0}.logo{width:30px;height:30px;border-radius:9px;border:2px dashed var(--faint);background:var(--surface-2)}.nav{display:flex;align-items:center;gap:.65rem;padding:.55rem .7rem;border-radius:10px;color:var(--muted);cursor:pointer;font-weight:600;transition:background .15s,color .15s}.nav:hover{background:var(--surface-2);color:var(--text)}.nav.on{background:var(--accent-soft);color:var(--accent)}.side-foot{margin-top:auto;display:flex;flex-direction:column;gap:.6rem}.shell.top .side-foot{margin:0 0 0 auto;flex-direction:row;align-items:center}.me{display:flex;align-items:center;gap:.6rem;padding:.55rem .6rem;border-radius:12px;background:var(--surface-2);cursor:pointer}.avatar{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;font-weight:700;color:#fff;background:linear-gradient(135deg,#3aa7ff,#6a5cff);flex:none}.me small{display:block;color:var(--muted);font-size:.72rem;line-height:1.2}.shell.top .me small,.shell.top .nav-profile{display:none}.sync{display:flex;align-items:center;gap:.45rem;font-size:.75rem;color:var(--muted);padding:0 .6rem}.dot{width:7px;height:7px;border-radius:50%;background:var(--good);box-shadow:0 0 0 3px #4ade8026}main{padding:1.6rem 2rem 3rem;min-width:0}.view{display:none;animation:fade .2s ease}.view.on{display:block}@keyframes fade{0%{opacity:0;transform:translateY(4px)}}.head{display:flex;align-items:flex-end;gap:1rem;flex-wrap:wrap;margin-bottom:1.1rem}.head h1{font-size:1.75rem;font-weight:800}.head .sub{color:var(--muted);font-size:.85rem;margin-top:.15rem}.head .tools{margin-left:auto;display:flex;gap:.55rem;align-items:center}.chips{display:flex;gap:.45rem;flex-wrap:wrap;align-items:center;margin-bottom:1.1rem}.toggles{display:grid;gap:.65rem}.toggle{display:flex;align-items:center;gap:.7rem}.fx{position:relative;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);margin-bottom:1.2rem}.fx-row{display:flex;align-items:center;flex-wrap:wrap;gap:.5rem;padding:.7rem .8rem}.fx .pills{display:flex;gap:.4rem;flex-wrap:wrap}.btn.primary.idle{background:var(--surface-2);border-color:var(--line);color:var(--muted);box-shadow:none}.btn.primary.idle:hover{color:var(--text);filter:none;background:var(--surface-3)}.dd{position:relative}.trigger{display:inline-flex;align-items:center;gap:.45rem;height:36px;padding:0 .7rem 0 .8rem;border-radius:10px;border:1px solid var(--line);background:var(--surface-2);cursor:pointer;white-space:nowrap;max-width:260px}.trigger:hover{background:var(--surface-3)}.trigger .t-name{color:var(--muted)}.trigger.set{border-color:var(--accent);background:var(--accent-soft)}.trigger.set .t-name{color:var(--accent)}.trigger.open{border-color:var(--accent)}.caret{width:14px;height:14px;flex:none;opacity:.7;transition:transform .15s}.count{min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:var(--accent);color:#fff;font-size:.7rem;font-weight:700;display:inline-grid;place-items:center}.pop{position:absolute;z-index:25;top:calc(100% + 6px);left:0;min-width:220px;padding:.6rem;background:var(--surface);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow);animation:fade .14s ease}.pop.wide{width:470px}.pop-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:.1rem}.check{display:flex;align-items:center;gap:.55rem;padding:.4rem .5rem;border-radius:8px;border:0;background:none;font:inherit;color:var(--text);text-align:left;cursor:pointer;white-space:nowrap}.check:hover{background:var(--surface-2)}.check .box{width:16px;height:16px;flex:none;border-radius:5px;border:1.5px solid var(--faint);display:grid;place-items:center;font-size:11px;color:#fff}.check.on .box{background:var(--accent);border-color:var(--accent)}.check.blocked{opacity:.4;cursor:not-allowed}.pop-foot{display:flex;align-items:center;justify-content:space-between;gap:.5rem;margin-top:.5rem;padding-top:.5rem;border-top:1px solid var(--line);font-size:.78rem}.linkish{border:0;background:none;padding:0;font:inherit;color:var(--accent);cursor:pointer}.linkish.muted{color:var(--muted)}.linkish:hover{text-decoration:underline}.years{display:flex;gap:.5rem;align-items:center}.years .field{width:86px}.adv-btn{display:inline-flex;align-items:center;gap:.45rem;height:36px;padding:0 .8rem;border-radius:10px;border:1px dashed var(--faint);background:transparent;color:var(--text);cursor:pointer;white-space:nowrap;font-weight:600}.adv-btn:hover{border-style:solid;background:var(--surface-2)}.adv-btn.open{border-style:solid;border-color:var(--accent);color:var(--accent);background:var(--accent-soft)}.adv-body{border-top:1px solid var(--line);padding:1rem 1.2rem 1.1rem;display:grid;grid-template-columns:1.3fr 1fr;gap:1.2rem 2rem;background:color-mix(in srgb,var(--surface-2) 40%,var(--surface));border-radius:0 0 var(--radius) var(--radius)}.adv-col{display:grid;grid-row:span 2;grid-template-rows:subgrid;align-content:start}.adv-body .hint{font-size:.75rem;color:var(--faint);margin-top:.35rem}.round{width:30px;height:30px;flex:none;border-radius:50%;border:1px solid var(--line);background:var(--surface-2);display:grid;place-items:center;cursor:pointer;color:var(--muted)}.round:hover{color:var(--text);background:var(--surface-3)}.toggle.small{font-size:.85rem;gap:.5rem;white-space:nowrap}.toggle.small .switch{width:32px;height:18px}.toggle.small .switch span:after{width:12px;height:12px}.toggle.small .switch input:checked+span:after{transform:translate(14px)}.pill .kind{font-size:.64rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;opacity:.8}.pop-theme{display:grid;gap:.2rem;margin-top:.5rem;padding:.65rem .5rem .15rem;border-top:1px solid var(--line)}.pop-theme .toggle.small{font-size:.875rem;font-weight:600}.chip-strip{position:relative;min-width:140px;display:flex;align-items:center;align-self:stretch;border-left:1px solid var(--line);margin-left:.15rem;padding-left:.6rem}.chip-track{position:relative;flex:1;min-width:0;display:flex;flex-wrap:nowrap;align-items:center;gap:.35rem;overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:none;padding:2px 0;font-size:.8rem}.chip-track::-webkit-scrollbar{display:none}.chip-track>*{flex:none;white-space:nowrap}.chip-track .pill{padding:.22rem .55rem;font-size:.76rem}.chip-more{position:absolute;top:50%;transform:translateY(-50%);z-index:1;display:none;align-items:center;gap:.15rem;height:26px;min-width:26px;padding:0 .35rem;border-radius:999px;border:1px solid var(--line);background:var(--surface-3);color:var(--text);font:inherit;font-size:.72rem;font-weight:700;cursor:pointer;box-shadow:0 2px 8px #00000040}.chip-more:hover{border-color:var(--faint)}.chip-more .caret{opacity:1}.chip-more.l{left:.45rem;justify-content:center}.chip-more.l .caret{transform:rotate(180deg)}.chip-more.r{right:0}.btn .dot-new{width:7px;height:7px;margin-left:.1rem;border-radius:50%;background:#fff}.tagmin-head{display:flex;align-items:baseline;gap:.6rem;font-size:.875rem}.tagmin-head b{font-variant-numeric:tabular-nums;color:var(--muted);font-weight:600}.tagmin.on .tagmin-head b{color:var(--accent)}.tagmin-head .linkish{margin-left:auto;font-size:.75rem}.tagmin input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:6px;margin:.7rem 0 .35rem;border-radius:999px;background:linear-gradient(90deg,var(--accent) var(--p),var(--surface-3) var(--p));cursor:pointer}.tagmin input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:#fff;border:3px solid var(--faint);box-shadow:0 1px 4px #00000059}.tagmin.on input[type=range]::-webkit-slider-thumb{border-color:var(--accent)}.tagmin-ticks{display:flex;justify-content:space-between;font-size:.7rem;color:var(--faint)}.tagmin.idle{opacity:.5}.round.small{width:24px;height:24px;font-size:.7rem}.chip-strip.fade-r .chip-track{mask-image:linear-gradient(90deg,#000 calc(100% - 96px),transparent calc(100% - 52px))}.chip-strip.fade-l .chip-track{mask-image:linear-gradient(90deg,transparent 42px,#000 72px)}.chip-strip.fade-l.fade-r .chip-track{mask-image:linear-gradient(90deg,transparent 42px,#000 72px,#000 calc(100% - 96px),transparent calc(100% - 52px))}.trigger.open .caret,.adv-btn.open .caret{transform:rotate(180deg)}.pop-list{display:grid}.pop-foot.end{justify-content:flex-end}.fx>.fx-row{flex-wrap:nowrap}.fx>.fx-row>*{flex:none}.fx>.fx-row>.chip-strip{flex:1}.chip-strip.fade-l .chip-more.l,.chip-strip.fade-r .chip-more.r{display:inline-flex}@media(max-width:1000px){.fx>.fx-row{flex-wrap:wrap}.fx>.fx-row>.chip-strip{order:10;flex-basis:100%;border-left:0;margin-left:0;padding-left:0}}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:1.2rem}.card{position:relative;cursor:pointer;border-radius:var(--radius)}.card .cv{position:relative;aspect-ratio:2 / 3;border-radius:var(--radius);overflow:hidden;background:var(--surface-2);box-shadow:0 6px 16px #00000040;transition:transform .2s,box-shadow .2s}.card .cv img{width:100%;height:100%;object-fit:cover;display:block}.card:hover .cv{transform:translateY(-4px);box-shadow:0 14px 28px #0006}.card .cv:after{content:"";position:absolute;inset:55% 0 0;background:linear-gradient(transparent,#000000bf)}.rank{position:absolute;top:.55rem;left:.55rem;z-index:1;min-width:30px;height:26px;padding:0 .5rem;display:grid;place-items:center;border-radius:8px;background:#0a0c12c7;backdrop-filter:blur(6px);color:#fff;font-weight:800;font-size:.85rem}.rank.top3{background:linear-gradient(135deg,var(--accent),var(--accent-2))}.score{position:absolute;left:.6rem;bottom:.55rem;z-index:1;display:flex;align-items:center;gap:.3rem;color:#fff;font-weight:700;font-size:.82rem}.score i{width:8px;height:8px;border-radius:50%}.users{position:absolute;right:.6rem;bottom:.58rem;z-index:1;color:#fffc;font-size:.74rem}.nope{position:absolute;top:.5rem;right:.5rem;z-index:2;width:30px;height:30px;border-radius:50%;border:0;background:#0a0c12c7;color:#fff;display:grid;place-items:center;cursor:pointer;opacity:0;transition:opacity .15s}.card:hover .nope{opacity:1}.nope:hover{background:var(--bad)}.card h3{font-size:.92rem;font-weight:700;margin-top:.65rem;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.card .meta{color:var(--muted);font-size:.78rem;margin-top:.2rem}.card .main{color:var(--accent);font-size:.76rem;font-weight:600;margin-top:.15rem}.card .tags{display:flex;gap:.3rem;flex-wrap:wrap;margin-top:.45rem}.card .tags .pill{font-size:.7rem;padding:.12rem .5rem}body.no-ratings .score,body.no-ratings .users,body.no-ratings .ratings{display:none}.scrim{position:fixed;inset:0;background:#000000a8;opacity:0;pointer-events:none;transition:opacity .2s;z-index:30}.scrim.open{opacity:1;pointer-events:auto}.drawer{position:fixed;z-index:31;inset:0;margin:auto;height:fit-content;width:min(920px,94vw);max-height:calc(100vh - 52px);overflow-y:auto;overscroll-behavior:contain;background:var(--surface);border:1px solid var(--line);border-radius:20px;box-shadow:0 30px 80px #00000080;opacity:0;pointer-events:none}.drawer.open{opacity:1;pointer-events:auto;animation:fade .18s ease}html.dialog-open,html.dialog-open body{overflow:hidden}html,body{overscroll-behavior:none}.drawer .close{position:absolute;top:1rem;right:1rem;z-index:2;width:34px;height:34px;border-radius:50%;border:1px solid var(--line);background:var(--surface-2);color:var(--text);cursor:pointer}.dtop{display:grid;grid-template-columns:250px 1fr;gap:1.6rem;padding:1.6rem 1.6rem 1.2rem}.dcover{display:grid;gap:.8rem;align-content:start}.dcover>img{width:100%;aspect-ratio:2 / 3;object-fit:cover;border-radius:14px;box-shadow:var(--shadow)}.dinfo{display:grid;gap:.9rem;align-content:start;padding-right:2rem}.dinfo h2{font-size:1.5rem;font-weight:800;line-height:1.2}.themes{display:flex;gap:.4rem;flex-wrap:wrap}.theme{padding:.25rem .65rem;border-radius:999px;font-size:.78rem;font-weight:600;background:var(--surface-2);color:var(--muted)}.theme.main{background:var(--accent-soft);color:var(--accent)}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:.6rem}.metric{background:var(--surface-2);border-radius:12px;padding:.65rem .8rem}.metric span{font-size:.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;font-weight:600}.metric b{display:block;font-size:1.35rem;font-weight:800}.ratings{display:grid;gap:.4rem}.dist{display:flex;align-items:flex-end;gap:6px;height:90px}.dist span{flex:1;border-radius:5px 5px 0 0;min-height:2px}.dist-axis{display:flex;gap:6px;font-size:.7rem;color:var(--faint)}.dist-axis span{flex:1;text-align:center}.synopsis{color:var(--muted);line-height:1.6}.dfoot{border-top:1px solid var(--line);padding:1.1rem 1.6rem 1.5rem;display:grid;gap:1rem}.actions{display:grid;grid-template-columns:repeat(4,1fr);gap:.6rem}.actions .btn{justify-content:center;height:40px}.dtags .pill.on{background:#f8717124;border-color:var(--bad);color:var(--bad)}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-bottom:1.4rem}.stat{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:1rem 1.1rem}.stat b{display:block;font-size:1.6rem;font-weight:800;margin-top:.15rem}.two{display:grid;grid-template-columns:1fr 1fr;gap:1.2rem}.panel{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:1.2rem}.panel h2{font-size:1rem;margin-bottom:.9rem}.barrow{display:grid;grid-template-columns:130px 1fr 40px;gap:.7rem;align-items:center;padding:.32rem 0;font-size:.85rem}.barrow small{color:var(--faint);margin-left:.3rem;font-size:.7rem}.bar{height:8px;border-radius:999px;background:var(--surface-2);overflow:hidden}.bar i{display:block;height:100%;border-radius:inherit}.profile{display:grid;grid-template-columns:200px 1fr;gap:2rem}.tabs{display:flex;flex-direction:column;gap:.2rem}.tab{padding:.55rem .75rem;border-radius:10px;cursor:pointer;color:var(--muted);font-weight:600}.tab:hover,.tab.on{color:var(--text);background:var(--surface-2)}.pane{display:none;max-width:760px}.pane.on{display:grid;gap:.9rem}.account{display:grid;grid-template-columns:46px 1fr auto;gap:1rem;align-items:center;padding:1rem 1.1rem;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius)}.account.linked{border-color:color-mix(in srgb,var(--accent) 45%,var(--line))}.svc{width:46px;height:46px;border-radius:12px;display:grid;place-items:center;font-weight:800;color:#fff;font-size:.95rem}.account .sub{color:var(--muted);font-size:.8rem}.src{font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--accent);background:var(--accent-soft);padding:.12rem .45rem;border-radius:6px;margin-left:.4rem;vertical-align:2px}.setting{display:flex;align-items:center;gap:1rem;padding:.9rem 1.1rem;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius)}.setting div{flex:1}.setting small{display:block;color:var(--muted);font-size:.8rem}.shell.host-seanime{grid-template-columns:1fr}.shell.host-seanime .side,.page-tabs{display:none}.shell.host-seanime .page-tabs{display:flex;align-items:center;gap:.3rem;margin:-.4rem 0 1.4rem;border-bottom:1px solid var(--line)}.page-tab{padding:.6rem .9rem;color:var(--muted);font-weight:600;cursor:pointer;border:0;border-bottom:2px solid transparent;margin-bottom:-1px;background:none}.page-tab.on{color:var(--text);border-color:var(--accent)}.page-tabs .note{margin-left:auto;font-size:.78rem;color:var(--muted)}.logo{width:30px;height:30px;border-radius:9px;border:2px dashed var(--faint);background:var(--surface-2);box-shadow:none;flex:none}.status{display:flex;align-items:center;gap:.6rem;color:var(--muted);font-size:.85rem;margin-bottom:1rem}.spinner{width:16px;height:16px;border-radius:50%;border:2px solid var(--surface-3);border-top-color:var(--accent);animation:spin .8s linear infinite;flex:none}@keyframes spin{to{transform:rotate(360deg)}}.warn{background:#facc1514;border:1px solid rgba(250,204,21,.3);color:var(--text);border-radius:12px;padding:.6rem .9rem;font-size:.82rem;margin-bottom:1rem}.error{background:#f8717114;border-color:#f8717166}.empty{text-align:center;padding:4rem 1rem;color:var(--muted);display:grid;gap:.8rem;justify-items:center}.empty h2{color:var(--text);font-size:1.2rem}.card .cv .ph{position:absolute;inset:0;display:grid;place-items:center;color:var(--faint);font-size:.8rem}.welcome{min-height:100vh;display:grid;place-items:center;padding:2rem;background:radial-gradient(1000px 500px at 20% 0%,rgba(139,123,255,.18),transparent),radial-gradient(800px 500px at 100% 100%,rgba(255,111,163,.12),transparent)}.welcome form{width:min(480px,100%);background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:2rem;box-shadow:var(--shadow);display:grid;gap:.9rem}.welcome h1{font-size:1.5rem;font-weight:800}.welcome p{margin:0}.synopsis{white-space:pre-line}.pill.btnlike{font:inherit;font-size:.8rem}dialog.drawer{margin:0;padding:0;color:var(--text)}@media(max-width:760px){.shell{grid-template-columns:1fr}.side{display:none}main{padding:1rem}.dtop{grid-template-columns:1fr}.dcover>img{width:160px}.dcover .trailer{max-width:280px}.actions,.metrics,.stats{grid-template-columns:1fr 1fr}.two,.adv-body,.profile{grid-template-columns:1fr}}fieldset.seg{margin:0;min-width:0}button.nav{border:0;background:none;font:inherit;width:100%;text-align:left}button.scrim{border:0;padding:0;cursor:default}button.tab{background:none}button.tab:hover,button.tab.on{background:var(--surface-2)}.actions{grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}@media(max-width:760px){.head .tools{margin-left:0;flex-wrap:wrap}}.overlay{position:fixed;inset:0;z-index:40;display:grid;place-items:center;padding:1.5rem;background:color-mix(in srgb,var(--bg) 55%,transparent);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);animation:fade .2s ease}.overlay-card{width:min(460px,100%);display:grid;justify-items:center;gap:.8rem;text-align:center;padding:1.8rem 1.6rem;background:var(--surface);border:1px solid var(--line);border-radius:20px;box-shadow:var(--shadow)}.overlay-card h2{font-size:1.3rem;font-weight:800;line-height:1.3}.overlay-card p{margin:0}.overlay-note{font-size:.88rem;color:var(--muted);line-height:1.5;padding-top:.3rem;border-top:1px solid var(--line)}.spinner.big{width:34px;height:34px;border-width:3px}.progress{width:100%;height:8px;border-radius:999px;background:var(--surface-3);overflow:hidden}.progress i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--accent),var(--accent-2));transition:width .4s ease}.progress.indeterminate i{width:35%;animation:slide 1.2s ease-in-out infinite}@keyframes slide{0%{transform:translate(-100%)}to{transform:translate(290%)}}.tag-picker{position:relative}.tag-menu{position:absolute;z-index:10;left:0;right:0;top:calc(100% + 4px);max-height:280px;overflow-y:auto;background:var(--surface);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow);padding:.3rem;display:grid}.tag-picker>.tag-menu{top:auto}.tag-menu button{text-align:left;border:0;background:none;padding:.45rem .6rem;border-radius:8px;cursor:pointer;font:inherit;color:var(--text)}.tag-menu button:hover{background:var(--surface-2)}.more{display:flex;justify-content:center;margin:1.6rem 0 .5rem}.more .btn{min-width:180px;justify-content:center}.settings{display:grid;gap:.8rem;max-width:820px}.settings h2.section{font-size:1.05rem;margin:.8rem 0 0}.settings h2.section:first-child{margin-top:0}.card .cv .format{position:absolute;top:.55rem;right:.55rem;z-index:1;height:24px;padding:0 .55rem;display:grid;place-items:center;border-radius:8px;background:#0a0c12c7;backdrop-filter:blur(6px);color:#fff;font-weight:700;font-size:.72rem;letter-spacing:.02em}.card .nope{top:2.35rem}.btn .spinner.small{width:14px;height:14px;border-width:2px;border-color:#ffffff59;border-top-color:#fff}.btn[disabled]{cursor:default}.btn.primary[aria-busy=true]{filter:saturate(.8)}.btn.primary.done{background:var(--surface-2);border-color:var(--line);color:var(--good);box-shadow:none}.btn.site img{border-radius:4px;flex:none}.people-loading{font-size:.85rem}.people-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:.55rem}.person{display:flex;align-items:center;gap:.65rem;padding:.45rem .55rem;background:var(--surface-2);border-radius:12px;min-width:0}.person .who{display:grid;gap:.1rem;min-width:0}.person b{font-size:.85rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.person small{color:var(--muted);font-size:.74rem}.person .va{display:flex;align-items:center;gap:.35rem;color:var(--muted);font-size:.74rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.avatar-img{display:block;flex:none;object-fit:cover;border-radius:8px;background:var(--surface-3)}.avatar-img.round{border-radius:50%}.pill.excluded{color:var(--bad);border-color:color-mix(in srgb,var(--bad) 45%,transparent);background:color-mix(in srgb,var(--bad) 10%,transparent)}.pill.excluded .x{display:inline-block;text-decoration:none}.pill.blocked,.pill.blocked:hover{opacity:.4;cursor:not-allowed;border-color:var(--line)}.driver-popover.tour-popover{background:var(--surface);color:var(--text);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);max-width:340px;padding:1.1rem 1.2rem 1rem;--driver-popover-font-family: inherit}.driver-popover.tour-popover .driver-popover-title{font-size:1.05rem;font-weight:700}.driver-popover.tour-popover .driver-popover-description{color:var(--muted);line-height:1.5}.driver-popover.tour-popover .driver-popover-progress-text{color:var(--faint)}.driver-popover.tour-popover .driver-popover-footer{gap:.5rem;align-items:center}.driver-popover.tour-popover .driver-popover-footer button{font:inherit;font-size:.85rem;text-shadow:none;padding:.35rem .8rem;border-radius:8px;border:1px solid var(--line);background:var(--surface-2);color:var(--text);cursor:pointer}.driver-popover.tour-popover .driver-popover-footer .driver-popover-next-btn{background:var(--accent);border-color:var(--accent);color:#fff}.driver-popover.tour-popover .driver-popover-footer .driver-popover-btn-disabled{opacity:.4;cursor:default}.driver-popover.tour-popover .driver-popover-footer .tour-skip{border-color:transparent;background:none;color:var(--muted)}.driver-popover.tour-popover .driver-popover-arrow-side-left.driver-popover-arrow{border-left-color:var(--surface)}.driver-popover.tour-popover .driver-popover-arrow-side-right.driver-popover-arrow{border-right-color:var(--surface)}.driver-popover.tour-popover .driver-popover-arrow-side-top.driver-popover-arrow{border-top-color:var(--surface)}.driver-popover.tour-popover .driver-popover-arrow-side-bottom.driver-popover-arrow{border-bottom-color:var(--surface)}.trailer{position:relative;display:block;width:100%;aspect-ratio:16 / 9;padding:0;border:1px solid var(--line);border-radius:12px;overflow:hidden;cursor:pointer;background:var(--surface-3) center / cover no-repeat;transition:filter .15s,transform .1s}.trailer:after{content:"";position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.55),transparent 45%)}.trailer:hover{filter:brightness(1.1)}.trailer:active{transform:scale(.99)}.trailer:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.tr-play{position:absolute;z-index:1;left:50%;top:50%;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:#0d0f1499;border:2px solid rgba(255,255,255,.85)}.tr-play:before{content:"";position:absolute;left:16px;top:12px;border-style:solid;border-width:9px 0 9px 14px;border-color:transparent transparent transparent #fff}.trailer:hover .tr-play{background:var(--accent);border-color:var(--accent)}.tr-tag{position:absolute;z-index:1;left:.7rem;bottom:.55rem;color:#fff;font-size:.78rem;font-weight:600;text-shadow:0 1px 3px rgba(0,0,0,.6)}</style>\n  </head>\n  <body>\n    <div id="app"></div>\n  </body>\n</html>\n');
    const api = seanimeApi(ctx);
    let setup = null;
    const h = handlers(api, () => {
      var _a;
      return (_a = setup == null ? void 0 : setup.status()) != null ? _a : { running: false };
    });
    webview.channel.on(REQUEST, (payload) => {
      const reply = answer(h, payload);
      if (reply) webview.channel.send(REPLY, reply);
    });
    try {
      if (typeof ctx.fetch === "function" && typeof ctx.setTimeout === "function") {
        prepareRuntime(ctx.setTimeout);
        setup = backgroundSetup(
          h,
          api,
          gojaTransport(ctx.fetch),
          (fn, ms) => ctx.setTimeout(fn, ms),
          (m) => console.log(`[${LABEL}] ${m}`)
        );
        setup.schedule();
      }
    } catch (e) {
      setup = null;
      console.log(
        `[${LABEL}] background setup unavailable: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }
  return __toCommonJS(plugin_exports);
})();

    __forYou.start(ctx);
  });
}
