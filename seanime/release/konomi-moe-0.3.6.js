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
  var VIEWER = "query { Viewer { id name avatar { medium } } }";
  var MEDIA_DESCRIPTION = "query ($id: Int) { Media(id: $id) { description(asHtml: false) } }";
  var MEDIA_DETAILS = "\nquery ($id: Int) {\n  Media(id: $id) {\n    description(asHtml: false)\n    trailer { id site thumbnail }\n    characters(sort: [ROLE, RELEVANCE, ID], perPage: 12) {\n      edges {\n        role\n        node { id name { full } image { medium } }\n        voiceActors(language: JAPANESE, sort: [RELEVANCE, ID]) { id name { full } image { medium } }\n      }\n    }\n    staff(sort: [RELEVANCE, ID], perPage: 25) {\n      edges { role node { id name { full } image { medium } } }\n    }\n  }\n}\n";
  var SAVE_ENTRY = "\nmutation ($mediaId: Int, $status: MediaListStatus) {\n  SaveMediaListEntry(mediaId: $mediaId, status: $status) { id status }\n}\n";
  var TAG_COLLECTION = "{ MediaTagCollection { name category } }";

  // ../engine/src/crowd.ts
  var CROWD_VERSION = 1;
  var MIN_LIKED = 3;
  var CROWD_CANDIDATES = 60;
  var PAGE = 20;
  function candidatesFor(limit) {
    return Math.max(CROWD_CANDIDATES, Math.ceil(limit * 3 / 4) + 20);
  }
  var ORDER_WEIGHT = 0.5;
  function parseCrowd(buffer) {
    const view = new DataView(buffer);
    const magic = String.fromCharCode(...new Uint8Array(buffer, 0, 4));
    if (magic !== "KCRW") throw new Error("not a crowd table");
    const version = view.getUint32(4, true);
    if (version !== CROWD_VERSION)
      throw new Error(`crowd table version ${version}, expected ${CROWD_VERSION}`);
    const n = view.getUint32(8, true);
    const k = view.getUint32(12, true);
    const freshYear = view.getUint32(16, true);
    let offset = 32;
    const take = (make, bytes) => {
      const arr = make(offset);
      offset += bytes;
      offset += (4 - offset % 4) % 4;
      return arr;
    };
    const ids = take((o) => new Int32Array(buffer, o, n), 4 * n);
    const roots = take((o) => new Int32Array(buffer, o, n), 4 * n);
    const years = take((o) => new Uint16Array(buffer, o, n), 2 * n);
    const flags = take((o) => new Uint8Array(buffer, o, n), n);
    const links = () => ({
      scales: take((o) => new Float32Array(buffer, o, n), 4 * n),
      neighbours: take((o) => new Uint16Array(buffer, o, n * k), 2 * n * k),
      weights: take((o) => new Int16Array(buffer, o, n * k), 2 * n * k)
    });
    const liked = links();
    const signed = links();
    const position = /* @__PURE__ */ new Map();
    ids.forEach((id, p) => {
      position.set(id, p);
    });
    return { ids, roots, years, flags, freshYear, k, liked, signed, position };
  }
  function addRow(into, links, p, k, sign) {
    var _a, _b, _c, _d;
    const scale = (_a = links.scales[p]) != null ? _a : 0;
    for (let s = p * k; s < (p + 1) * k; s++) {
      const w = ((_b = links.weights[s]) != null ? _b : 0) * scale / 32767;
      const j = (_c = links.neighbours[s]) != null ? _c : 0;
      into[j] = ((_d = into[j]) != null ? _d : 0) + sign * w;
    }
  }
  function likedAndDisliked(entries) {
    const scored = entries.filter((e) => e.score > 0).map((e) => [e.mediaId, e.score / 10]);
    if (!scored.length) return { liked: [], disliked: [] };
    let total = 0;
    for (const [, s] of scored) total += s;
    const mean = total / scored.length;
    let squares = 0;
    for (const [, s] of scored) squares += (s - mean) ** 2;
    const spread = (squares / scored.length) ** 0.5;
    return {
      liked: scored.filter(([, s]) => s >= mean).map(([id]) => id),
      disliked: scored.filter(([, s]) => s <= mean - Math.max(1, spread)).map(([id]) => id)
    };
  }
  function crowdPicks(table, entries, count = CROWD_CANDIDATES) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n;
    const { liked, disliked } = likedAndDisliked(entries);
    const positions = (ids) => ids.map((id) => table.position.get(id)).filter((p) => p !== void 0).sort((a, b) => a - b);
    const likedPos = positions(liked).filter((p) => {
      var _a2;
      return (((_a2 = table.flags[p]) != null ? _a2 : 0) & 1) !== 0;
    });
    if (likedPos.length < MIN_LIKED) return null;
    const dislikedPos = positions(disliked);
    const n = table.ids.length;
    const score = new Float64Array(n);
    for (const p of likedPos) addRow(score, table.liked, p, table.k, 1);
    const signed = new Float64Array(n);
    for (const p of likedPos) addRow(signed, table.signed, p, table.k, 1);
    for (const p of dislikedPos) addRow(signed, table.signed, p, table.k, -1);
    const known = [];
    for (let p = 0; p < n; p++) if ((((_a = table.flags[p]) != null ? _a : 0) & 2) !== 0) known.push(p);
    let total = 0;
    for (const p of known) total += (_b = signed[p]) != null ? _b : 0;
    const mean = known.length ? total / known.length : 0;
    let squares = 0;
    for (const p of known) squares += (((_c = signed[p]) != null ? _c : 0) - mean) ** 2;
    const sd = (known.length ? (squares / known.length) ** 0.5 : 0) || 1;
    const order = /* @__PURE__ */ new Map();
    for (const p of known) order.set((_d = table.ids[p]) != null ? _d : 0, (((_e = signed[p]) != null ? _e : 0) - mean) / sd);
    const best = /* @__PURE__ */ new Map();
    for (let p = 0; p < n; p++) {
      const root = (_f = table.roots[p]) != null ? _f : -1;
      if ((((_g = table.flags[p]) != null ? _g : 0) & 1) === 0 || root < 0 || ((_h = table.years[p]) != null ? _h : 0) >= table.freshYear)
        continue;
      const s = (_i = score[p]) != null ? _i : 0;
      const held = best.get(root);
      if (!held || s > held[0]) best.set(root, [s, (_j = table.ids[p]) != null ? _j : 0]);
    }
    const onList = new Set(entries.map((e) => e.mediaId));
    const picks = [...best.entries()].sort((a, b) => b[1][0] - a[1][0] || a[0] - b[0]).filter(([root]) => !onList.has(root)).slice(0, count).map(([root, [s, title]]) => [root, s, title]);
    const because = /* @__PURE__ */ new Map();
    for (const [root, , title] of picks) {
      const target = (_k = table.position.get(title)) != null ? _k : -1;
      let top = null;
      let strongest = 0;
      for (const p of likedPos) {
        const scale = (_l = table.liked.scales[p]) != null ? _l : 0;
        let hit = null;
        for (let s = p * table.k; s < (p + 1) * table.k; s++) {
          if (table.liked.neighbours[s] !== target) continue;
          const w = ((_m = table.liked.weights[s]) != null ? _m : 0) * scale / 32767;
          hit = hit === null ? w : Math.max(hit, w);
        }
        if (hit !== null && hit > strongest) {
          top = (_n = table.ids[p]) != null ? _n : null;
          strongest = hit;
        }
      }
      if (top !== null) because.set(root, top);
    }
    return { picks, order, freshYear: table.freshYear, because };
  }

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
        embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
        thumbnail: thumbnail != null ? thumbnail : `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
      };
    if ((node == null ? void 0 : node.site) === "dailymotion")
      return {
        site: "dailymotion",
        url: `https://www.dailymotion.com/video/${id}`,
        embedUrl: `https://geo.dailymotion.com/player.html?video=${id}`,
        thumbnail
      };
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

  // ../engine/src/preference.ts
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
  var PreferenceModel = class {
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
      if (!this.fit_) throw new Error("PreferenceModel used before fit()");
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
  var MINOR_FORMATS = /* @__PURE__ */ new Set(["SPECIAL", "OVA", "MUSIC"]);
  function isMinor(m) {
    return m.format !== null && MINOR_FORMATS.has(m.format);
  }
  function mainPrequels(media, lookup) {
    if (isMinor(media)) return [...new Set(prequelIds(media))].sort((a, b) => a - b);
    const found = /* @__PURE__ */ new Set();
    const seen = /* @__PURE__ */ new Set([media.id]);
    let frontier = new Set(prequelIds(media));
    for (let i = 0; i < MAX_CHAIN; i++) {
      for (const id of seen) frontier.delete(id);
      if (!frontier.size) break;
      for (const id of frontier) seen.add(id);
      const cached = lookup(frontier);
      const next = /* @__PURE__ */ new Set();
      for (const p of frontier) {
        const m = cached.get(p);
        if (m && isMinor(m)) for (const q of prequelIds(m)) next.add(q);
        else found.add(p);
      }
      frontier = next;
    }
    return [...found].sort((a, b) => a - b);
  }
  function mainSuccessor(media, lookup) {
    if (!isMinor(media)) return null;
    const seen = /* @__PURE__ */ new Set([media.id]);
    let frontier = new Set(sequelIds(media));
    for (let i = 0; i < MAX_CHAIN; i++) {
      for (const id of seen) frontier.delete(id);
      if (!frontier.size) return null;
      for (const id of frontier) seen.add(id);
      const cached = [...lookup(frontier).values()];
      const mains = cached.filter((m) => !isMinor(m)).sort((a, b) => a.id - b.id);
      if (mains[0]) return mains[0];
      frontier = new Set(cached.flatMap((m) => sequelIds(m)));
    }
    return null;
  }
  function unlocked(media, statuses, lookup) {
    const successor = mainSuccessor(media, lookup);
    if (successor && !FINISHED.has(statuses.get(successor.id))) return false;
    return mainPrequels(media, lookup).every((p) => FINISHED.has(statuses.get(p)));
  }
  var HIDDEN_REASONS = ["format:", "decade:"];
  function buildProfile(entries, media, otherEntries = [], otherMedia = /* @__PURE__ */ new Map(), notInterested = []) {
    const own = examples(entries, media);
    if (own.length < MIN_EXAMPLES) {
      throw new NotEnoughHistory(`need at least ${MIN_EXAMPLES} rated titles, got ${own.length}`);
    }
    const listed = new Set([...entries, ...otherEntries].map((e) => e.mediaId));
    const unique = [...new Map(notInterested.map((m) => [m.id, m])).values()];
    const dismissed = unique.filter((m) => !listed.has(m.id)).sort((a, b) => a.id - b.id);
    const model = new PreferenceModel().fit([
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
    var _a, _b, _c, _d, _e;
    const sources = /* @__PURE__ */ new Map();
    const add = (id, source) => {
      var _a2;
      return sources.set(id, [...(_a2 = sources.get(id)) != null ? _a2 : [], source]);
    };
    for (const [root] of (_b = (_a = options.crowd) == null ? void 0 : _a.picks) != null ? _b : []) {
      const by = profile.media.get((_d = (_c = options.crowd) == null ? void 0 : _c.because.get(root)) != null ? _d : -1);
      add(root, by ? `fans of ${by.title} liked this too` : "liked by people with lists like yours");
    }
    const ordered = [...links].sort((a, b) => b[2] - a[2] || a[0] - b[0]);
    for (const [from, to, rating] of ordered) {
      const liked = profile.media.get(from);
      if (rating > 0 && liked && profile.likedIds.has(from)) add(to, `liked ${liked.title}`);
    }
    for (const [id, source] of (_e = options.extra) != null ? _e : [])
      if (source) add(id, source);
      else if (!sources.has(id)) sources.set(id, []);
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
      const successor = mainSuccessor(current, lookup);
      if (successor && !FINISHED.has(statuses.get(successor.id))) {
        if (statuses.has(successor.id) || seen.has(successor.id)) return null;
        current = successor;
        seen.add(current.id);
        continue;
      }
      const prequels = mainPrequels(current, lookup);
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
  function blendScore(profile, m, predicted) {
    var _a;
    const community = (((_a = m.averageScore) != null ? _a : 70) - 70) / 10;
    return predicted + profile.communityWeight * community;
  }
  function rank(profile, sources, media, options = {}) {
    var _a, _b, _c;
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
    const crowdRank = /* @__PURE__ */ new Map();
    (_b = options.crowd) == null ? void 0 : _b.picks.forEach(([root], i) => {
      for (const target of seriesStarts(/* @__PURE__ */ new Map([[root, ["crowd"]]]), statuses, find).keys())
        if (!crowdRank.has(target)) crowdRank.set(target, i);
    });
    const moved = seriesStarts(sources, statuses, find);
    const candidates = [];
    for (const id of moved.keys()) {
      const m = find([id]).get(id);
      if (!m) continue;
      const status = statuses.get(m.id);
      const listedOk = status === void 0 || Boolean(options.includeListed) && UNFINISHED.has(status);
      if (listedOk && (options.includeAdult || !m.isAdult) && unlocked(m, statuses, find) && !(options.exclusions && blocks(options.exclusions, m, lookup)) && (!options.accept || options.accept(m))) {
        candidates.push(m);
      }
    }
    const predicted = profile.model.predict(candidates);
    const ranked = candidates.map((m, i) => {
      var _a2, _b2;
      const spoilers = new Set(m.tags.filter((t) => t.spoiler).map((t) => `tag:${t.name}`));
      const reasons = profile.model.contributions(m).filter(([k, c]) => c > 0 && !spoilers.has(k) && !HIDDEN_REASONS.some((p) => k.startsWith(p))).slice(0, 3).map(([k]) => {
        const at = k.indexOf(":");
        return { kind: k.slice(0, at), value: k.slice(at + 1) };
      });
      return {
        media: m,
        score: blendScore(profile, m, (_a2 = predicted[i]) != null ? _a2 : 0),
        reasons,
        sources: (_b2 = moved.get(m.id)) != null ? _b2 : []
      };
    });
    const limit = (_c = options.limit) != null ? _c : 20;
    if (!options.crowd) return ranked.sort((a, b) => b.score - a.score).slice(0, limit);
    return withCrowd(ranked, options.crowd, crowdRank, limit);
  }
  function withCrowd(ranked, crowd, crowdRank, limit) {
    var _a;
    const preference = new Map(ranked.map((r) => [r.media.id, r.score]));
    for (const r of ranked) r.score += ORDER_WEIGHT * ((_a = crowd.order.get(r.media.id)) != null ? _a : 0);
    const fresh = (r) => {
      var _a2;
      return ((_a2 = r.media.year) != null ? _a2 : 0) >= crowd.freshYear;
    };
    const rankOf = (r) => {
      var _a2;
      return (_a2 = crowdRank.get(r.media.id)) != null ? _a2 : 0;
    };
    const byScore = (a, b) => b.score - a.score || a.media.id - b.media.id;
    const picked = ranked.filter((r) => crowdRank.has(r.media.id) && !fresh(r)).sort((a, b) => rankOf(a) - rankOf(b) || a.media.id - b.media.id);
    const chosen = new Set(picked.map((r) => r.media.id));
    const pref = (r) => {
      var _a2;
      return (_a2 = preference.get(r.media.id)) != null ? _a2 : 0;
    };
    const added = ranked.filter((r) => fresh(r) && !chosen.has(r.media.id)).sort((a, b) => pref(b) - pref(a) || a.media.id - b.media.id);
    for (const r of added) chosen.add(r.media.id);
    const rest = ranked.filter((r) => !chosen.has(r.media.id)).sort(byScore);
    const size = Math.min(PAGE, limit);
    const out = [];
    while (out.length < limit && (picked.length || added.length || rest.length)) {
      const freshPlaces = Math.floor(size / 4);
      const page = [...picked.splice(0, size - freshPlaces), ...added.splice(0, freshPlaces)];
      for (const queue of [rest, picked, added]) page.push(...queue.splice(0, size - page.length));
      out.push(...page.sort(byScore));
    }
    return out.slice(0, limit);
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
    var _a, _b, _c, _d, _e, _f;
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
    const picks = type === "ANIME" && options.crowd ? crowdPicks(options.crowd, entries, candidatesFor(options.limit)) : null;
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
        const since = picks ? (picks.freshYear - 1) * 1e4 + 1231 : 0;
        const freshVariables = {
          ...base,
          startGreater: Math.max(Number((_c = base.startGreater) != null ? _c : 0), since)
        };
        const freshSearches = picks ? [1, 2].map((page) => ({ variables: freshVariables, perPage: 50, page })) : [];
        progress(tagSearches.length ? "Searching AniList by your top tags" : "Searching AniList");
        const first = await discoverMany(online, store, type, [
          ...tagSearches,
          ...freshSearches,
          ...filterSearches.map((variables) => ({ variables, perPage: 50, page: 1 }))
        ]);
        for (const [i, tag] of tags.entries())
          for (const m of (_d = first[i]) != null ? _d : []) extra.push([m.id, `top-scored with ${tag}`]);
        if (picks) {
          const page1 = (_e = first[tags.length]) != null ? _e : [];
          const pages = page1.length < 50 ? [page1] : [page1, (_f = first[tags.length + 1]) != null ? _f : []];
          for (const m of pages.flat()) extra.push([m.id, ""]);
        }
        const forFilters = (found) => {
          for (const m of found) extra.push([m.id, "top-scored for your filters"]);
          return found.filter((m) => filterAccepts(filters, m, themes)).length;
        };
        const more = filterSearches.flatMap((variables, j) => {
          var _a2;
          const found = (_a2 = first[tags.length + freshSearches.length + j]) != null ? _a2 : [];
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
    const sources = candidateSources(profile, links, {
      extra,
      includeListed: !filters.hideListed,
      crowd: picks
    });
    if (picks && online) {
      try {
        await fetchMedia(
          online,
          store,
          picks.picks.map(([root]) => root)
        );
      } catch (e) {
        if (!(e instanceof AniListError)) throw e;
        warnings.push(`some of the crowd's picks skipped: ${e.message}`);
      }
    }
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
      includeListed: !filters.hideListed,
      crowd: picks
    });
    if (online) recs = await fillDetails(online, store, recs, warnings);
    return { recommendations: recs, profile, warnings, crowd: picks !== null };
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
        if (!m) continue;
        for (const p of [...prequelIds(m), ...isMinor(m) ? sequelIds(m) : []])
          if (!seen.has(p)) next.add(p);
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

  // ../engine/src/verdict.ts
  var GOOD_SHARE = 1 / 3;

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
  var RANKING = 3;
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
      __publicField(this, "preferences", /* @__PURE__ */ new Map());
      __publicField(this, "crowd", null);
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
        this.preferences.delete(type);
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
      const saved = raw ? JSON.parse(raw) : null;
      return (saved == null ? void 0 : saved.ranking) === RANKING ? saved : null;
    }
    /** Run the engine and keep up to `pool` picks; `null` when that list isn't synced yet. */
    async recommend(type, progress = () => {
    }, pool = POOL) {
      const s = await this.settings();
      const crowd = type === "ANIME" ? await this.crowdTable() : { table: null };
      let result;
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
            crowd: crowd.table
          }),
          progress
        );
      } catch (e) {
        if (e instanceof NoSyncedList) return null;
        throw e;
      }
      this.preferences.set(type, preferencesOf(result));
      const picks = {
        at: Date.now(),
        recommendations: result.recommendations,
        warnings: crowd.error ? [crowd.error, ...result.warnings] : result.warnings,
        ranking: RANKING
      };
      await this.store.setMeta(`ui-picks:${type}`, JSON.stringify(picks));
      await this.save();
      return picks;
    }
    /** The host's crowd table, fetched and decoded once a session; never fails a run. */
    crowdTable() {
      var _a;
      const load2 = this.host.crowdTable;
      if (!load2) return Promise.resolve({ table: null });
      (_a = this.crowd) != null ? _a : this.crowd = (async () => {
        try {
          return { table: parseCrowd(await load2.call(this.host)) };
        } catch (e) {
          this.crowd = null;
          const why = e instanceof Error ? e.message : String(e);
          return { table: null, error: `picks from other people's lists unavailable: ${why}` };
        }
      })();
      return this.crowd;
    }
    /** What the model learned for a type; runs offline if there's no run yet this session. */
    async preferencesFor(type) {
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
      if (this.saveTimer) clearTimeout(this.saveTimer);
      this.saveTimer = null;
      this.save = async () => {
      };
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
  function preferencesOf(result) {
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
    const showDialog = (title, content) => {
      const modal = ctx.newModal({ title });
      modal.render(() => content(modal));
      modal.open();
    };
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
      showLink: (url, title) => showDialog("Open on AniList", (m) => [
        m.stack(
          [
            m.text(`${title} opens in your browser.`),
            m.flex(
              [
                m.img(ANILIST_ICON_URL, { width: "20", height: "20", alt: "AniList" }),
                m.anchor("Open on AniList", { href: url, target: "_blank" })
              ],
              { gap: 2 }
            )
          ],
          { gap: 3 }
        )
      ]),
      showTrailer: (url, title) => showDialog("Watch the trailer", (m) => [
        m.stack(
          [
            m.text(`${title}'s trailer opens in your browser.`),
            m.anchor(url.includes("dailymotion") ? "Watch on Dailymotion" : "Watch on YouTube", {
              href: url,
              target: "_blank"
            })
          ],
          { gap: 3 }
        )
      ])
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
    webview.setContent(() => '<!doctype html>\n<html lang="en" data-theme="dark">\n  <head>\n    <meta charset="utf-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1" />\n    <title>For you</title>\n    <script type="module" crossorigin>(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const s of document.querySelectorAll(\'link[rel="modulepreload"]\'))i(s);new MutationObserver(s=>{for(const o of s)if(o.type==="childList")for(const r of o.addedNodes)r.tagName==="LINK"&&r.rel==="modulepreload"&&i(r)}).observe(document,{childList:!0,subtree:!0});function n(s){const o={};return s.integrity&&(o.integrity=s.integrity),s.referrerPolicy&&(o.referrerPolicy=s.referrerPolicy),s.crossOrigin==="use-credentials"?o.credentials="include":s.crossOrigin==="anonymous"?o.credentials="omit":o.credentials="same-origin",o}function i(s){if(s.ep)return;s.ep=!0;const o=n(s);fetch(s.href,o)}})();var P,Vi,ne,Yt,it,Qi,Ke,Yi,An,Jt,kt=Symbol.for("pv"),st={},ot=[],$o=/^m(i|n|o|s|text|space)$/,kn=Array.isArray,Ji=ot.slice,ce=Object.assign;function le(e){e&&e.parentNode&&e.remove()}function Xe(e,t,n,i,s){var o={type:e,props:t,key:n,ref:i,__k:null,__:null,__b:0,__e:null,__c:null,constructor:kt,__v:s||++Vi,__i:-1,__u:0};return!s&&P.vnode&&P.vnode(o),o}function F(e){return e.children}function Ze(e,t){this.props=e,this.context=t,this.__g=0}function se(e,t){if(t==null)return e.__&&se(e.__,e.__i+1);for(var n;t<e.__k.length;t++)if((n=e.__k[t])&&n.__e)return n.__e;return typeof e.type!="function"||e.props.__P?null:se(e)}function jo(e){var t,n=e.__v,i=n.__e,s=[],o=[],r=e.__P;r&&((t=ce({constructor:kt},n)).__v=n.__v+1,P.vnode&&P.vnode(t),Sn(r,t,n,e.__n,r.namespaceURI,32&n.__u?[i]:null,s,i||se(n),32&n.__u,o),t.__v=n.__v,t.__.__k[t.__i]=t,ns(s,t,o),n.__=n.__e=null,t.__e!=i&&Ki(t))}function Ki(e){if((e=e.__)&&e.__c&&!e.props.__P)return e.__e=null,e.__k.some(function(t){return t&&(e.__e=t.__e)}),Ki(e)}function Kn(e){(8&e.__g||(e.__g|=8,ne.push(e),it++))&&Yt==P.debounceRendering||((Yt=P.debounceRendering)||queueMicrotask)(Xi)}function Xi(){try{for(var e,t=1;ne.length;)ne.length>t&&ne.sort(Qi),e=ne.shift(),t=ne.length,8&e.__g&&jo(e)}finally{(it=ne.length)&&(Yt||queueMicrotask)(Xi)}}function Zi(e,t,n,i,s,o,r,a,c,h,u){var p,v,d,m,g,f,w=i.__k||ot,_=t.length;for(c=zo(n,t,w,c,_),p=0;p<_;p++)(d=n.__k[p])!=null&&(v=~d.__i&&w[d.__i]||st,d.__i=p,f=Sn(e,d,v,s,o,r,a,c,h,u),m=d.__e,(v.ref!=d.ref||8&v.__u)&&(v.ref&&En(v.ref,null,d,v),d.ref&&u.push(d.ref,d.__c||m,d)),g=g||m,4&d.__u?(c=es(d,c,e,!v.__v),v.__e&&(v.__e=null)):typeof d.type=="function"&&f!==void 0?c=f:m&&(c=m.nextSibling),d.__u&=-21);return n.__e=g,c}function zo(e,t,n,i,s){var o,r,a,c,h,u,p,v,d,m=n.length,g=m,f=0,w=0,_=e.__k=Array(s);for(o=0;o<s;o++)(r=t[o])!=null&&typeof r!="boolean"&&typeof r!="function"?(typeof r!="object"||r.constructor===String?r=_[o]=Xe(null,r):kn(r)?r=_[o]=Xe(F,{children:r}):r.constructor===kt&&r.__b?r=_[o]=Xe(r.type,r.props,r.key,r.ref,r.__v):_[o]=r,c=o+f,r.__=e,r.__b=e.__b+1,a=null,~(h=r.__i=Uo(r,n,c,g))&&(g--,(a=n[h])&&(a.__u|=2)),a&&a.__v?(r.__u|=16,h==c-1?f--:h==c+1?f++:h!=c&&(h>c?f--:f++,w=1)):(~h||(s>m?f--:s<m&&f++),typeof r.type!="function"&&(r.__u|=4))):_[o]=null;if(w){for(u=[],p=[],o=0;o<s;o++)if((r=_[o])&&16&r.__u){for(f=0,v=u.length;f<v;)u[d=f+v>>1]<r.__i?f=d+1:v=d;u[f]=r.__i,p[o]=f+1}for(f=u.length;o--;)p[o]&&(p[o]==f?f--:_[o].__u|=4)}if(g)for(o=0;o<m;o++)!(a=n[o])||2&a.__u||(a.__e==i&&(i=se(a)),Mn(a,a));return i}function es(e,t,n,i){var s,o,r,a;if(typeof e.type=="function"){if(e.props.__P)return t;if(s=e.__k)for(o=0;o<s.length;o++)s[o]&&(s[o].__=e,t=es(s[o],t,n,!1));return t}for(t&&!t.parentNode&&(t=se(e))&&!t.parentNode&&(t=null),r=e.__e,a=t;a&&a.nodeType==8;)a=a.nextSibling;for(r!=a&&(!i&&n.moveBefore&&r.parentNode?n.moveBefore(r,t):n.insertBefore(r,t||null)),t=r;(t=t&&t.nextSibling)&&t.nodeType==8&&!t.data.startsWith("$s"););return t}function Uo(e,t,n,i){var s,o=e.key,r=e.type,a=t[n],c=a&&!(2&a.__u);if(a===null&&o==null||c&&o==a.key&&r==a.type)return n;if(i>(c?1:0)){for(s=n-1;s>=0;s--)if((a=t[s])&&!(2&a.__u)&&o==a.key&&r==a.type)return s;for(s=n+1;s<t.length;s++)if((a=t[s])&&!(2&a.__u)&&o==a.key&&r==a.type)return s}return-1}function Xn(e,t,n){n==null&&(n=""),t[0]=="-"?e.setProperty(t,n):e[t]=n}function He(e,t,n,i,s){var o,r;if(t=="style")if(typeof n=="string")e.style.cssText=n;else{if(typeof i=="string"&&(e.style.cssText=i=""),i)for(t in i)n&&t in n||Xn(e.style,t);if(n)for(t in n)i&&n[t]==i[t]||Xn(e.style,t,n[t])}else if(t[0]=="o"&&t[1]=="n")typeof n!="function"&&(n=null),typeof i!="function"&&(i=null),(e.__e||(e.__e={}))[t]=n,n&&i||(r=Jt[t]||(Jt[t]=Wo(t)),(e.__a||(e.__a={}))[t]=An,o=t!=(t=t.replace(Yi,"$1")),(t=t.slice(2))[0]<"a"&&(t=t.toLowerCase()),n?e.addEventListener(t,r,o):e.removeEventListener(t,r,o));else{if(s=="http://www.w3.org/2000/svg")t=t.replace(/xlink(H|:h)/,"h").replace(/sName$/,"s");else if(t!="width"&&t!="height"&&t!="href"&&t!="list"&&t!="form"&&t!="tabIndex"&&t!="download"&&t!="rowSpan"&&t!="colSpan"&&t!="role"&&t!="popover"&&t in e)try{return void(e[t]=n??"")}catch{}if(typeof n=="function")return;n==null||n===!1&&t[4]!="-"?e.removeAttribute(t):e.setAttribute(t,t=="popover"&&n==1?"":n)}}function Wo(e){return function(t){var n=this.__e;if(n){if(n=n[e],t[Ke]==null)t[Ke]=An++;else if(t[Ke]<this.__a[e])return;return n(P.event?P.event(t):t)}}}function Sn(e,t,n,i,s,o,r,a,c,h){var u,p,v,d,m,g,f,w,_,k,E,y,S,b,M,O,L,T,A=t.type;if(t.constructor!==kt)return null;128&n.__u&&(c=32&n.__u,u=n.__c.__z)&&(t.__u|=c,p=o=[],u.nodeType==8?a=et(u,o):o.push(u),a=o[0]||a),(u=P.__b)&&u(t);e:if(typeof A=="function"){v=r.length;try{if(w=t.props,_=(u=A.prototype)&&u.render,k=(u=A.contextType)&&i[u.__c],E=u?k?k.props.value:u.__:i,(d=n.__c)?(t.__c=d,2&d.__g&&(d.__g|=1)):(_?t.__c=d=new A(w,E):(t.__c=d=new Ze(w,E),d.constructor=A,d.render=qo),k&&k.sub(d),d.state||(d.state={}),d.__n=i,d.__g|=8,d.__h=[],d.__k=[]),_&&(d.__s||(d.__s=d.state),A.getDerivedStateFromProps&&(d.__s==d.state&&(d.__s=ce({},d.__s)),ce(d.__s,A.getDerivedStateFromProps(w,d.__s)))),m=d.props,g=d.state,d.__v=t,n.__c){if(w!==m&&_&&!A.getDerivedStateFromProps&&d.componentWillReceiveProps&&d.componentWillReceiveProps(w,E),t.__v==n.__v&&!(8&d.__g)||!(4&d.__g)&&d.shouldComponentUpdate&&d.shouldComponentUpdate(w,d.__s,E)===!1){t.__v!=n.__v&&(d.props=w,d.state=d.__s,d.__g&=-9),t.__e=n.__e,t.__k=n.__k,t.__k.some(function(N){N&&(N.__=t)}),ot.push.apply(d.__h,d.__k),d.__k=[],d.__h.length&&r.push(d),a=se(n);break e}d.componentWillUpdate&&d.componentWillUpdate(w,d.__s,E),_&&d.componentDidUpdate&&d.__h.push(function(){d.componentDidUpdate(m,g,f)})}else _&&!A.getDerivedStateFromProps&&d.componentWillMount&&d.componentWillMount(),_&&d.componentDidMount&&d.__h.push(d.componentDidMount);d.context=E,d.props=w,d.__P=e,d.__g&=-5,y=P.__r,S=_?25:0;do d.__g&=-9,y&&y(t),u=d.render(d.props,d.state=d.__s,d.context);while(8&d.__g&&++S<25);_&&(ot.push.apply(d.__h,d.__k),d.__k=[]),d.state=d.__s,d.getChildContext&&(i=ce({},i,d.getChildContext())),_&&n.__c&&d.getSnapshotBeforeUpdate&&(f=d.getSnapshotBeforeUpdate(m,g)),b=u&&u.type===F&&u.key==null?u.props.children:u,w.__P&&(u=a,s=(e=w.__P).namespaceURI,c=o=null,n.props&&n.props.__P!=e&&(n.__k.some(function(N){N&&Mn(N,N)}),n.__k=null),a=n.__k?se(n,0):null),a=Zi(e,kn(b)?b:[b],t,n,i,s,o,r,a,c,h),w.__P&&(t.__e=null,a=u),t.__u&=-161,p&&p.some(le),d.__h.length&&r.push(d),1&d.__g&&(d.__g&=-4)}catch(N){if(r.length=v,t.__v=null,c||o)if(N&&N.then){if(t.__u|=128|c,o){for(~(L=o.indexOf(a||void 0))||(L=o.length);(T=o[L-1])&&T.nodeType==8;)L--;for(;L<o.length;L++)if(T=o[L])if(o[L]=null,M){if(T==O)break}else{if(T.nodeType!=8)break;T.data.startsWith("$s")&&(O=et(M=T))}}if(!M){for(;a&&a.nodeType==8&&a.nextSibling;)a=a.nextSibling;M=a}(u=et(M=t.__c.__z||(t.__c.__z=M)))?(t.__e=M,a=u):t.__e=a,a=a&&a.nextSibling}else o&&o.some(le);else t.__e=n.__e;t.__k||(t.__k=n.__k||[]),N&&N.then||ts(t),P.__e(N,t,n)}}else a=t.__e=Ho(n.__e,t,n,i,s,o,r,c,h,e);return(u=P.diffed)&&u(t),a}function et(e,t){if(e&&e.nodeType==8&&e.data.startsWith("$s"))for(var n=1;e=e.nextSibling;){if(e.nodeType==8){if(e.data.startsWith("$s"))n++;else if(e.data.startsWith("/$s")&&!--n)return e}t&&t.push(e)}}function ts(e){e&&(e.__c&&(e.__c.__g|=4),e.__k&&e.__k.some(ts))}function ns(e,t,n){for(var i=0;i<n.length;)En(n[i++],n[i++],n[i++]);P.__c&&P.__c(t,e),e.some(function(s){try{e=s.__h,s.__h=[],e.some(function(o){o.call(s)})}catch(o){P.__e(o,s.__v)}})}function Ho(e,t,n,i,s,o,r,a,c,h){var u,p,v,d,m,g,f,w,_=n.props||st,k=t.props,E=t.type;if(E=="svg"?s="http://www.w3.org/2000/svg":E=="math"?s="http://www.w3.org/1998/Math/MathML":s||(s="http://www.w3.org/1999/xhtml"),o){for(u=0;u<o.length;u++)if((m=o[u])&&(E?m.localName==E:m.nodeType==3)){e=m,o[u]=null;break}}if(!e){if(w=h.ownerDocument||document,!E)return w.createTextNode(k);e=w.createElementNS(s,E,k.is?k:h),a&&(P.__m&&P.__m(t,o),a=!1),o=null}if(E){if(h=E=="template"&&e.content||e,o=E=="textarea"&&k.defaultValue!=null?null:o&&Ji.call(h.childNodes),!a&&o)for(_={},u=0;u<e.attributes.length;u++)_[(m=e.attributes[u]).name]=m.value;for(u in _)m=_[u],u=="dangerouslySetInnerHTML"?v=m:u=="children"||u in k||u=="value"&&"defaultValue"in k||u=="checked"&&"defaultChecked"in k||He(e,u,null,m,s);for(u in k)m=k[u],u=="children"?d=m:u=="dangerouslySetInnerHTML"?p=m:u=="value"?g=m:u=="checked"?f=m:a&&typeof m!="function"||_[u]===m||He(e,u,m,_[u],s);p?(a||v&&(p.__html==v.__html||p.__html==e.innerHTML)||(e.innerHTML=p.__html),t.__k=[]):(v&&(e.textContent=""),(E=="foreignObject"||s=="http://www.w3.org/1998/Math/MathML"&&$o.test(E))&&(s="http://www.w3.org/1999/xhtml"),Zi(h,kn(d)?d:[d],t,n,i,s,o,r,o?o[0]:n.__k&&se(n,0),a,c),o&&o.some(le)),a&&E!="textarea"||(u="value",E=="progress"&&g==null?e.removeAttribute(u):g==null||g===e[u]&&(E!="progress"||g)||He(e,u,g,_[u],s),u="checked",f!=null&&f!=e[u]&&He(e,u,f,_[u],s))}else _===k||a&&e.data==k||(e.data=k);return e}function En(e,t,n,i){try{typeof e=="function"?t?t.__x=e(t)||1:i&&(i=i.__c||i.__e)&&(t=i.__x)&&(i.__x=null,typeof t=="function"?t():e(null)):e.current=t}catch(s){P.__e(s,n)}}function Mn(e,t,n){var i,s,o,r;if(P.unmount&&P.unmount(e),!(i=e.ref)||i.current&&i.current!=e.__e||En(i,null,t,e),i=e.__c){if(i.componentWillUnmount)try{i.componentWillUnmount()}catch(a){P.__e(a,t)}i.__P=i.__n=null}if(i=e.__k)for(r=0;r<i.length;r++)i[r]&&Mn(i[r],t,typeof e.type!="function"||n&&!e.props.__P);!n&&(i=e.__c)&&(i=i.__z)&&(s=et(i,o=[]))&&(i==e.__e&&o.some(le),le(s),le(i)),n||le(e.__e),e.__e=e.__c=e.__=null}function qo(e,t,n){return this.constructor(e,n)}function Go(e,t){var n,i,s,o;P.__&&P.__(e,t),t.nodeType==9&&(t=t.documentElement),i=(n=e&&32&e.__u)?null:t.__k,t.__k=Xe(F,{children:[e]}),s=[],o=[],Sn(t,t.__k,i||st,st,t.namespaceURI,i?null:t.firstChild?Ji.call(t.childNodes):null,s,i?i.__e:t.firstChild,n,o),ns(s,t.__k,o),t.__k.props.children=null}P={__e:function(e,t,n,i){for(var s,o,r;t=t.__;)if((s=t.__c)&&!(1&s.__g)){s.__g|=4;try{if((r=(o=s.constructor)&&o.getDerivedStateFromError)&&s.setState(o.getDerivedStateFromError(e)),s.componentDidCatch&&(s.componentDidCatch(e,i||{}),r=1),r&&8&s.__g)return void(s.__g|=2)}catch(a){e=a}}throw it=0,e}},Vi=0,Ze.prototype.setState=function(e,t){var n=this.__s;n&&n!=this.state||(n=this.__s=ce({},this.state)),typeof e=="function"&&(e=e(ce({},n),this.props)),e&&(ce(n,e),this.__v&&(t&&this.__k.push(t),Kn(this)))},Ze.prototype.forceUpdate=function(e){this.__v&&(this.__g|=4,e&&this.__h.push(e),Kn(this))},Ze.prototype.render=F,ne=[],it=0,Qi=function(e,t){return e.__v.__b-t.__v.__b},Ke=Symbol(),Yi=/(PointerCapture)$|Capture$/i,An=0,Jt={};var Vo=Symbol.for("pv"),Qo=0;function l(e,t,n,i,s,o){t||(t={});var r,a,c=t;if("ref"in c&&typeof e!="function")for(a in c={},t)a=="ref"?r=t[a]:c[a]=t[a];var h={type:e,props:c,key:n,ref:r,__k:null,__:null,__b:0,__e:null,__c:null,constructor:Vo,__v:--Qo,__i:-1,__u:0};return P.vnode&&P.vnode(h),h}const is=10,Zn=new Map;function Yo(e,t){const n=`${t}\\0${e}`,i=Zn.get(n);if(i)return i;const s=e.indexOf("query (");if(s<0)throw new Error("only queries with declared variables can be batched");const o=s+7,r=ei(e,o-1,"(",")"),a=e.indexOf("{",r),c=ei(e,a,"{","}"),h=e.slice(o,r).trim(),u=e.slice(a+1,c).trim(),p=e.slice(c+1),v=(g,f)=>g.replace(/\\$(\\w+)/g,`$$$1_${f}`),d=Array.from({length:t},(g,f)=>f),m=`\nquery (${d.map(g=>v(h,g)).join(", ")}) {\n${d.map(g=>`  q${g}: ${v(u,g)}`).join(`\n`)}\n}${p}`;return Zn.set(n,m),m}function Jo(e){const t={};return e.forEach((n,i)=>{for(const[s,o]of Object.entries(n))t[`${s}_${i}`]=o}),t}function Kt(e,t){const n=[];for(let i=0;i<e.length;i+=t)n.push(e.slice(i,i+t));return n}function ei(e,t,n,i){let s=0;for(let o=t;o<e.length;o++)if(e[o]===n)s++;else if(e[o]===i&&--s===0)return o;throw new Error(`unbalanced ${n}${i} in query`)}const Ko="https://graphql.anilist.co";class K extends Error{status;constructor(t,n=null){super(t),this.name="AniListError",this.status=n}}function Xo(e={}){const t=e.fetch??fetch,n={Accept:"application/json","Content-Type":"application/json"};return e.token&&(n.Authorization=`Bearer ${e.token}`),async i=>{const s=await t(e.url??Ko,{method:"POST",headers:n,body:JSON.stringify(i)});return{status:s.status,header:o=>s.headers.get(o),json:()=>s.json()}}}class Zo{transport;interval;maxRetries;sleep;now;epochSeconds;nextAllowed=0;blockedUntil=0;constructor(t,n={}){this.transport=t,this.interval=6e4/(n.requestsPerMinute??30),this.maxRetries=n.maxRetries??5,this.sleep=n.sleep??(i=>new Promise(s=>setTimeout(s,i))),this.now=n.now??(()=>performance.now()),this.epochSeconds=n.epochSeconds??(()=>Date.now()/1e3)}async query(t,n={}){for(let i=0;;i++){const s=i===this.maxRetries;await this.waitTurn();let o;try{o=await this.transport({query:t,variables:n})}catch(a){if(s)throw new K(`could not reach AniList: ${String(a)}`);this.backOff(2**i*1e3);continue}if(o.status===429||o.status>=500){if(s)throw new K(`AniList returned ${o.status}`,o.status);this.backOff(tr(o)??2**i*1e3);continue}this.respectRemaining(o);const r=await o.json();if(r.errors?.length){const a=r.errors.map(c=>c.message??"unknown error").join("; ");throw new K(a,o.status)}if(o.status!==200||r.data===void 0)throw new K(`AniList returned ${o.status}`,o.status);return r.data}}async queryMany(t,n){if(n.length===0)return[];if(n.length===1)return[await this.query(t,n[0])];const i=await this.query(Yo(t,n.length),Jo(n)),s=er(t);return n.map((o,r)=>({[s]:i[`q${r}`]}))}async waitTurn(){const t=this.now(),n=Math.max(t,this.nextAllowed,this.blockedUntil);this.nextAllowed=n+this.interval,n>t&&await this.sleep(n-t);for(let i=this.now();i<this.blockedUntil;i=this.now())await this.sleep(this.blockedUntil-i)}backOff(t){this.blockedUntil=Math.max(this.blockedUntil,this.now()+t),this.nextAllowed=Math.max(this.nextAllowed,this.blockedUntil)}respectRemaining(t){const n=t.header("X-RateLimit-Remaining"),i=Number(t.header("X-RateLimit-Reset"));n==="0"&&Number.isFinite(i)&&i>0&&this.backOff(Math.max(0,i-this.epochSeconds())*1e3)}}function er(e){const t=e.indexOf("{",e.indexOf(")")),n=/^\\s*(\\w+)/.exec(e.slice(t+1));if(!n?.[1])throw new Error("query has no root field");return n[1]}function tr(e){const t=Number(e.header("Retry-After"));return e.header("Retry-After")!==null&&Number.isFinite(t)?t*1e3:null}function St(e){const t=e.title??{},n=e.stats?.scoreDistribution??[];return{id:e.id,type:e.type,title:t.english||t.romaji||`#${e.id}`,format:e.format??null,status:e.status??null,isAdult:!!e.isAdult,year:e.startDate?.year??null,episodes:e.episodes??null,chapters:e.chapters??null,averageScore:e.averageScore??null,meanScore:e.meanScore??null,popularity:e.popularity??null,favourites:e.favourites??null,scoreDistribution:n.map(i=>[i.score,i.amount]).sort((i,s)=>i[0]-s[0]||i[1]-s[1]),siteUrl:e.siteUrl??null,coverUrl:e.coverImage?.large??null,genres:[...e.genres??[]],tags:(e.tags??[]).map(i=>({name:i.name,rank:i.rank??0,spoiler:!!i.isMediaSpoiler})),studios:(e.studios?.nodes??[]).map(i=>i.name),relations:(e.relations?.edges??[]).flatMap(i=>i.node?[{relationType:i.relationType,mediaId:i.node.id,mediaType:i.node.type??null}]:[]),titles:{romaji:t.romaji??null,english:t.english??null,native:t.native??null},country:e.countryOfOrigin??null}}function ss(e){return(e.recommendations?.nodes??[]).flatMap(t=>t.mediaRecommendation?[[t.mediaRecommendation.id,t.rating??0]]:[])}function nr(e){const t=e.MediaListCollection??{},n={entries:[],media:[],recommendations:new Map,customLists:new Map,hasNext:!!t.hasNextChunk},i=new Set;for(const s of t.lists??[]){const o=s.entries??[];if(s.isCustomList){const r=s.name??"",a=n.customLists.get(r)??new Set;for(const c of o)a.add(c.media.id);n.customLists.set(r,a)}for(const r of o){const a=r.media;i.has(a.id)||(i.add(a.id),n.entries.push({mediaId:a.id,status:r.status,score:Math.trunc(r.score??0),progress:r.progress??0,repeat:r.repeat??0,updatedAt:r.updatedAt??0}),n.media.push(St(a)),n.recommendations.set(a.id,ss(a)))}}return n}const ir=`\nquery ($userName: String, $type: MediaType, $chunk: Int, $perChunk: Int) {\n  MediaListCollection(userName: $userName, type: $type, chunk: $chunk, perChunk: $perChunk) {\n    hasNextChunk\n    lists {\n      name\n      isCustomList\n      entries {\n        status\n        score(format: POINT_100)\n        progress\n        repeat\n        updatedAt\n        media {\n          ...MediaFields\n          recommendations(perPage: 10, sort: RATING_DESC) {\n            nodes { rating mediaRecommendation { id } }\n          }\n        }\n      }\n    }\n  }\n}\n\nfragment MediaFields on Media {\n  id\n  type\n  format\n  status\n  isAdult\n  siteUrl\n  title { romaji english native }\n  countryOfOrigin\n  coverImage { large }\n  episodes\n  chapters\n  startDate { year }\n  averageScore\n  meanScore\n  popularity\n  favourites\n  stats { scoreDistribution { score amount } }\n  genres\n  tags { name rank isMediaSpoiler }\n  studios(isMain: true) { nodes { name } }\n  relations { edges { relationType node { id type } } }\n}\n`,sr=`\nquery ($ids: [Int], $page: Int, $perPage: Int) {\n  Page(page: $page, perPage: $perPage) {\n    pageInfo { hasNextPage }\n    media(id_in: $ids) { ...MediaFields }\n  }\n}\n\nfragment MediaFields on Media {\n  id\n  type\n  format\n  status\n  isAdult\n  siteUrl\n  title { romaji english native }\n  countryOfOrigin\n  coverImage { large }\n  episodes\n  chapters\n  startDate { year }\n  averageScore\n  meanScore\n  popularity\n  favourites\n  stats { scoreDistribution { score amount } }\n  genres\n  tags { name rank isMediaSpoiler }\n  studios(isMain: true) { nodes { name } }\n  relations { edges { relationType node { id type } } }\n}\n`,or=`\nquery ($ids: [Int], $page: Int, $perPage: Int) {\n  Page(page: $page, perPage: $perPage) {\n    pageInfo { hasNextPage }\n    media(id_in: $ids) {\n      ...MediaFields\n      recommendations(perPage: 10, sort: RATING_DESC) {\n        nodes { rating mediaRecommendation { id } }\n      }\n    }\n  }\n}\n\nfragment MediaFields on Media {\n  id\n  type\n  format\n  status\n  isAdult\n  siteUrl\n  title { romaji english native }\n  countryOfOrigin\n  coverImage { large }\n  episodes\n  chapters\n  startDate { year }\n  averageScore\n  meanScore\n  popularity\n  favourites\n  stats { scoreDistribution { score amount } }\n  genres\n  tags { name rank isMediaSpoiler }\n  studios(isMain: true) { nodes { name } }\n  relations { edges { relationType node { id type } } }\n}\n`,rr=`\nquery (\n  $type: MediaType\n  $page: Int\n  $perPage: Int\n  $genreIn: [String]\n  $tagIn: [String]\n  $minimumTagRank: Int\n  $tagNotIn: [String]\n  $genreNotIn: [String]\n  $idNotIn: [Int]\n  $formatIn: [MediaFormat]\n  $startGreater: FuzzyDateInt\n  $startLesser: FuzzyDateInt\n  $statusIn: [MediaStatus]\n  $countryOfOrigin: CountryCode\n  $averageScoreGreater: Int\n) {\n  Page(page: $page, perPage: $perPage) {\n    media(\n      type: $type\n      genre_in: $genreIn\n      tag_in: $tagIn\n      minimumTagRank: $minimumTagRank\n      tag_not_in: $tagNotIn\n      genre_not_in: $genreNotIn\n      id_not_in: $idNotIn\n      format_in: $formatIn\n      startDate_greater: $startGreater\n      startDate_lesser: $startLesser\n      status_in: $statusIn\n      countryOfOrigin: $countryOfOrigin\n      averageScore_greater: $averageScoreGreater\n      isAdult: false\n      sort: SCORE_DESC\n    ) { ...MediaFields }\n  }\n}\n\nfragment MediaFields on Media {\n  id\n  type\n  format\n  status\n  isAdult\n  siteUrl\n  title { romaji english native }\n  countryOfOrigin\n  coverImage { large }\n  episodes\n  chapters\n  startDate { year }\n  averageScore\n  meanScore\n  popularity\n  favourites\n  stats { scoreDistribution { score amount } }\n  genres\n  tags { name rank isMediaSpoiler }\n  studios(isMain: true) { nodes { name } }\n  relations { edges { relationType node { id type } } }\n}\n`,ar=`\nquery ($id: Int) {\n  Media(id: $id) {\n    description(asHtml: false)\n    trailer { id site thumbnail }\n    characters(sort: [ROLE, RELEVANCE, ID], perPage: 12) {\n      edges {\n        role\n        node { id name { full } image { medium } }\n        voiceActors(language: JAPANESE, sort: [RELEVANCE, ID]) { id name { full } image { medium } }\n      }\n    }\n    staff(sort: [RELEVANCE, ID], perPage: 25) {\n      edges { role node { id name { full } image { medium } } }\n    }\n  }\n}\n`,lr="{ MediaTagCollection { name category } }",ti=1,cr=3,os=60,dr=20;function ur(e){return Math.max(os,Math.ceil(e*3/4)+20)}const fr=.5;function hr(e){const t=new DataView(e);if(String.fromCharCode(...new Uint8Array(e,0,4))!=="KCRW")throw new Error("not a crowd table");const i=t.getUint32(4,!0);if(i!==ti)throw new Error(`crowd table version ${i}, expected ${ti}`);const s=t.getUint32(8,!0),o=t.getUint32(12,!0),r=t.getUint32(16,!0);let a=32;const c=(w,_)=>{const k=w(a);return a+=_,a+=(4-a%4)%4,k},h=c(w=>new Int32Array(e,w,s),4*s),u=c(w=>new Int32Array(e,w,s),4*s),p=c(w=>new Uint16Array(e,w,s),2*s),v=c(w=>new Uint8Array(e,w,s),s),d=()=>({scales:c(w=>new Float32Array(e,w,s),4*s),neighbours:c(w=>new Uint16Array(e,w,s*o),2*s*o),weights:c(w=>new Int16Array(e,w,s*o),2*s*o)}),m=d(),g=d(),f=new Map;return h.forEach((w,_)=>{f.set(w,_)}),{ids:h,roots:u,years:p,flags:v,freshYear:r,k:o,liked:m,signed:g,position:f}}function Pt(e,t,n,i,s){const o=t.scales[n]??0;for(let r=n*i;r<(n+1)*i;r++){const a=(t.weights[r]??0)*o/32767,c=t.neighbours[r]??0;e[c]=(e[c]??0)+s*a}}function pr(e){const t=e.filter(r=>r.score>0).map(r=>[r.mediaId,r.score/10]);if(!t.length)return{liked:[],disliked:[]};let n=0;for(const[,r]of t)n+=r;const i=n/t.length;let s=0;for(const[,r]of t)s+=(r-i)**2;const o=(s/t.length)**.5;return{liked:t.filter(([,r])=>r>=i).map(([r])=>r),disliked:t.filter(([,r])=>r<=i-Math.max(1,o)).map(([r])=>r)}}function mr(e,t,n=os){const{liked:i,disliked:s}=pr(t),o=y=>y.map(S=>e.position.get(S)).filter(S=>S!==void 0).sort((S,b)=>S-b),r=o(i).filter(y=>((e.flags[y]??0)&1)!==0);if(r.length<cr)return null;const a=o(s),c=e.ids.length,h=new Float64Array(c);for(const y of r)Pt(h,e.liked,y,e.k,1);const u=new Float64Array(c);for(const y of r)Pt(u,e.signed,y,e.k,1);for(const y of a)Pt(u,e.signed,y,e.k,-1);const p=[];for(let y=0;y<c;y++)((e.flags[y]??0)&2)!==0&&p.push(y);let v=0;for(const y of p)v+=u[y]??0;const d=p.length?v/p.length:0;let m=0;for(const y of p)m+=((u[y]??0)-d)**2;const g=(p.length?(m/p.length)**.5:0)||1,f=new Map;for(const y of p)f.set(e.ids[y]??0,((u[y]??0)-d)/g);const w=new Map;for(let y=0;y<c;y++){const S=e.roots[y]??-1;if(((e.flags[y]??0)&1)===0||S<0||(e.years[y]??0)>=e.freshYear)continue;const b=h[y]??0,M=w.get(S);(!M||b>M[0])&&w.set(S,[b,e.ids[y]??0])}const _=new Set(t.map(y=>y.mediaId)),k=[...w.entries()].sort((y,S)=>S[1][0]-y[1][0]||y[0]-S[0]).filter(([y])=>!_.has(y)).slice(0,n).map(([y,[S,b]])=>[y,S,b]),E=new Map;for(const[y,,S]of k){const b=e.position.get(S)??-1;let M=null,O=0;for(const L of r){const T=e.liked.scales[L]??0;let A=null;for(let N=L*e.k;N<(L+1)*e.k;N++){if(e.liked.neighbours[N]!==b)continue;const U=(e.liked.weights[N]??0)*T/32767;A=A===null?U:Math.max(A,U)}A!==null&&A>O&&(M=e.ids[L]??null,O=A)}M!==null&&E.set(y,M)}return{picks:k,order:f,freshYear:e.freshYear,because:E}}const gr=new Set(["Original Creator","Original Story","Story & Art","Story","Art","Director","Chief Director","Series Composition","Script Composition","Character Design","Original Character Design","Music"]);function Dt(e){return{id:e.id,name:e.name?.full??"",image:e.image?.medium??null}}const vr=/^[\\w-]{1,32}$/;function wr(e){const t=e?.id??"";if(!vr.test(t))return null;const n=e?.thumbnail?.startsWith("https://")?e.thumbnail:null;return e?.site==="youtube"?{site:"youtube",url:`https://www.youtube.com/watch?v=${t}`,embedUrl:`https://www.youtube-nocookie.com/embed/${t}`,thumbnail:n??`https://i.ytimg.com/vi/${t}/hqdefault.jpg`}:e?.site==="dailymotion"?{site:"dailymotion",url:`https://www.dailymotion.com/video/${t}`,embedUrl:`https://geo.dailymotion.com/player.html?video=${t}`,thumbnail:n}:null}function yr(e){return e.split(" (")[0]?.trim()??e}function _r(e){const t=(e.characters?.edges??[]).flatMap(i=>{if(!i?.node)return[];const s=i.voiceActors?.[0];return[{...Dt(i.node),role:i.role??"",voiceActor:s?Dt(s):null}]}),n=new Map;for(const i of e.staff?.edges??[]){if(!i?.node||!i.role)continue;const s=yr(i.role);if(!gr.has(s))continue;const o=n.get(i.node.id);o?o.roles.includes(s)||o.roles.push(s):n.set(i.node.id,{...Dt(i.node),roles:[s]})}return{description:e.description??"",trailer:wr(e.trailer),characters:t,staff:[...n.values()]}}function Rt(e){return e==="ANIME"?"MANGA":"ANIME"}function rs(e){return e.type==="ANIME"?e.episodes:e.chapters}function as(e,t){return e.relations.filter(n=>n.relationType===t&&(n.mediaType===null||n.mediaType===e.type)).map(n=>n.mediaId)}function we(e){return as(e,"PREQUEL")}function rt(e){return as(e,"SEQUEL")}function br(e){return new Set([...e.genres.map(t=>`genre:${t}`),...e.tags.map(t=>`tag:${t.name}`),...e.studios.map(t=>`studio:${t}`)])}function Xt(e){const t=br(e);return e.country&&t.add(`country:${e.country}`),e.format&&t.add(`format:${e.format}`),t}const ke=30;function Ar(e){return ls(e,"tag:")}function kr(e){return ls(e,"genre:")}function ls(e,t){return[...e.labels].filter(n=>n.startsWith(t)).map(n=>n.slice(t.length)).sort()}function Sr(e,t,n){if(e.mediaIds.has(t.id))return!0;for(const i of Xt(t))if(e.labels.has(i))return!0;for(const i of Er(t,n))if(e.mediaIds.has(i))return!0;return!1}function Er(e,t){const n=new Set;let i=new Set(we(e));for(let s=0;s<ke&&i.size;s++){for(const r of i)n.add(r);const o=new Set;for(const r of t(i).values())for(const a of we(r))n.has(a)||o.add(a);i=o}return n}async function Mr(e,t,n){const i=new Set(e);let s=new Set(i);for(let o=0;o<ke&&s.size;o++){n&&await n(s);const r=new Set;for(const a of t(s).values())for(const c of rt(a))i.has(c)||r.add(c);for(const a of r)i.add(a);s=r}return i}const Cn=["Action","Adventure","Comedy","Drama","Ecchi","Fantasy","Horror","Mahou Shoujo","Mecha","Music","Mystery","Psychological","Romance","Sci-Fi","Slice of Life","Sports","Supernatural","Thriller"],Cr={Action:["Theme-Action","Theme-Other-Organisations"],Comedy:["Theme-Comedy"],Drama:["Theme-Drama"],Fantasy:["Theme-Fantasy"],Mecha:["Theme-Sci-Fi-Mecha"],Music:["Theme-Arts-Music"],Romance:["Theme-Romance"],"Sci-Fi":["Theme-Sci-Fi","Theme-Sci-Fi-Mecha"],"Slice of Life":["Theme-Slice of Life"],Sports:["Theme-Game-Sport"]},xr={Action:["Super Power","War","Death Game","Survival","Kaiju"],Adventure:["Travel","Dungeon","Isekai","Virtual World","Lost Civilization"],Ecchi:["Nudity"],Fantasy:["Urban Fantasy","Demons","Gods","Vampire","Reincarnation","Dungeon"],Horror:["Body Horror","Cosmic Horror","Zombie","Gore","Survival"],"Mahou Shoujo":["Henshin","Magic"],Mecha:["Robots"],Mystery:["Detective","Conspiracy","Crime"],Psychological:["Psychosexual","Philosophy"],"Sci-Fi":["Robots","Aliens","Space","Cyborg","Post-Apocalyptic","Cyberpunk"],Supernatural:["Demons","Ghost","Youkai","Super Power","Curses","Exorcism"],Thriller:["Conspiracy","Crime","Death Game"]},Ir=new Set(["Heterosexual"]),cs=new Set(["Action","Adventure","Fantasy","Horror","Mahou Shoujo","Mecha","Mystery","Psychological","Romance","Sci-Fi","Sports","Supernatural","Thriller"]),Lr=60,Tr=50;class at{tags;constructor(t){this.tags=new Map(Cn.map(n=>{const i=Cr[n]??[],s=Object.entries(t).filter(([,o])=>i.includes(o)).map(([o])=>o);return[n,new Set([...s,...xr[n]??[]].filter(o=>!Ir.has(o)))]}))}strength(t,n){const i=this.tags.get(n),s=Math.max(0,...t.tags.filter(o=>i?.has(o.name)).map(o=>o.rank));return t.genres.includes(n)?Math.max(s,Tr):s}isMain(t,n){if(!t.genres.includes(n))return!1;const i=this.strength(t,n),s=t.genres.filter(o=>o!==n&&cs.has(o)).map(o=>this.strength(t,o));return s.length===0||i>=Lr&&s.every(o=>o<=i)}summary(t){return t.genres.map(n=>({genre:n,strength:this.strength(t,n),main:this.isMain(t,n)})).sort((n,i)=>i.strength-n.strength)}}const Zt={ANIME:["TV","TV_SHORT","MOVIE","OVA","ONA","SPECIAL","MUSIC"],MANGA:["MANGA","NOVEL","ONE_SHOT"]},Nr={ANIME:["FINISHED","RELEASING","NOT_YET_RELEASED","CANCELLED"],MANGA:["FINISHED","RELEASING","NOT_YET_RELEASED","HIATUS","CANCELLED"]};function be(e={}){const{finishedOnly:t,...n}=e;return{genres:[],tags:[],mainTheme:!1,minTagRank:0,formats:[],yearFrom:null,yearTo:null,statuses:t?["FINISHED"]:[],hideListed:!0,hideSeenAdaptations:!1,minScore:0,countries:[],exclude:[],...n}}function Et(e){return new Set([...e.genres.map(t=>`genre:${t}`),...e.tags.map(t=>`tag:${t}`),...e.countries.map(t=>`country:${t}`),...e.formats.map(t=>`format:${t}`)])}function ni(e){return!!(e.genres.length||e.tags.length||e.formats.length||e.yearFrom||e.yearTo||e.statuses.length||e.countries.length)}function ii(e,t,n){const i=Math.max(1,e.minTagRank),s=new Map(t.tags.map(o=>[o.name,o.rank]));return e.genres.every(o=>t.genres.includes(o))&&e.tags.every(o=>(s.get(o)??0)>=i)&&!(e.mainTheme&&!Pr(e).every(o=>n.isMain(t,o)))&&(e.formats.length===0||t.format!==null&&e.formats.includes(t.format))&&Br(e,t.year)&&(e.statuses.length===0||t.status!==null&&e.statuses.includes(t.status))&&Rr(e,t)}function Or(e,t){return!e.minScore||t.averageScore!==null&&t.averageScore>=e.minScore}function Pr(e){const t=e.genres.filter(n=>cs.has(n));return t.length?t:e.genres}function Dr(e){const t={};return e.genres.length&&(t.genreIn=[...e.genres]),e.tags.length&&(t.tagIn=[...e.tags],t.minimumTagRank=Math.max(1,e.minTagRank)),e.formats.length&&(t.formatIn=[...e.formats]),e.yearFrom&&(t.startGreater=e.yearFrom*1e4),e.yearTo&&(t.startLesser=e.yearTo*1e4+1231),e.statuses.length&&(t.statusIn=[...e.statuses]),e.minScore&&(t.averageScoreGreater=e.minScore-1),e.countries.length===1&&(t.countryOfOrigin=e.countries[0]),t}function Rr(e,t){return!e.countries.length||t.country===void 0?!0:t.country!==null&&e.countries.includes(t.country)}function Br(e,t){return e.yearFrom||e.yearTo?t===null?!1:(e.yearFrom||t)<=t&&t<=(e.yearTo||t):!0}const ds=new Set(["ADAPTATION","SOURCE","ALTERNATIVE","SUMMARY","COMPILATION","CONTAINS"]),Fr=new Set(["COMPLETED","REPEATING","DROPPED","CURRENT","PAUSED"]);function si(e,t,n){const i=new Set(e.filter(s=>Fr.has(s.status)).map(s=>s.mediaId));return us(i,t,n)}function oi(e,t,n){return us(new Set(e.map(i=>i.mediaId)),t,n)}function us(e,t,n){const i=o=>new Set([...n(o).values()].flatMap(r=>r.relations.filter(a=>ds.has(a.relationType)&&(a.mediaType===null||a.mediaType===t)).map(a=>a.mediaId))),s=i(e);for(const o of i(s))s.add(o);for(const o of e)s.delete(o);return{seen:e,linked:s}}function ri(e,t){return e.linked.has(t.id)||t.relations.some(n=>ds.has(n.relationType)&&e.seen.has(n.mediaId))}function $r(e,t,n,i,s){const o=e.length,r=n.reduce((p,v)=>p+v,0),a=new Float64Array(s);e.forEach((p,v)=>{p.indices.forEach((d,m)=>{a[d]=(a[d]??0)+(n[v]??0)*(p.values[m]??0)})});for(let p=0;p<s;p++)a[p]=(a[p]??0)/r;const c=t.reduce((p,v,d)=>p+(n[d]??0)*v,0)/r,h=o<s?zr(e,t,n,i,s,a,c):Ur(e,t,n,i,s,a,c);let u=c;for(let p=0;p<s;p++)u-=(a[p]??0)*(h[p]??0);return{coef:h,intercept:u}}function jr(e,t){let n=e.intercept;return t.indices.forEach((i,s)=>{n+=(e.coef[i]??0)*(t.values[s]??0)}),n}function zr(e,t,n,i,s,o,r){const a=e.length,c=e.map(w=>Wr(w)),h=e.map(w=>w.indices.reduce((_,k,E)=>_+(w.values[E]??0)*(o[k]??0),0)),u=o.reduce((w,_)=>w+_*_,0),p=n.map(w=>Math.sqrt(w)),v=new Float64Array(a*a);for(let w=0;w<a;w++){for(let _=0;_<=w;_++){const k=Hr(e[w],c[_]),E=(p[w]??0)*(p[_]??0)*(k-(h[w]??0)-(h[_]??0)+u);v[w*a+_]=E,v[_*a+w]=E}v[w*a+w]=(v[w*a+w]??0)+i}const d=new Float64Array(a);for(let w=0;w<a;w++)d[w]=(p[w]??0)*((t[w]??0)-r);const m=fs(v,d,a),g=new Float64Array(s);let f=0;e.forEach((w,_)=>{const k=(m[_]??0)*(p[_]??0);f+=k,w.indices.forEach((E,y)=>{g[E]=(g[E]??0)+k*(w.values[y]??0)})});for(let w=0;w<s;w++)g[w]=(g[w]??0)-f*(o[w]??0);return g}function Ur(e,t,n,i,s,o,r){const a=s,c=n.reduce((p,v)=>p+v,0),h=new Float64Array(a*a),u=new Float64Array(a);e.forEach((p,v)=>{const d=n[v]??0,m=(t[v]??0)-r;p.indices.forEach((g,f)=>{const w=p.values[f]??0;u[g]=(u[g]??0)+d*w*m,p.indices.forEach((_,k)=>{h[g*a+_]=(h[g*a+_]??0)+d*w*(p.values[k]??0)})})});for(let p=0;p<a;p++){for(let v=0;v<a;v++)h[p*a+v]=(h[p*a+v]??0)-c*(o[p]??0)*(o[v]??0);h[p*a+p]=(h[p*a+p]??0)+i}return fs(h,u,a)}function fs(e,t,n){const i=new Float64Array(n*n);for(let r=0;r<n;r++)for(let a=0;a<=r;a++){let c=e[r*n+a]??0;for(let h=0;h<a;h++)c-=(i[r*n+h]??0)*(i[a*n+h]??0);if(r===a){if(c<=0)throw new Error("matrix is not positive definite");i[r*n+r]=Math.sqrt(c)}else i[r*n+a]=c/(i[a*n+a]??1)}const s=new Float64Array(n);for(let r=0;r<n;r++){let a=t[r]??0;for(let c=0;c<r;c++)a-=(i[r*n+c]??0)*(s[c]??0);s[r]=a/(i[r*n+r]??1)}const o=new Float64Array(n);for(let r=n-1;r>=0;r--){let a=s[r]??0;for(let c=r+1;c<n;c++)a-=(i[c*n+r]??0)*(o[c]??0);o[r]=a/(i[r*n+r]??1)}return o}function Wr(e){const t=new Map;return e.indices.forEach((n,i)=>{t.set(n,e.values[i]??0)}),t}function Hr(e,t){let n=0;return e.indices.forEach((i,s)=>{n+=(e.values[s]??0)*(t.get(i)??0)}),n}const qr=70,lt=5,Gr=.6,Vr=150,Qr=3;function Yr(e){const t=Vr/Math.max(e,1);return Math.min(Qr,Gr*Math.max(1,t))}function hs(e){return e.target>=0}const xn={rewatchBonus:1,tentativeWeight:.7,rewatched:[1.5,.8],completed:[1,.7],dropBase:-1,dropSlope:3,paused:[-.5,.3],current:[.5,.3],notInterested:[-2,.6]};function Jr(e){const t=e.filter(n=>n.score>0).map(n=>n.score);return t.length?t.reduce((n,i)=>n+i,0)/t.length:qr}function Kr(e,t,n,i=xn){const s=e.repeat>0||e.status==="REPEATING";if(e.status==="PLANNING")return null;if(e.score>0){let o=(e.score-n)/10;s&&(o+=i.rewatchBonus);const r=e.status==="CURRENT"||e.status==="PAUSED";return[o,r?i.tentativeWeight:1]}if(s)return i.rewatched;if(e.status==="COMPLETED")return i.completed;if(e.status==="DROPPED"){const o=1-Xr(e,t);return[i.dropBase-i.dropSlope*o,1]}return e.status==="PAUSED"?i.paused:i.current}function Xr(e,t){const n=rs(t);if(n)return Math.min(e.progress/n,1);const i=t.type==="ANIME"?12:50;return Math.min(e.progress/i,1)}function ct(e,t,n=xn){const i=Jr(e),s=[];for(const o of e){const r=t.get(o.mediaId),a=r?Kr(o,r,i,n):null;r&&a&&s.push({media:r,target:a[0],weight:a[1],scored:o.score>0})}return s}function Zr(e,t=xn){const[n,i]=t.notInterested;return e.map(s=>({media:s,target:n,weight:i,scored:!1}))}function tt(e){const t=new Map;for(const n of e.genres)t.set(`genre:${n}`,1);for(const n of e.tags)t.set(`tag:${n.name}`,n.rank/100);for(const n of e.studios)t.set(`studio:${n}`,1);return e.format&&t.set(`format:${e.format}`,1),e.year&&t.set(`decade:${Math.floor(e.year/10)*10}s`,1),t}class ps extends Error{constructor(t){super(t),this.name="NotEnoughHistory"}}class ea{alpha;minFeatureCount;vocabulary=new Map;names=[];fit_=null;constructor(t=10,n=1){this.alpha=t,this.minFeatureCount=n}fit(t){if(t.length<lt)throw new ps(`need at least ${lt} rated titles, got ${t.length}`);const n=t.map(s=>tt(s.media)),i=new Map;for(const s of n)for(const o of s.keys())i.set(o,(i.get(o)??0)+1);return this.names=[...i].filter(([,s])=>s>=this.minFeatureCount).map(([s])=>s).sort(ta),this.vocabulary=new Map(this.names.map((s,o)=>[s,o])),this.fit_=$r(n.map(s=>this.row(s)),t.map(s=>s.target),t.map(s=>s.weight),this.alpha,this.names.length),this}predict(t){const n=this.fitted();return t.map(i=>jr(n,this.row(tt(i))))}contributions(t){const n=this.fitted(),i=[];for(const[s,o]of tt(t)){const r=this.vocabulary.get(s);r!==void 0&&i.push([s,o*(n.coef[r]??0)])}return i.sort((s,o)=>o[1]-s[1])}weights(){const t=this.fitted();return this.names.map((n,i)=>[n,t.coef[i]??0]).sort((n,i)=>i[1]-n[1])}row(t){const n={indices:[],values:[]};for(const[i,s]of t){const o=this.vocabulary.get(i);o!==void 0&&(n.indices.push(o),n.values.push(s))}return n}fitted(){if(!this.fit_)throw new Error("PreferenceModel used before fit()");return this.fit_}}function ta(e,t){return e<t?-1:e>t?1:0}const ms=new Map([["PLANNING","on your planning list"],["CURRENT","in progress on your list"],["PAUSED","paused on your list"]]),Ie=new Set(["COMPLETED","REPEATING"]),na=new Set(["SPECIAL","OVA","MUSIC"]);function De(e){return e.format!==null&&na.has(e.format)}function gs(e,t){if(De(e))return[...new Set(we(e))].sort((o,r)=>o-r);const n=new Set,i=new Set([e.id]);let s=new Set(we(e));for(let o=0;o<ke;o++){for(const c of i)s.delete(c);if(!s.size)break;for(const c of s)i.add(c);const r=t(s),a=new Set;for(const c of s){const h=r.get(c);if(h&&De(h))for(const u of we(h))a.add(u);else n.add(c)}s=a}return[...n].sort((o,r)=>o-r)}function vs(e,t){if(!De(e))return null;const n=new Set([e.id]);let i=new Set(rt(e));for(let s=0;s<ke;s++){for(const a of n)i.delete(a);if(!i.size)return null;for(const a of i)n.add(a);const o=[...t(i).values()],r=o.filter(a=>!De(a)).sort((a,c)=>a.id-c.id);if(r[0])return r[0];i=new Set(o.flatMap(a=>rt(a)))}return null}function ia(e,t,n){const i=vs(e,n);return i&&!Ie.has(t.get(i.id))?!1:gs(e,n).every(s=>Ie.has(t.get(s)))}const ws=["format:","decade:"];function sa(e,t,n=[],i=new Map,s=[]){const o=ct(e,t);if(o.length<lt)throw new ps(`need at least ${lt} rated titles, got ${o.length}`);const r=new Set([...e,...n].map(p=>p.mediaId)),c=[...new Map(s.map(p=>[p.id,p])).values()].filter(p=>!r.has(p.id)).sort((p,v)=>p.id-v.id),h=new ea().fit([...o,...ct(n,i),...Zr(c)]),u=new Set(o.filter(hs).map(p=>p.media.id));return{model:h,entries:e,media:t,likedIds:u,communityWeight:Yr(o.length)}}function oa(e,t=3){const n=e.weights().filter(([i])=>i.startsWith("tag:")).map(([i,s])=>[i.slice(4),s]);return{liked:n.filter(([,i])=>i>0).slice(0,t).map(([i])=>i),disliked:n.filter(([,i])=>i<0).reverse().slice(0,t).map(([i])=>i)}}function ra(e,t,n={}){const i=new Map,s=(r,a)=>i.set(r,[...i.get(r)??[],a]);for(const[r]of n.crowd?.picks??[]){const a=e.media.get(n.crowd?.because.get(r)??-1);s(r,a?`fans of ${a.title} liked this too`:"liked by people with lists like yours")}const o=[...t].sort((r,a)=>a[2]-r[2]||r[0]-a[0]);for(const[r,a,c]of o){const h=e.media.get(r);c>0&&h&&e.likedIds.has(r)&&s(a,`liked ${h.title}`)}for(const[r,a]of n.extra??[])a?s(r,a):i.has(r)||i.set(r,[]);if(n.includeListed)for(const r of e.entries){const a=ms.get(r.status);a&&s(r.mediaId,a)}return i}function aa(e,t,n){let i=e;const s=new Set([e.id]);for(let o=0;o<ke;o++){const r=vs(i,n);if(r&&!Ie.has(t.get(r.id))){if(t.has(r.id)||s.has(r.id))return null;i=r,s.add(i.id);continue}const a=gs(i,n);if(a.every(u=>Ie.has(t.get(u))))return i.id;if(a.some(u=>t.has(u)&&!Ie.has(t.get(u))))return null;const c=a.filter(u=>!t.has(u)&&!s.has(u)).sort((u,p)=>u-p),h=c.length?n(c.slice(0,1)).values().next().value:void 0;if(!h)return null;i=h,s.add(i.id)}return null}function ai(e,t,n){const i=n(e.keys()),s=new Map;for(const[o,r]of e){const a=i.get(o),c=!a||t.has(o)?o:aa(a,t,n);if(c===null)continue;const h=s.get(c)??[];for(const u of r)h.includes(u)||h.push(u);s.set(c,h)}return s}function la(e,t,n){const i=((t.averageScore??70)-70)/10;return n+e.communityWeight*i}function ca(e,t,n,i={}){const s=new Map(e.entries.map(d=>[d.mediaId,d.status])),o=i.lookup??(()=>new Map),r=d=>{const m=new Map,g=[];for(const f of d){const w=n.get(f);w?m.set(f,w):g.push(f)}for(const[f,w]of o(g))m.set(f,w);return m},a=new Map;i.crowd?.picks.forEach(([d],m)=>{for(const g of ai(new Map([[d,["crowd"]]]),s,r).keys())a.has(g)||a.set(g,m)});const c=ai(t,s,r),h=[];for(const d of c.keys()){const m=r([d]).get(d);if(!m)continue;const g=s.get(m.id);(g===void 0||i.includeListed&&ms.has(g))&&(i.includeAdult||!m.isAdult)&&ia(m,s,r)&&!(i.exclusions&&Sr(i.exclusions,m,o))&&(!i.accept||i.accept(m))&&h.push(m)}const u=e.model.predict(h),p=h.map((d,m)=>{const g=new Set(d.tags.filter(w=>w.spoiler).map(w=>`tag:${w.name}`)),f=e.model.contributions(d).filter(([w,_])=>_>0&&!g.has(w)&&!ws.some(k=>w.startsWith(k))).slice(0,3).map(([w])=>{const _=w.indexOf(":");return{kind:w.slice(0,_),value:w.slice(_+1)}});return{media:d,score:la(e,d,u[m]??0),reasons:f,sources:c.get(d.id)??[]}}),v=i.limit??20;return i.crowd?da(p,i.crowd,a,v):p.sort((d,m)=>m.score-d.score).slice(0,v)}function da(e,t,n,i){const s=new Map(e.map(g=>[g.media.id,g.score]));for(const g of e)g.score+=fr*(t.order.get(g.media.id)??0);const o=g=>(g.media.year??0)>=t.freshYear,r=g=>n.get(g.media.id)??0,a=(g,f)=>f.score-g.score||g.media.id-f.media.id,c=e.filter(g=>n.has(g.media.id)&&!o(g)).sort((g,f)=>r(g)-r(f)||g.media.id-f.media.id),h=new Set(c.map(g=>g.media.id)),u=g=>s.get(g.media.id)??0,p=e.filter(g=>o(g)&&!h.has(g.media.id)).sort((g,f)=>u(f)-u(g)||g.media.id-f.media.id);for(const g of p)h.add(g.media.id);const v=e.filter(g=>!h.has(g.media.id)).sort(a),d=Math.min(dr,i),m=[];for(;m.length<i&&(c.length||p.length||v.length);){const g=Math.floor(d/4),f=[...c.splice(0,d-g),...p.splice(0,g)];for(const w of[v,c,p])f.push(...w.splice(0,d-f.length));m.push(...f.sort(a))}return m.slice(0,i)}const ua=500,en=50,In=720*3600*1e3;async function fa(e,t,n,i,s=()=>{}){const o=[],r=[],a=new Map,c=new Map,h=new Set;for(let v=1;;v++){s(`Reading your ${i.toLowerCase()} list`);const d=await e.query(ir,{userName:n,type:i,chunk:v,perChunk:ua}),m=nr(d);for(const[g,f]of m.entries.entries()){if(h.has(f.mediaId))continue;h.add(f.mediaId),o.push(f);const w=m.media[g];w&&r.push(w)}for(const[g,f]of m.recommendations)a.set(g,f);for(const[g,f]of m.customLists)c.set(g,new Set([...c.get(g)??[],...f]));if(!m.hasNext)break}await t.putMedia(r),await t.putList(n,i,o),await t.putRecommendations(a),await t.putCustomLists(n,i,c);const u=new Map(r.map(v=>[v.id,v])),p=await ys(e,t,o,u,a,s);return{entries:o.length,candidatesFetched:p}}async function ha(e,t,n,i,s,o=new Map,r=()=>{},a=In){const c=new Set,h=s.filter(_=>!c.has(_.mediaId)&&!!c.add(_.mediaId));await t.putList(n,i,h),await t.putCustomLists(n,i,o);const u=h.map(_=>_.mediaId),p=new Set((await t.recommendationsFrom(u)).map(([_])=>_)),v=new Set([...await t.missingOrStale(u,a),...u.filter(_=>!p.has(_))]),d=u.filter(_=>v.has(_)),m=`Fetching details of your ${i==="ANIME"?"anime":"manga"} list`;await _s(e,or,d,async _=>{await t.putMedia(_.map(St)),await t.putRecommendations(new Map(_.map(k=>[k.id,ss(k)])))},(_,k)=>r(m,_,k));const g=await t.getMedia(u),f=new Map;for(const[_,k,E]of await t.recommendationsFrom(u))f.set(_,[...f.get(_)??[],[k,E]]);const w=await ys(e,t,h,g,f,r);return{entries:h.length,candidatesFetched:w}}async function ys(e,t,n,i,s,o){const r=new Set(ct(n,i).filter(hs).map(c=>c.media.id)),a=new Set;for(const[c,h]of s)if(r.has(c))for(const[u]of h)i.has(u)||a.add(u);return ze(e,t,a,In,(c,h)=>o("Fetching recommended titles",c,h))}async function ze(e,t,n,i=In,s=()=>{}){const o=await t.missingOrStale(n,i);return await _s(e,sr,o,async r=>t.putMedia(r.map(St)),s),o.length}async function _s(e,t,n,i,s){const o=Kt(Kt(n,en),is);if(!o.length)return;let r=0;s(0,o.length),await Promise.all(o.map(async a=>{const c=await e.queryMany(t,a.map(h=>({ids:h,page:1,perPage:en})));await i(c.flatMap(h=>h.Page.media)),s(++r,o.length)}))}async function li(e,t,n,i){const s=i.map(a=>({type:n,page:a.page??1,perPage:a.perPage??en,...Object.fromEntries(Object.entries(a.variables).filter(([,c])=>pa(c)))})),r=(await Promise.all(Kt(s,is).map(a=>e.queryMany(rr,a)))).flat().map(a=>a.Page.media.map(St));return await t.putMedia(r.flat()),r}function pa(e){return Array.isArray(e)?e.length>0:e!=null&&e!==!1&&e!==0&&e!==""}const ma=6,ga=720*3600*1e3;class tn extends Error{constructor(t){super(t),this.name="NoSyncedList"}}function nn(e={}){return{limit:20,discover:!0,includeAdult:!1,filters:be(),...e}}async function ci(e,t,n,i,s=nn(),o=()=>{}){const r=await e.getList(n,i);if(!r.length)throw new tn(`no synced ${i.toLowerCase()} list for ${n}`);const a=await e.getList(n,Rt(i)),c=new Map;await de(e,c,[...r,...a].map(A=>A.mediaId));const h=(await e.getExclusions(n)).notInterested??[];await de(e,c,h);const u=h.flatMap(A=>{const N=c.get(A);return N?[N]:[]}),p=sa(r,c,a,c,u),v=s.discover?t:null,d=new Set(r.map(A=>A.mediaId)),{filters:m}=s,g=[],f=[],w=i==="ANIME"&&s.crowd?mr(s.crowd,r,ur(s.limit)):null;let _;try{_=await di(e,n,i,c,v)}catch(A){if(!(A instanceof K))throw A;f.push(`sequels of excluded titles may be missed: ${A.message}`),_=await di(e,n,i,c,null)}const k=Et(m);_={..._,labels:new Set([..._.labels,...m.exclude??[]].filter(A=>!k.has(A)))};let E;try{E=new at(await Le(e,v))}catch(A){if(!(A instanceof K))throw A;f.push(`main themes judged without tag categories: ${A.message}`),E=new at(await Le(e,null))}try{const{liked:A,disliked:N}=oa(p.model),U=Ar(_),Q={tagNotIn:[...new Set([...N,...U])].sort(),genreNotIn:kr(_),idNotIn:[...new Set([...d,..._.mediaIds])].sort((q,W)=>q-W),...Dr(m)};if(v){const q=A.filter(D=>!U.includes(D)),W=q.map(D=>({variables:{...Q,tagIn:[D,...m.tags]},perPage:30})),C={...Q,tagNotIn:[...U].sort()},I=ni(m)?m.countries.length>1?m.countries.map(D=>({...C,countryOfOrigin:D})):[C]:[],H=w?(w.freshYear-1)*1e4+1231:0,Ot={...Q,startGreater:Math.max(Number(Q.startGreater??0),H)},Qn=w?[1,2].map(D=>({variables:Ot,perPage:50,page:D})):[];o(W.length?"Searching AniList by your top tags":"Searching AniList");const We=await li(v,e,i,[...W,...Qn,...I.map(D=>({variables:D,perPage:50,page:1}))]);for(const[D,X]of q.entries())for(const he of We[D]??[])g.push([he.id,`top-scored with ${X}`]);if(w){const D=We[q.length]??[],X=D.length<50?[D]:[D,We[q.length+1]??[]];for(const he of X.flat())g.push([he.id,""])}const Yn=D=>{for(const X of D)g.push([X.id,"top-scored for your filters"]);return D.filter(X=>ii(m,X,E)).length},Jn=I.flatMap((D,X)=>{const he=We[q.length+Qn.length+X]??[],Bo=Yn(he);return he.length<50||Bo>=s.limit?[]:Array.from({length:ma-1},(fd,Fo)=>({variables:D,perPage:50,page:Fo+2}))});if(Jn.length){o("Searching AniList with your filters");for(const D of await li(v,e,i,Jn))Yn(D)}}}catch(A){if(!(A instanceof K))throw A;f.push(`some candidates skipped: ${A.message}`)}o("Ranking");const y=await e.recommendationsFrom(p.likedIds),S=ra(p,y,{extra:g,includeListed:!m.hideListed,crowd:w});if(w&&v)try{await ze(v,e,w.picks.map(([A])=>A))}catch(A){if(!(A instanceof K))throw A;f.push(`some of the crowd\'s picks skipped: ${A.message}`)}await de(e,c,S.keys()),await wa(e,c,S.keys(),v,f);let b=null;if(m.hideSeenAdaptations)if(await e.lastSynced(n,Rt(i))===null){const A=Rt(i).toLowerCase();f.push(`sync your ${A} list to hide titles you\'ve finished as ${A}`)}else b=await ya(e,c,a,i);const M=m.hideListed?await _a(e,c,r,i):null,O=ni(m),L=A=>(!O||ii(m,A,E))&&Or(m,A)&&!(b&&ri(b,A))&&!(M&&ri(M,A));let T=ca(p,S,c,{limit:s.limit,includeAdult:s.includeAdult,exclusions:_,lookup:Ae(c),accept:L,includeListed:!m.hideListed,crowd:w});return v&&(T=await va(v,e,T,f)),{recommendations:T,profile:p,warnings:f,crowd:w!==null}}async function di(e,t,n,i,s){const o=await e.getExclusions(t),r=new Set(o.titles),a=await e.getCustomLists(t,n);for(const h of o.customLists[n])for(const u of a.get(h)??[])r.add(u);const c=async h=>{s&&await ze(s,e,h),await de(e,i,h,!0)};return{mediaIds:await Mr(r,Ae(i),c),labels:new Set(o.labels)}}async function Le(e,t){const n=await e.getMeta("tag_categories");if(n){const o=JSON.parse(n);if(!t||Date.now()-o.at<ga)return o.categories}if(!t)return{};const i=await t.query(lr),s=Object.fromEntries(i.MediaTagCollection.map(o=>[o.name,o.category]));return await e.setMeta("tag_categories",JSON.stringify({at:Date.now(),categories:s})),s}async function va(e,t,n,i){const s=n.filter(r=>!r.media.coverUrl||r.media.scoreDistribution===null).map(r=>r.media.id);if(!s.length)return n;try{await ze(e,t,s,0)}catch(r){if(!(r instanceof K))throw r;return i.push(`some covers and ratings skipped: ${r.message}`),n}const o=await t.getMedia(s);return n.map(r=>({...r,media:o.get(r.media.id)??r.media}))}async function de(e,t,n,i=!1){const s=[...n].filter(o=>i||!t.has(o));for(const[o,r]of await e.getMedia(s))t.set(o,r)}async function wa(e,t,n,i,s){const o=new Set(n);let r=new Set(o);for(let a=0;a<ke&&r.size;a++){const c=new Set;for(const h of r){const u=t.get(h);if(u)for(const p of[...we(u),...De(u)?rt(u):[]])o.has(p)||c.add(p)}if(!c.size)break;if(i)try{await ze(i,e,c)}catch(h){if(!(h instanceof K))throw h;s.push(`first seasons of some sequels may be missed: ${h.message}`),i=null}await de(e,t,c);for(const h of c)o.add(h);r=c}}async function ya(e,t,n,i){const s=si(n,i,Ae(t));return await de(e,t,s.linked),si(n,i,Ae(t))}async function _a(e,t,n,i){const s=oi(n,i,Ae(t));return await de(e,t,s.linked),oi(n,i,Ae(t))}function Ae(e){return t=>new Map([...t].flatMap(n=>e.has(n)?[[n,e.get(n)]]:[]))}function ba(){return{titles:[],labels:[],customLists:{ANIME:[],MANGA:[]},notInterested:[]}}class Te{media=new Map;lists=new Map;links=new Map;customLists=new Map;exclusions=new Map;meta=new Map;now;constructor(t=Date.now){this.now=t}async getMedia(t){const n=new Map;for(const i of t){const s=this.media.get(i);s&&n.set(i,s.media)}return n}async putMedia(t){const n=this.now();for(const i of t)this.media.set(i.id,{media:i,fetchedAt:n})}async missingOrStale(t,n){const i=this.now()-n;return[...new Set(t)].filter(s=>(this.media.get(s)?.fetchedAt??-1/0)<i).sort((s,o)=>s-o)}async getList(t,n){return[...this.lists.get(Ce(t,n))?.entries??[]]}async putList(t,n,i){this.lists.set(Ce(t,n),{entries:[...i],syncedAt:this.now()})}async lastSynced(t,n){return this.lists.get(Ce(t,n))?.syncedAt??null}async putRecommendations(t){for(const[n,i]of t)this.links.set(n,[...i])}async recommendationsFrom(t){return[...new Set(t)].flatMap(n=>(this.links.get(n)??[]).map(([i,s])=>[n,i,s]))}async getCustomLists(t,n){const i=this.customLists.get(Ce(t,n))??new Map;return new Map([...i].map(([s,o])=>[s,new Set(o)]))}async putCustomLists(t,n,i){this.customLists.set(Ce(t,n),new Map([...i].map(([s,o])=>[s,new Set(o)])))}async getExclusions(t){return structuredClone(this.exclusions.get(t.toLowerCase())??ba())}async putExclusions(t,n){this.exclusions.set(t.toLowerCase(),structuredClone(n))}async getMeta(t){return this.meta.get(t)??null}async setMeta(t,n){this.meta.set(t,n)}toJSON(){return{media:[...this.media],lists:[...this.lists],links:[...this.links],customLists:[...this.customLists].map(([t,n])=>[t,[...n].map(([i,s])=>[i,[...s]])]),exclusions:[...this.exclusions],meta:[...this.meta]}}static fromJSON(t,n=Date.now){const i=new Te(n);return i.media=new Map(t.media),i.lists=new Map(t.lists),i.links=new Map(t.links),i.customLists=new Map(t.customLists.map(([s,o])=>[s,new Map(o.map(([r,a])=>[r,new Set(a)]))])),i.exclusions=new Map(t.exclusions),i.meta=new Map(t.meta),i}}function Ce(e,t){return`${e.toLowerCase()}:${t}`}var Re,$,Bt,ui,sn=Object.is,Be=0,bs=[],on=[],B=P,fi=B.__b,hi=B.__r,pi=B.diffed,mi=B.__c,gi=B.unmount,vi=B.__;function Ln(e,t){B.__h&&B.__h($,e,Be||t),Be=0;var n=$.__H||($.__H={__:[],__h:[]});return e>=n.__.length&&n.__.push({}),n.__[e]}function x(e){return Be=1,Aa(ks,e)}function Aa(e,t,n){var i=Ln(Re++,2);if(i.t=e,!i.__c&&(i.__=[ks(void 0,t),function(o){var r=(i.__N||i.__)[0],a=i.t(r,o);sn(r,a)||(i.__N=[a,i.__[1]],i.__c.setState({}))}],i.__c=$,!$.__f)){$.__f=!0;var s=$.shouldComponentUpdate;$.shouldComponentUpdate=function(o,r,a){var c=this.__H;if(!c)return!0;var h=!1,u=this.props!=o;if(c.__.some(function(v){v.__N&&(h=!0,sn(v.__[0],v.__N[0])||(u=!0))}),s){var p=s.call(this,o,r,a);return h?p||u:p}return!h||u}}return i.__}function j(e,t){var n=Ln(Re++,3);!B.__s&&As(n.__H,t)&&(n.__P=!0,n.__=e,n.u=t,$.__H.__h.push(n))}function ue(e){return Be=5,Fe(function(){return{current:e}},[])}function Fe(e,t){var n=Ln(Re++,7);return As(n.__H,t)&&(n.__=e(),n.__H=t),n.__}function ee(e,t){return Be=8,Fe(function(){return e},t)}function ka(){var e;do{for(;e=on.shift();)try{Ne(e)}catch(n){B.__e(n,{__:(e=e.__P)&&e.__v})}for(;e=bs.shift();){var t=e.__H;if(e.__P&&t)try{t.__h.some(Ne),t.__h.some(rn),t.__h=[]}catch(n){t.__h=[],B.__e(n,e.__v)}}}while(on.length)}B.__b=function(e){$=null,fi&&fi(e)},B.__=function(e,t){e&&t.__k&&t.__k.__m&&(e.__m=t.__k.__m),vi&&vi(e,t)},B.__r=function(e){hi&&hi(e),Re=0;var t=($=e.__c).__H;t&&(Bt==$?$.__h=[]:(t.__h.some(Ne),t.__h.some(rn),Re=0),t.__h=[],t.__.some(function(n){n.__N&&(n.__=n.__N),n.u=n.__N=void 0})),Bt=$},B.diffed=function(e){pi&&pi(e);var t=e.__c;t&&t.__H&&(t.__H.__h.length&&yi(bs.push(t)),t.__H.__.some(function(n){n.u&&(n.__H=n.u)})),Bt=$=null},B.__c=function(e,t){t.some(function(n){try{n.__h.some(Ne),n.__h=n.__h.filter(function(i){return!i.__||rn(i)})}catch(i){n.__h=[function(){throw i}]}}),mi&&mi(e,t)},B.unmount=function(e){gi&&gi(e);var t,n,i=e.__c;i&&i.__H&&(i.__H.__.some(function(s){try{if(s.__P&&s.__c){if(n===void 0){for(n=e.__;n&&(!n.__c||!n.__c.__P);)n=n.__;n=n&&n.__c}s.__P=n,yi(on.push(s))}else Ne(s)}catch(o){t=o}}),i.__H=void 0,t&&B.__e(t,i.__v))};var wi=typeof requestAnimationFrame=="function";function Sa(e){var t,n=function(){clearTimeout(i),wi&&cancelAnimationFrame(t),setTimeout(e)},i=setTimeout(n,35);wi&&(t=requestAnimationFrame(n))}function yi(e){e!=1&&ui==B.requestAnimationFrame||((ui=B.requestAnimationFrame)||Sa)(ka)}function Ne(e){var t=$,n=e.__c;typeof n=="function"&&(e.__c=void 0,n()),$=t}function rn(e){var t=$;e.__c=e.__(),$=t}function As(e,t){return!e||e.length!=t.length||t.some(function(n,i){return!sn(n,e[i])})}function ks(e,t){return typeof t=="function"?t(e):t}const Ss="data:image/png;base64,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",Es="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiBwcmVzZXJ2ZUFzcGVjdFJhdGlvPSJ4TWlkWU1pZCIgd2lkdGg9IjE3MiIgaGVpZ2h0PSIxNzIiIHZpZXdCb3g9IjAgMCAxNzIgMTcyIj48ZGVmcz48c3R5bGU+IC5jbHMtMSB7IGZpbGw6ICMwMmE5ZmY7IH0gLmNscy0xLCAuY2xzLTIgeyBmaWxsLXJ1bGU6IGV2ZW5vZGQ7IH0gLmNscy0yIHsgZmlsbDogI2ZlZmVmZTsgfSA8L3N0eWxlPjwvZGVmcz48Zz48cGF0aCBkPSJNMTExLjMyMiwxMTEuMTU3IEwxMTEuMzIyLDQxLjAyOSBDMTExLjMyMiwzNy4wMTAgMTA5LjEwNSwzNC43OTIgMTA1LjA4NiwzNC43OTIgTDkxLjM2NSwzNC43OTIgQzg3LjM0NiwzNC43OTIgODUuMTI4LDM3LjAxMCA4NS4xMjgsNDEuMDI5IEM4NS4xMjgsNDEuMDI5IDg1LjEyOCw1Ni4zMzcgODUuMTI4LDc0LjMzMyBDODUuMTI4LDc1LjI3MSA5NC4xNjUsNzkuNjI2IDk0LjQwMSw4MC41NDcgQzEwMS4yODYsMTA3LjQ0OSA5NS44OTcsMTI4Ljk4MCA4OS4zNzAsMTI5Ljk4NSBDMTAwLjA0MiwxMzAuNTEzIDEwMS4yMTYsMTM1LjY0NCA5My4yNjcsMTMyLjEzOCBDOTQuNDgzLDExNy43ODQgOTkuMjI4LDExNy44MTIgMTEyLjg2OSwxMzEuNjEwIEMxMTIuOTg2LDEzMS43MjkgMTE1LjY2NiwxMzcuMzUxIDExNS44MzMsMTM3LjM1MSBDMTMxLjE3MCwxMzcuMzUxIDE0OC4wNTAsMTM3LjM1MSAxNDguMDUwLDEzNy4zNTEgQzE1Mi4wNjksMTM3LjM1MSAxNTQuMjg2LDEzNS4xMzQgMTU0LjI4NiwxMzEuMTE1IEwxNTQuMjg2LDExNy4zOTQgQzE1NC4yODYsMTEzLjM3NSAxNTIuMDY5LDExMS4xNTcgMTQ4LjA1MCwxMTEuMTU3IEwxMTEuMzIyLDExMS4xNTcgWiIgY2xhc3M9ImNscy0xIi8+PHBhdGggZD0iTTU0LjM2NSwzNC43OTIgTDE4LjMzMSwxMzcuMzUxIEw0Ni4zMjcsMTM3LjM1MSBMNTIuNDI1LDExOS42MTEgTDgyLjkxNSwxMTkuNjExIEw4OC44NzUsMTM3LjM1MSBMMTE2LjczMiwxMzcuMzUxIEw4MC44MzYsMzQuNzkyIEw1NC4zNjUsMzQuNzkyIFpNNTguODAwLDk2Ljg4MiBMNjcuNTMxLDY4LjQ3MCBMNzcuMDk0LDk2Ljg4MiBMNTguODAwLDk2Ljg4MiBaIiBjbGFzcz0iY2xzLTIiLz48L2c+PC9zdmc+",nt=["ANIME","MANGA"],_i={limit:20,includeAdult:!1,showRatings:!0,titleLanguage:"english",advancedOpen:!1,filters:{ANIME:be(),MANGA:be()},tourSeen:!1},ge=200;function xe(e,t){const n=e.titles;return n?(t==="native"?[n.native,n.romaji,n.english]:t==="romaji"?[n.romaji,n.english]:[n.english,n.romaji]).find(s=>s)??e.title:e.title}const bi=3,Ai="ui-settings",ki="ui-synced-at",Ea=800;class dt{constructor(t,n,i,s){this.host=t,this.store=n,this.user=i,this.client=s??new Zo(t.transport)}host;store;user;client;saveTimer=null;themes=null;details=new Map;preferences=new Map;crowd=null;static async open(t,n,i){const s=await t.loadStore(),o=s?Te.fromJSON(JSON.parse(s)):new Te;return new dt(t,o,n,i)}async lastSynced(){const t=await this.store.getMeta(ki);return t?Number(t):null}async sync(t=()=>{}){for(const n of nt){if(t(`Reading your ${n.toLowerCase()} list`),this.host.list){const i=await this.host.list(n),s=new Map(Object.entries(i.customLists).map(([o,r])=>[o,new Set(r)]));await ha(this.client,this.store,this.user,n,i.entries,s,t)}else await fa(this.client,this.store,this.user,n,t);this.preferences.delete(n)}await this.store.setMeta(ki,String(Date.now())),await this.save(!0)}async settings(){const t=await this.store.getMeta(Ai);if(!t)return structuredClone(_i);const n=JSON.parse(t);return{..._i,...n,filters:{ANIME:be(n.filters?.ANIME??{}),MANGA:be(n.filters?.MANGA??{})}}}async setSettings(t){await this.store.setMeta(Ai,JSON.stringify(t)),await this.save()}async picks(t){const n=await this.store.getMeta(`ui-picks:${t}`),i=n?JSON.parse(n):null;return i?.ranking===bi?i:null}async recommend(t,n=()=>{},i=ge){const s=await this.settings(),o=t==="ANIME"?await this.crowdTable():{table:null};let r;try{r=await ci(this.store,this.client,this.user,t,nn({limit:i,includeAdult:s.includeAdult,filters:s.filters[t],crowd:o.table}),n)}catch(c){if(c instanceof tn)return null;throw c}this.preferences.set(t,Si(r));const a={at:Date.now(),recommendations:r.recommendations,warnings:o.error?[o.error,...r.warnings]:r.warnings,ranking:bi};return await this.store.setMeta(`ui-picks:${t}`,JSON.stringify(a)),await this.save(),a}crowdTable(){const t=this.host.crowdTable;return t?(this.crowd??=(async()=>{try{return{table:hr(await t.call(this.host))}}catch(n){return this.crowd=null,{table:null,error:`picks from other people\'s lists unavailable: ${n instanceof Error?n.message:String(n)}`}}})(),this.crowd):Promise.resolve({table:null})}async preferencesFor(t){const n=this.preferences.get(t);if(n)return n;try{const i=await ci(this.store,null,this.user,t,nn({limit:1})),s=Si(i);return this.preferences.set(t,s),s}catch(i){if(i instanceof tn)return null;throw i}}async themesOf(t){if(!this.themes){const n=await Le(this.store,null);if(!Object.keys(n).length)return new at(n).summary(t);this.themes=new at(n)}return this.themes.summary(t)}async tagNames(){try{return Object.keys(await Le(this.store,this.client)).sort()}catch{return Object.keys(await Le(this.store,null)).sort()}}async dropPicks(t,n=nt){const i={};for(const s of nt){const o=await this.picks(s);if(!o||!n.includes(s)){i[s]=o;continue}const r={...o,recommendations:o.recommendations.filter(a=>!t(a.media))};r.recommendations.length!==o.recommendations.length&&await this.store.setMeta(`ui-picks:${s}`,JSON.stringify(r)),i[s]=r}return await this.save(),i}async excludeLabels(t,n){const i=await this.settings(),s=i.filters[t],o=Et(s),r=n.filter(h=>!o.has(h)&&!s.exclude.includes(h)),a={...i,filters:{...i.filters,[t]:{...s,exclude:[...s.exclude,...r]}}};await this.setSettings(a);const c=await this.dropPicks(h=>{const u=Xt(h);return r.some(p=>u.has(p))},[t]);return{settings:a,excluded:r,left:c}}async blacklist(t){const n=await this.setExclusions(i=>i.labels.push(...t));return await this.dropPicks(i=>{const s=Xt(i);return t.some(o=>s.has(o))}),n}async notInterested(t){return await this.setExclusions(n=>{n.titles.push(t.id),n.notInterested=[...n.notInterested??[],t.id]}),this.dropPicks(n=>n.id===t.id)}async excludeTitle(t){return await this.setExclusions(n=>n.titles.push(t.id)),this.dropPicks(n=>n.id===t.id)}async titleDetails(t){const n=this.details.get(t);if(n)return n;const i=await this.client.query(ar,{id:t}),s=_r(i.Media),o={...s,description:Ca(s.description)};return this.details.set(t,o),o}async exclusions(){return this.store.getExclusions(this.user)}async setExclusions(t){const n=structuredClone(await this.exclusions());return t(n),n.titles=[...new Set(n.titles)],n.labels=[...new Set(n.labels)],n.notInterested=[...new Set(n.notInterested??[])],await this.store.putExclusions(this.user,n),await this.save(),n}async customListNames(t){return[...(await this.store.getCustomLists(this.user,t)).keys()].sort()}async media(t){return this.store.getMedia(t)}async addToPlanning(t){if(!this.host.addToPlanning)throw new Error("this host can\'t change your list");const n=await this.store.getList(this.user,t.type);if(n.some(s=>s.mediaId===t.id))throw new Error("it\'s already on your list");await this.host.addToPlanning(t);const i={mediaId:t.id,status:"PLANNING",score:0,progress:0,repeat:0,updatedAt:Math.floor(Date.now()/1e3)};await this.store.putList(this.user,t.type,[...n,i]),await this.save()}async clear(){this.saveTimer&&clearTimeout(this.saveTimer),this.saveTimer=null,this.save=async()=>{},await this.host.saveStore(JSON.stringify(new Te().toJSON()))}async save(t=!1){this.saveTimer&&clearTimeout(this.saveTimer),this.saveTimer=null;const n=()=>this.host.saveStore(JSON.stringify(this.store.toJSON()));if(t)return n();this.saveTimer=setTimeout(()=>{this.saveTimer=null,n()},Ea)}}const Ma=2;function Si(e){const{profile:t}=e,n=t.entries,i=new Map;for(const r of n){const a=t.media.get(r.mediaId);if(a)for(const c of tt(a).keys())i.set(c,(i.get(c)??0)+1)}const s=t.model.weights().filter(([r])=>!ws.some(a=>r.startsWith(a))&&r.includes(":")&&(i.get(r)??0)>=Ma),o=n.filter(r=>r.score>0);return{onList:n.length,scored:o.length,mean:o.length?o.reduce((r,a)=>r+a.score,0)/o.length/10:null,learnedFrom:ct(n,t.media).length,likes:s.filter(([,r])=>r>0).slice(0,8),likedTags:s.filter(([r,a])=>a>0&&r.startsWith("tag:")).slice(0,10).map(([r])=>r.slice(4)),dislikes:s.filter(([,r])=>r<0).sort((r,a)=>r[1]-a[1]).slice(0,8)}}function Ca(e){return e.replace(/<br\\s*\\/?>/gi,`\n`).replace(/<[^>]+>/g,"").replace(/\\n{3,}/g,`\n\n`).trim()}function Ms(e,t,n){Cs(e);let i={step:t,controller:new AbortController,placeholder:n,latched:!1};return e.state.__activation=i,e.state.__lastAnnouncement=void 0,i}function Cs(e){let t=e.state.__activation;t&&(e.state.__activation=void 0,t.waitController?.abort(),t.controller.abort())}function Se(e,t){return e.state.__activation===t}function xs(e,t,n){e.state.__keepReturnFocus||(e.state.__activeOnDestroyed=document.activeElement),e.state.__keepReturnFocus=n,e.state.activeIndex=t}function xa(e,t){e.state.__transitionCallback=t}function Mt(e){return!!e.state.__transitionCallback}function Ei(e,t){return e.state.__transitionCallback===t}function Ia(e){let t=!!e.state.__refreshMissed;return e.state.__transitionCallback=void 0,t&&(e.state.__refreshMissed=!1),t}function La(e){e.state.__refreshMissed=!0}function Ta(e,t){let n=e.state.__activation;n&&(n.waitController?.abort(),n.waitController=void 0,n.wait=t)}function Na(e){let t=e.state.__activation;return t?.wait?(t.wait=void 0,t.waitController?.abort(),t.waitController=void 0,!0):!1}function Ue(e){return!!e.state.__activation?.wait}function an(e,t){e.state.__pendingWaitCancel=t}function Tn(e){return!!e.state.__pendingWaitCancel}function Ft(e){let t=e.state.__pendingWaitCancel;t&&(an(e),t())}function ut(e){let t=e.state.__activation;return t?.placeholder&&{...t.placeholder,step:t.step}}function fe(e){return ut(e)?.step??e.state.__activeStep}function Oa(e){let t=e.state.__activation;return t?.placeholder?(t.placeholder=void 0,!0):!1}function Mi(e,t){e.settling=t}function Pa(e,t){return!Se(e,t)||t.latched?!1:(t.latched=!0,!0)}function Da(e){e.done=!0}function ln(e,t){!Se(e,t)||Tn(e)||(t.latched=!1,t.recheck?.())}function Is(e,t){return t.latched||Tn(e)}function Ci(e,t){return!!t.settling||Is(e,t)}function Ls(e,t){let n=e.state.__activation;return n?.step===t&&!!n.done}function R(e,t,n){return t?.[n]??e.config[n]}function Nn(e){return!!R(e,e.state.activeStep,"allowPageInteraction")}function Ts(e,t){if(t.advanceOn!==void 0)return t.advanceOn||void 0;if(t.advanceOnClick!==void 0)return t.advanceOnClick?"click":void 0;let n=e.config.advanceOn;return n===void 0?e.config.advanceOnClick?"click":void 0:n||void 0}function Ra(e,t){return t.advanceOn===void 0?t.advanceOnClick??(e.config.advanceOn===void 0&&!!e.config.advanceOnClick):!1}function On(e){return e?typeof e=="string"||Array.isArray(e)?{types:[e].flat()}:{types:[e.event].flat(),when:e.when,strict:e.strict}:{types:[]}}const pe=["press0","click"],Ns={click:pe,dblclick:[...pe,"dblclick"],mousedown:pe,mouseup:pe,pointerdown:pe,pointerup:pe,contextmenu:["press2","contextmenu","auxclick"],auxclick:["press1","press2","auxclick"]};function ft(e){return e in Ns}function cn(e,t={}){e.config={animate:!0,duration:400,allowClose:!0,allowScroll:!0,overlayClickBehavior:"close",overlayOpacity:.7,smoothScroll:!1,disableActiveInteraction:!1,advanceOnClick:!1,skipMissingElement:!1,waitForElement:0,showProgress:!1,stagePadding:10,stageRadius:5,popoverOffset:10,showButtons:["next","previous","close"],disableButtons:[],overlayColor:"#000",...t}}function z(e,t,n){let i=t||e.state;return{config:e.config,state:i,driver:e.driver,index:i.activeIndex,...n?{reason:n}:{}}}function Ba(e,t,n){let i={tour:n,ui:t,config:{},state:{},consumed:new WeakSet};return cn(i,e),Object.assign(i.tour,t.controls?.(i)),i}const Os=["pointerdown","mousedown","pointerup","mouseup","click"],dn=new WeakMap;function Ps(e,t,n){Pn(e);let i=s=>{let o=s.target;e.contains(o)&&((!n||n(o))&&(s.preventDefault(),s.stopPropagation(),s.stopImmediatePropagation()),s.type==="click"&&t?.(s))};for(let s of Os)document.addEventListener(s,i,!0);dn.set(e,i)}function Pn(e){let t=dn.get(e);if(t){for(let n of Os)document.removeEventListener(n,t,!0);dn.delete(e)}}function Ee(e){return typeof e=="function"?e():typeof e=="string"?document.querySelector(e):e}const un="driver-dummy-element";function V(e){return!e||e.id==="driver-dummy-element"}const ve="driver-allowed-element",ht="driver-active-element-raised",Ds="driver-page-interactive";function pt(e){return!!e.closest(`.${ve}`)}function Fa(e){let t=window.getComputedStyle(e);return[t.overflow,t.overflowX,t.overflowY].some(n=>n==="auto"||n==="scroll")}function qe(e,t,n,i){return(e/=i/2)<1?n/2*e*e+t:-n/2*(--e*(e-2)-1)+t}const xi=\'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, audio[controls], video[controls], [contenteditable]:not([contenteditable="false"]), [tabindex]:not([tabindex="-1"]):not([disabled])\';function $a(e){return e.flatMap(t=>{let n=t.matches(xi),i=Array.from(t.querySelectorAll(xi));return[...n?[t]:[],...i]})}function ja(e){return getComputedStyle(e).pointerEvents!=="none"&&Va(e)}function Rs(e){return $a(e).filter(ja)}function Bs(e,t,n){if(!e||Ua(e))return;let i=e.offsetHeight>window.innerHeight;e.scrollIntoView({behavior:!t||za(e)?"auto":"smooth",inline:n?.inline??"center",block:n?.block??(i?"start":"center")})}function za(e){if(!e||!e.parentElement)return;let t=e.parentElement;return t.scrollHeight>t.clientHeight}function Ua(e){let t=e.getBoundingClientRect();return t.top>=0&&t.left>=0&&t.bottom<=(window.innerHeight||document.documentElement.clientHeight)&&t.right<=(window.innerWidth||document.documentElement.clientWidth)&&!Ga(e,t)}function Ii(e){let t=e.assignedSlot??e.parentElement;if(t)return t;let n=e.parentNode;return n instanceof ShadowRoot?n.host:null}function Wa(e,t){try{return e.matches(t)}catch{return!1}}function Ha(e){return/paint|strict|content/.test(e.contain||"")}function qa(e,t){return t!=="absolute"&&t!=="fixed"||(e.transform||"none")!=="none"||(e.perspective||"none")!=="none"||(e.filter||"none")!=="none"||/layout|paint|strict|content/.test(e.contain||"")||/transform|perspective|filter/.test(e.willChange||"")||t==="absolute"&&e.position!=="static"}const Ge=e=>!!e&&e!=="visible",Ve=(e,t,n)=>Math.min(Math.max(e,t),n);function $e(e){let{left:t,top:n,right:i,bottom:s}=e.getBoundingClientRect(),o=getComputedStyle(e).position;for(let r=Ii(e);r&&!(r===document.body||r===document.documentElement);r=Ii(r)){let a=getComputedStyle(r);if(!qa(a,o))continue;let c=Ha(a),h=(a.overflow||"").split(" "),u=c||Ge(a.overflowX)||Ge(h[0]),p=c||Ge(a.overflowY)||Ge(h[1]??h[0]);if(u||p){let v=r.getBoundingClientRect(),d=v.left+r.clientLeft,m=v.top+r.clientTop,g=d+(r.clientWidth||v.width),f=m+(r.clientHeight||v.height);u&&(t=Ve(t,d,g),i=Ve(i,d,g)),p&&(n=Ve(n,m,f),s=Ve(s,m,f))}if(Wa(r,":modal, :popover-open"))break;o=a.position}return new DOMRect(t,n,i-t,s-n)}function Ga(e,t){let n=$e(e);return n.width<t.width||n.height<t.height}function Va(e){return!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length)}const Li=new WeakSet;function Dn(e){let t=e.closest("dialog[open]");if(!t)return document.body;if(!("showPopover"in t))return t;let n=t.querySelector(":scope > .driver-layer");return n||(n=document.createElement("div"),n.className="driver-layer",n.setAttribute("popover","manual"),t.appendChild(n)),Li.has(t)||(Li.add(t),t.addEventListener("close",()=>{t.querySelector(":scope > .driver-layer:popover-open")?.hidePopover()})),n.matches(":popover-open")||n.showPopover(),n}function Fs(e){e?.classList.contains("driver-layer")&&!e.childElementCount&&e.remove()}function $s(e){let t=e.parentElement;e.remove(),Fs(t)}function js(e,t,n=!1){if(n&&t!==document.body){t.prepend(e);return}t.appendChild(e)}function zs(e,t,n=!1){let i=Dn(t),s=e.parentElement;return s===i?!1:(js(e,i,n),Fs(s),!0)}function Qa(e){return e instanceof HTMLElement?e.isContentEditable||!!e.closest("input, textarea, select, [role=combobox], [role=grid], [role=listbox], [role=menu], [role=menubar], [role=radiogroup], [role=slider], [role=spinbutton], [role=tablist], [role=textbox], [role=tree], [role=treegrid]"):!1}const Ya=2**31-1;function Us(e){return e>Ya}function Ti(e,t,n,i,s,o,r){let a;if(e==="start")a=t-o;else if(e==="end")a=t-i+n+o;else if(e==="center")a=t+n/2-i/2;else return 0;return Math.max(Math.min(a,s-i-r),r)}function Ct(e,t,n){let{align:i,side:s}=n,o=n.centered?"over":s,r=n.padding,{style:a,classList:c}=e.wrapper,{width:h,height:u}=e.wrapper.getBoundingClientRect(),p=h+n.offset,v=u+n.offset,d=e.arrow.getBoundingClientRect(),m=$e(t),g=m.top-v,f=g>=0,w=window.innerHeight-(m.bottom+v),_=w>=0,k=m.left-p,E=k>=0,y=window.innerWidth-(m.right+p),S=y>=0,b=d.width,M=()=>Ti(i,m.top,m.height,u,window.innerHeight,r,b),O=()=>Ti(i,m.left,m.width,h,window.innerWidth,r,b),L=!f&&!_&&!E&&!S,T=o;o==="top"&&f?S=E=_=!1:o==="bottom"&&_?S=E=f=!1:o==="left"&&E?S=f=_=!1:o==="right"&&S&&(E=f=_=!1);let A=(C,I)=>{a[C]=I===void 0?"auto":`${I}px`},N=window.innerWidth/2-h/2,U=window.innerWidth-h-b,Q=window.innerHeight-u-b;o==="over"?(A("left",N),A("right"),A("top",window.innerHeight/2-u/2),A("bottom")):L?(A("left",N),A("right"),A("bottom",10),A("top")):E?(A("left",Math.min(k,U)),A("top",M()),A("bottom"),A("right"),T="left"):S?(A("right",Math.min(y,U)),A("top",M()),A("bottom"),A("left"),T="right"):f?(A("top",Math.min(g,Q)),A("left",O()),A("bottom"),A("right"),T="top"):_&&(A("left",O()),A("bottom",Math.min(w,Q)),A("top"),A("right"),T="bottom"),Ka(e,L?"over":T,i,m);let q=`driver-popover-side-${T}`,W=`driver-popover-align-${i}`;[...c].filter(C=>C.startsWith("driver-popover-side-")||C.startsWith("driver-popover-align-")).filter(C=>C!==q&&C!==W).forEach(C=>c.remove(C)),c.contains(q)||c.add(q),c.contains(W)||c.add(W),n.onPositioned?.()}function Ni(e,t,n,i,s,o=10){let r=i-n;return e<=n&&t>=i?s==="start"?15+o/2:s==="end"?r-15-o/2:r/2:(Math.min(Math.max(e,n),i)+Math.min(Math.max(t,n),i))/2-n}function Oi(e,t,n=10){let i=t-15-n;if(i<15)return Math.max(0,(t-n)/2);let s=e-n/2;return Math.min(Math.max(s,15),i)}function Ja(e,t,n){return e==="left"||e==="right"?t.bottom>n.top&&t.top<n.bottom?e:t.bottom<=n.top?"bottom":"top":t.right>n.left&&t.left<n.right?e:t.right<=n.left?"right":"left"}function Ka(e,t,n,i){let s=e.arrow;if(s.className="driver-popover-arrow",s.style.top="",s.style.right="",s.style.bottom="",s.style.left="",t==="over"){s.classList.add("driver-popover-arrow-none");return}let o=e.wrapper.getBoundingClientRect(),r=s.getBoundingClientRect().width||10,a=Ja(t,i,o);if(s.classList.add(`driver-popover-arrow-side-${a}`),a==="left"||a==="right"){let c=Ni(i.top,i.bottom,o.top,o.bottom,n,r);s.style.top=`${Oi(c,o.height,r)}px`}else{let c=Ni(i.left,i.right,o.left,o.right,n,r);s.style.left=`${Oi(c,o.width,r)}px`}}function Xa(e){e&&(e.wrapper.style.display="none")}const Pi=new WeakMap,Di=new WeakMap;function re(e,t){Di.get(e)!==t&&(e.innerHTML=t,Di.set(e,t))}function Z(e,t){e.style.display=t?"":"none"}const Ri=new WeakSet;function Ws(e){e?.setAttribute("tabindex","-1"),e?.focus()}function Oe(e,t){let n=e.closest(".driver-popover");t&&document.activeElement===e&&(Ws(n),Ri.add(e)),e.disabled=t,e.classList.toggle(Hs,t),!t&&Ri.delete(e)&&n&&document.activeElement===n&&e.focus()}const mt="driver-popover-instruction-text",Hs="driver-popover-btn-disabled";function Za(e,t,n){let i=(e.getAttribute("aria-describedby")||"").split(/\\s+/).filter(s=>s&&s!==t);n&&i.push(t),e.setAttribute("aria-describedby",i.join(" "))}function qs(e,t){let n=G("div",t),i=e.footer.parentNode===e.wrapper?e.footer:null;return e.wrapper.insertBefore(n,i),n}function el(e){let t=qs(e,"driver-popover-instruction"),n=G("span","driver-popover-instruction-indicator");n.setAttribute("aria-hidden","true"),t.append(G("span",mt,mt),n),e.instruction=t,e.instructionIndicator=n}function tl(e,t){let n=!!t.isGated;(n||t.instruction)&&!e.instruction&&el(e);let{instruction:i,instructionIndicator:s,wrapper:o,nextButton:r}=e;if(!i||!s)return;let a=t.instruction||"";o.classList.toggle("driver-popover-has-instruction",n),o.classList.toggle("driver-popover-instruction-done",n&&!!t.isDone),Za(o,mt,!!a);let c=i.querySelector(`:scope > .${mt}`);c&&a&&re(c,a),Z(i,!!a),n?(r.setAttribute("aria-disabled","true"),r.classList.add(Hs)):r.removeAttribute("aria-disabled")}function nl(e,t){t.feedback&&!e.feedback&&(e.feedback=qs(e,"driver-popover-feedback")),e.feedback&&(re(e.feedback,t.feedback||""),Z(e.feedback,!!t.feedback))}function Gs(e,t){let{title:n,description:i,showButtons:s,disableButtons:o,showProgress:r,nextBtnText:a,prevBtnText:c,progressText:h}=t;re(e.nextButton,a),re(e.previousButton,c),re(e.progress,h),e.closeButton.setAttribute("aria-label",t.closeBtnLabel),e.nextButton.classList.toggle("driver-popover-done-btn",!!t.doneButton),n&&re(e.title,n),Z(e.title,!!n),i&&re(e.description,i),Z(e.description,!!i);let u=s.includes("next")||s.includes("previous")||r;Z(e.closeButton,s.includes("close")),Z(e.footer,u),Z(e.progress,r),Z(e.nextButton,s.includes("next")),Z(e.previousButton,s.includes("previous")),Oe(e.nextButton,o.includes("next")),Oe(e.previousButton,o.includes("previous")),Oe(e.closeButton,o.includes("close")),tl(e,t),nl(e,t);let p=e.wrapper;p.classList.remove(...Pi.get(p)||[]);let v=(t.popoverClass||"").split(/\\s+/).filter(Boolean);p.classList.add(...v),Pi.set(p,v)}function il(e,t){if(e.disabled)return!0;for(let n=e;n&&n!==t;n=n.parentElement)if(n.style?.display==="none")return!0;return!1}function sl(e,t,n){let i=document.activeElement,s=!!i&&e.wrapper.contains(i)&&i!==e.wrapper;Gs(e,n),s&&(!i.isConnected||il(i,e.wrapper))&&(e.wrapper.setAttribute("tabindex","-1"),e.wrapper.focus()),Ct(e,t,n.position),Vs(e,t,n.position)}function ol(e,t){let n=al();Dn(e).appendChild(n.wrapper);let i=n.wrapper;return i.className="driver-popover",Gs(n,t),i.style.display="block",i.style.left="",i.style.top="",i.style.bottom="",i.style.right="",i.id="driver-popover-content",i.setAttribute("role","dialog"),i.setAttribute("aria-labelledby","driver-popover-title"),n.arrow.className="driver-popover-arrow",Ps(n.wrapper,s=>{let o=s.target instanceof Element?s.target:s.target?.parentElement;if(o){if(o.closest(".driver-popover-next-btn"))return t.onNextClick?.();if(o.closest(".driver-popover-prev-btn"))return t.onPrevClick?.();if(o.closest(".driver-popover-close-btn"))return t.onCloseClick?.()}},s=>n.description.contains(s)||n.title.contains(s)?!1:!!s.closest(".driver-popover-prev-btn, .driver-popover-next-btn, .driver-popover-close-btn")),t.onRender?.(n),Ct(n,e,t.position),Vs(n,e,t.position),t.scrollIntoView!==!1&&Bs(i,t.smoothScroll,{block:"nearest",inline:"nearest"}),t.keepFocus||rl(n),n}function rl(e){let{nextButton:t,wrapper:n}=e;t.isConnected&&t.style.display!=="none"&&!t.disabled&&!t.hasAttribute("aria-disabled")&&t.focus(),document.activeElement!==t&&Ws(n)}const Bi=new WeakMap,$t=new WeakSet;function Vs(e,t,n){Bi.set(e,{anchor:t,position:n}),e.wrapper.querySelectorAll("img").forEach(i=>{if(i.complete||$t.has(i))return;$t.add(i);let s=()=>{$t.delete(i);let o=Bi.get(e);o&&e.wrapper.isConnected&&Ct(e,o.anchor,o.position)};i.addEventListener("load",s,{once:!0}),i.addEventListener("error",s,{once:!0})})}function G(e,t,n){let i=document.createElement(e);return n&&(i.id=n),i instanceof HTMLButtonElement&&(i.type="button"),i.className=t,i}function al(){let e=G("div","driver-popover");e.setAttribute("aria-describedby","driver-popover-description");let t=G("div","driver-popover-arrow"),n=G("div","driver-popover-title","driver-popover-title");n.style.display="none",n.innerText="Popover Title";let i=G("div","driver-popover-description","driver-popover-description");i.style.display="none",i.innerText="Popover description is here";let s=G("button","driver-popover-close-btn");s.innerHTML="&times;";let o=G("div","driver-popover-footer"),r=G("span","driver-popover-progress-text"),a=G("span","driver-popover-navigation-btns"),c=G("button","driver-popover-prev-btn driver-popover-footer-btn");c.innerHTML="Previous";let h=G("button","driver-popover-next-btn driver-popover-footer-btn");return h.innerHTML="Next",a.append(c,h),o.append(r,a),e.append(s,t,n,i,o),{wrapper:e,arrow:t,title:n,description:i,footer:o,previousButton:c,nextButton:h,closeButton:s,footerButtons:a,progress:r}}function Rn(e){e&&(Pn(e.wrapper),$s(e.wrapper))}const Fi="http://www.w3.org/2000/svg";function Qs(){return`0 0 ${window.innerWidth} ${window.innerHeight}`}function ll(e,t,n,i){let s=document.createElementNS(Fi,"svg");s.setAttribute("class",e),s.setAttribute("viewBox",Qs()),s.setAttribute("preserveAspectRatio","xMinYMin slice"),s.style.fillRule="evenodd";let o=document.createElementNS(Fi,"path");return o.setAttribute("d",t),o.style.fill=n,o.style.opacity=`${i}`,o.style.pointerEvents="auto",s.appendChild(o),s}function Ys(e,t){let n=e.width+t.padding*2,i=e.height+t.padding*2,s=Math.min(t.radius,n/2,i/2);return{x:e.x-t.padding,y:e.y-t.padding,width:n,height:i,radius:Math.floor(Math.max(s,0))}}function Js(e,t){let n=window.innerWidth,i=window.innerHeight,s=Ys(e,t),o=s.radius,r=s.x+o,a=s.y,c=s.width-o*2,h=s.height-o*2;return`M${n},0L0,0L0,${i}L${n},${i}L${n},0Z\n    M${r},${a} h${c} a${o},${o} 0 0 1 ${o},${o} v${h} a${o},${o} 0 0 1 -${o},${o} h-${c} a${o},${o} 0 0 1 -${o},-${o} v-${h} a${o},${o} 0 0 1 ${o},-${o} z`}function $i(e,t,n){return t>e.x&&t<e.x+e.width&&n>e.y&&n<e.y+e.height}function cl(e,t){let n=(c,h)=>t.some(u=>$i(u,c,h)),i=(c,h)=>[...new Set([e,...t].flatMap(u=>[u[c],u[c]+u[h]]))].sort((u,p)=>u-p),s=i("x","width"),o=i("y","height"),r="";s.forEach((c,h)=>{o.forEach((u,p)=>{let v=s[h+1]-c,d=o[p+1]-u,m=c+v/2,g=u+d/2;n(m,g)&&!$i(e,m,g)&&(r+=`M${c},${u}h${v}v${d}h-${v}z`)})});let a=e.radius;for(let c of[0,1])for(let h of[0,1]){let u=e.x+c*e.width,p=e.y+h*e.height,v=c?-a:a,d=h?-a:a;a&&n(u+v/2,p+d/2)&&(r+=`M${u},${p}h${v}a${a},${a} 0 0 ${c^h} ${-v},${d}z`)}return r}function dl(e,t,n,i,s){let o=e.state.__activeStagePosition,r=o||$e(i),a=$e(s);o={x:qe(t,r.x,a.x-r.x,n),y:qe(t,r.y,a.y-r.y,n),width:qe(t,r.width,a.width-r.width,n),height:qe(t,r.height,a.height-r.height,n)},Fn(e,o,s),e.state.__activeStagePosition=o}function Bn(e,t){if(!t)return;let n=$e(t),i={x:n.x,y:n.y,width:n.width,height:n.height};e.state.__activeStagePosition=i,Fn(e,i,t)}function ji(e){let t=e.state.__activeStagePosition,n=e.state.__overlaySvg;!t||!n||n.setAttribute("viewBox",Qs())}function ul(e,t,n){let i=ml(e,t);return js(i,Dn(n),!0),Ps(i,s=>{s.target.tagName==="path"&&e.tour.overlayClick()}),e.state.__overlaySvg=i,i}function fl(e){e.style.animation="none"}function hl(e,t){zs(e,t,!0)&&fl(e)}function pl(e,t){let n=e.closest("dialog");return n?cl(t,Array.from(n.querySelectorAll(".driver-allowed-element")).map(i=>i.getBoundingClientRect())):""}function Fn(e,t,n){let i=e.state.__overlaySvg??ul(e,t,n);hl(i,n);let s=i.firstElementChild;if(s?.tagName!=="path")return;let o=Ks(e),r=Js(t,o)+pl(i,Ys(t,o));s.getAttribute("d")!==r&&s.setAttribute("d",r)}function zi(e,t=!1){let n=e.state.__activeStagePosition,i=e.state.activeElement,s=e.state.__overlaySvg;n&&i&&s&&(t||s.closest("dialog"))&&Fn(e,n,i)}function Ks(e){let t=e.state.activeElement;return t&&(V(t)||pt(t))?{padding:0,radius:0}:{padding:e.config.stagePadding||0,radius:e.config.stageRadius||0}}function ml(e,t){let n=ll("driver-overlay driver-overlay-animated",Js(t,Ks(e)),e.config.overlayColor||"rgb(0,0,0)",`${e.config.overlayOpacity}`);return n.setAttribute("version","1.1"),n.style.cssText+="clip-rule:evenodd;stroke-linejoin:round;stroke-miterlimit:2;z-index:10000;position:fixed;top:0;left:0;width:100%;height:100%",n.firstElementChild.style.cursor="auto",n}function gl(e){let t=e.state.__overlaySvg;t&&(Pn(t),$s(t))}function Xs(e,t){return R(e,t,"allowedElements")}function Zs(e){return e?typeof e=="function"?Array.from(e()||[]):(Array.isArray(e)?e:[e]).flatMap(t=>typeof t=="string"?Array.from(document.querySelectorAll(t)):t?[t]:[]):[]}function vl(e,t,n){let i=Xs(e,t);if(!i)return;let s=new Set,o,r=()=>{if(n.aborted)return;let u=new Set(Zs(i));s.forEach(d=>{!u.has(d)&&d.classList.contains("driver-allowed-element")&&d.classList.remove(ve)}),u.forEach(d=>{d.classList.contains("driver-allowed-element")||d.classList.add(ve)}),s=u;let p=e.state.activeElement,v=!!p&&!V(p)&&pt(p);p&&v!==p.classList.contains("driver-active-element-raised")&&(p.classList.toggle(ht,v),zi(e,!0))},a=()=>{o===void 0&&(o=window.requestAnimationFrame(()=>{o=void 0,r(),zi(e)}))},c=new MutationObserver(u=>{let p=!1;u.forEach(v=>{let d=v.target;d.closest?.(".driver-layer, .driver-overlay, .driver-popover")||(p=!0,v.attributeName==="class"&&s.has(d)&&!d.classList.contains("driver-allowed-element")&&d.classList.add(ve))}),p&&a()}),h=typeof i=="function"||[i].flat().some(u=>typeof u=="string");r(),c.observe(document.body,{childList:!0,subtree:!0,attributes:!0,...h?{}:{attributeFilter:["class"]}}),e.state.__syncAllowedElements=r,n.addEventListener("abort",()=>{c.disconnect(),o!==void 0&&window.cancelAnimationFrame(o),s.forEach(u=>u.classList.remove(ve)),e.state.__syncAllowedElements===r&&(e.state.__syncAllowedElements=void 0)})}function eo(e,t,n){let i=document.activeElement;if(!i||i===document.body)return!1;let s=R(e,n,"disableActiveInteraction")!==!0;return!V(t)&&s&&t.contains(i)?!0:Zs(Xs(e,n)).some(o=>o.contains(i))}function wl(e){if(e.state.__liveRegion)return;let t=document.createElement("div");t.className="driver-live-region",t.setAttribute("aria-live","polite"),t.setAttribute("aria-atomic","true"),t.style.cssText="position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0",document.body.appendChild(t),e.state.__liveRegion=t}function $n(e,t){let n=e.state.__liveRegion,i=t.trim();!n||!i||e.state.__lastAnnouncement===i||(e.state.__lastAnnouncement=i,n.textContent=i)}function yl(e){e.state.__liveRegion?.remove()}function to(e,t){return!R(e,t,"skipMissingElement")||!t.element?!1:!Ee(t.element)}function gt(e,t,n){let i=e.config.steps||[];for(let s=t;s>=0&&s<i.length;s+=n)if(!to(e,i[s]))return s}function ae(e,t){let n=e.state.activeIndex;return n!==void 0&&gt(e,n+t,t)===void 0}function _l(e,t){let n=ae(e,1),i=t?.popover?.onDoneClick||e.config.onDoneClick;return n&&i?i:t?.popover?.onNextClick||e.config.onNextClick}function no(e,t){return t?.popover?.onPrevClick||e.config.onPrevClick}function io(e,t){return t?.popover?.onCloseClick||e.config.onCloseClick}function so(e,t,n){let i=(e.config.steps||[]).length;return t.replace("{{current}}",`${n+1}`).replace("{{total}}",`${i}`)}const bl=["next","previous","close"];function Al(e,t){return{index:t,hasNext:gt(e,t+1,1)!==void 0,hasPrevious:gt(e,t-1,-1)!==void 0}}function jn(e,t={},n){let i=e.config,s=t.showButtons||i.showButtons,o=i.progressText||"{{current}} of {{total}}",r={showProgress:t.showProgress??i.showProgress??!1,prevBtnText:t.prevBtnText??(i.prevBtnText||"Previous"),closeBtnLabel:t.closeBtnLabel??(i.closeBtnLabel||"Close"),popoverClass:t.popoverClass||i.popoverClass||""};return n?{...r,showButtons:bl.filter(a=>(a!=="close"||i.allowClose)&&(!s||s.includes(a))),disableButtons:[...i.disableButtons||[],...n.hasPrevious?[]:["previous"]],progressText:so(e,t.progressText||o,n.index),nextBtnText:n.hasNext?t.nextBtnText??(i.nextBtnText||"Next"):t.doneBtnText||i.doneBtnText||"Done"}:{...r,showButtons:s||[],disableButtons:t.disableButtons||i.disableButtons||[],progressText:t.progressText??o,nextBtnText:t.nextBtnText??(i.nextBtnText||"Next")}}function vt(e,t){let n=(e.config.steps||[])[t],i=n.popover||{},s=Al(e,t),o=jn(e,i,s);return{...n,popover:{showButtons:o.showButtons,nextBtnText:s.hasNext?void 0:o.nextBtnText,disableButtons:o.disableButtons,showProgress:o.showProgress,onNextClick:i.onNextClick||e.config.onNextClick||e.tour.moveNext,onPrevClick:no(e,n)||e.tour.movePrevious,onCloseClick:io(e,n)||e.tour.close,...i,progressText:o.progressText}}}function Me(e){return!!e?.popover?.instruction&&!xt(e)}const oo=new WeakSet;function xt(e){return!!e&&oo.has(e)}function kl(e){return oo.add(e),e}function ro(e,t,n){let i=e.config.stagePadding||0;return{side:n.popover?.side||"bottom",align:n.popover?.align||"start",offset:i+(e.config.popoverOffset||0),padding:i,centered:V(t),onPositioned:()=>{let s=n.popover?.onPopoverPositioned||e.config.onPopoverPositioned;s&&e.state.popover&&s(e.state.popover,z(e))}}}function Sl(e,t){let n=e.state.__activation;return n?.popoverPatch&&n.step===t?n.popoverPatch:void 0}function ao(e,t){let n=Sl(e,t),i={...t.popover,...n},s=jn(e,i);return n?.popoverClass!==void 0&&(s.popoverClass=n.popoverClass),n?.progressText!==void 0&&(s.progressText=so(e,n.progressText,e.state.activeIndex??0)),{popover:i,options:s}}function lo(e,t){let{showButtons:n,disableButtons:i}=t?ao(e,t).options:jn(e);return{showButtons:n,disableButtons:i}}function co(e,t,n){let{popover:i,options:s}=ao(e,n),o=e.state.__activation,r=Me(n);return{...s,title:i.title,description:i.description,isGated:r,isDone:r&&Ls(e,n),instruction:r||xt(n)?i.instruction:void 0,feedback:o?.step===n?o.feedback:void 0,doneButton:ae(e,1),smoothScroll:e.config.smoothScroll,scrollIntoView:R(e,n,"scrollIntoView"),onNextClick:e.tour.pressNext,onPrevClick:e.tour.previous,onCloseClick:()=>{e.state.__destroyReason="close";let a=io(e,n);return a?a(e.state.activeElement??t,n,z(e)):e.tour.requestClose()},onRender:a=>{e.state.popover=a,(i.onPopoverRender||e.config.onPopoverRender)?.(a,z(e))},position:ro(e,t,n)}}function uo(e,t,n){let i=!V(t)&&R(e,n,"disableActiveInteraction")!==!0;if(!(R(e,n,"focus")!=="element"||!i))return Rs([t])[0]}function El(e,t,n){eo(e,t,n)||uo(e,t,n)?.focus({preventScroll:!0})}function fn(e,t,n){Rn(e.state.popover);let i=eo(e,t,n)||R(e,n,"focus")==="none"||!!uo(e,t,n),s=ol(t,{...co(e,t,n),keepFocus:i});fo(e),i&&$n(e,hn(s).filter(Boolean).join(". "))}function hn(e){return[e.title,e.description,e.instruction].map(t=>!t||t.style.display==="none"?"":t.textContent||"")}function fo(e){Ue(e)&&mo(e)}function ho(e,t,n){let i=e.state.popover;i&&(sl(i,t,co(e,t,n)),fo(e))}function po(e,t,n){let i=e.state.popover;i&&Ct(i,t,ro(e,t,n))}function mo(e){let t=e.state.popover;!t||t.wrapper.style.display==="none"||(t.wrapper.classList.add("driver-popover-waiting"),t.wrapper.setAttribute("aria-busy","true"),Oe(t.nextButton,!0),Oe(t.previousButton,!0))}function Ml(e,t,n){let i=e.state.popover;!i||i.wrapper.style.display==="none"||(i.wrapper.classList.remove("driver-popover-waiting"),i.wrapper.removeAttribute("aria-busy"),t&&n&&ho(e,t,n))}function Ui(e,t){if(!Pa(e,t))return;let n=R(e,t.step,"advanceDelay")??0;if(n<=0){e.tour.next(),ln(e,t);return}Da(t),e.tour.refreshPopover(),Me(t.step)&&e.ui.announce(e,t.step.popover?.doneBtnText||e.config.doneBtnText||"Done");let i=window.setTimeout(()=>{Se(e,t)&&(e.tour.next(),ln(e,t))},n);t.controller.signal.addEventListener("abort",()=>window.clearTimeout(i))}function It(e){let t=ut(e);return{element:t?.element??e.state.activeElement,step:t?.step??e.state.activeStep}}function wt(e,t){Ta(e,t),e.ui.showWaiting(e)}function go(e,t,n,i){let s=e.state.__activation,o=R(e,t,"onWaitingForElement");if(!o||!s?.wait)return;s.waitController?.abort();let r=new AbortController;s.waitController=r,o(i,t,{...z(e),index:n,signal:r.signal})}function pn(e){let t=It(e);Na(e)&&e.ui.hideWaiting(e,t.element,t.step)}function Cl(e,t,n,i){let s=e.state.__activation,o,r=()=>{h.disconnect(),window.clearTimeout(u),o!==void 0&&window.cancelAnimationFrame(o)},a=p=>{r(),an(e),i(p),s&&ln(e,s)},c=()=>{o=void 0,Ee(t.element)&&a(!0)},h=new MutationObserver(()=>{o??(o=window.requestAnimationFrame(c))}),u=Us(n)?void 0:window.setTimeout(()=>a(!1),n);an(e,r),h.observe(document.documentElement,{childList:!0,subtree:!0,attributes:!0})}function xl(e,t){let n=vt(e,t),i=mn(e,n),s=!!e.state.activeStep;if(i==="stay"||typeof i=="string"&&!s){e.tour.drive(t,!0);return}let o=e.state.__activation;if(pn(e),typeof i=="string")return;let r=i(void 0,n,{...z(e),index:t,cause:"timeout"}),a=!e.state.isInitialized||!Se(e,o)||Tn(e);r===!1||a||e.tour.drive(t,!0)}function mn(e,t){return R(e,t,"onElementMissing")??"stay"}function Il(e,t){let n=e.state.activeIndex;if(!n)return;let i=e.config.steps||[];for(let s=n-1;t==="previousAction"&&s>=0;s--){let o=i[s];if(Me(o)&&o.element&&Ee(o.element)?.isConnected){e.tour.drive(s);return}}e.tour.drive(n-1)}function Ll(e,t){let{step:n}=t,{signal:i}=t.controller;if(!n.element)return;let s,o,r=!1,a=d=>{window.clearTimeout(o),o=void 0,r=!1,e.ui.rebind(e,d),Is(e,t)||pn(e)},c=()=>{let d=Ee(n.element);if(!d||!d.isConnected)return!1;let m=e.state.activeElement;a(d);let g=R(e,n,"onElementReplaced");return g&&d!==m&&g(d,n,{...z(e),signal:i}),!0},h=d=>{r=!0,pn(e);let m=mn(e,n);if(typeof m=="function"){m(d,n,{...z(e),cause:"removed"});return}m!=="stay"&&Il(e,m)},u=()=>{s=void 0;let d=e.state.activeElement;if(i.aborted||!d||V(d))return;if(d.isConnected){(r||o!==void 0)&&a(d);return}if(Ci(e,t)||c()||r||o||mn(e,n)==="stay")return;let m=R(e,n,"waitForRemovedElement")??R(e,n,"waitForElement")??0;if(m<=0){h(d);return}wt(e,"missing"),o=Us(m)?-1:window.setTimeout(()=>{o=void 0,!(i.aborted||Ci(e,t)||c())&&h(d)},m),go(e,n,e.state.activeIndex,d)},p=()=>{s===void 0&&(s=window.requestAnimationFrame(u))},v=new MutationObserver(p);v.observe(document.documentElement,{childList:!0,subtree:!0}),t.recheck=p,i.addEventListener("abort",()=>{v.disconnect(),window.clearTimeout(o),s!==void 0&&window.cancelAnimationFrame(s)})}function Tl(e,t){if(!t)return!1;let n=e.composedPath();return n.length>0?n.includes(t):e.target instanceof Node&&t.contains(e.target)}function Nl(e,t,n,i){let{signal:s}=n.controller,{types:o,when:r}=On(t),a=()=>Ra(e,n.step)&&Mt(e),c=g=>{let f=e.state.__advanceClick,w=g;return!f||w.detail<2||w.timeStamp-f.timeStamp>500?!1:Math.abs(w.clientX-f.clientX)<8&&Math.abs(w.clientY-f.clientY)<8},h=g=>a()||c(g),u=g=>{if(!r)return!0;let f=e.state.activeElement;return!!f&&r(f,n.step,{...z(e),event:g})},p,v,d=g=>{p===g&&(window.clearTimeout(v),p=void 0,v=void 0,Mi(n,!1),!s.aborted&&(!e.consumed.has(g)&&u(g)&&(ft(g.type)&&(e.state.__advanceClick=g),i()),n.recheck?.()))},m=g=>{Tl(g,e.state.activeElement)&&(ft(g.type)&&h(g)||(p=g,Mi(n,!0),window.clearTimeout(v),v=window.setTimeout(()=>d(g),0)))};for(let g of o)window.addEventListener(g,m,{capture:!0,signal:s}),window.addEventListener(g,d,{signal:s});s.addEventListener("abort",()=>window.clearTimeout(v))}let me;function Ol(e,t){let n=Ba(e,t,{drive:f,next:s,moveNext:o,movePrevious:r,close:()=>k("close"),destroy:k,refreshPopover:m}),i=()=>k("replaced",!1);function s(){let{element:y,step:S}=It(n),b=_l(n,S);if(!S||!b){xt(S)||o();return}ae(n,1)&&(n.state.__destroyReason="done"),b(y,S,z(n))}function o(){let y=n.state.activeIndex,S=n.config.steps||[];if(y===void 0)return;let b=y+1;S[b]?f(b):k("done")}function r(){let y=n.state.activeIndex,S=n.config.steps||[];if(y===void 0)return;let b=y-1;S[b]?f(b):k("api")}function a(y){if(!(n.config.steps||[])[y]){k("api");return}g(),f(y)}function c(){let y=n.state.__activation;!y||Ue(n)||Ui(n,y)}let h=new WeakSet;function u(y,S){let{types:b}=On(S);if(!(t.blocksInteraction&&R(n,y,"disableActiveInteraction"))||!b.length||!b.every(ft))return;let M=n.state.activeIndex,O=M!==void 0&&n.config.steps?.[M]||y;if(h.has(O))return;h.add(O);let L=M===void 0?"The highlight":`Step ${M+1}`;console.warn(`[driver.js] ${L} can\'t complete: disableActiveInteraction blocks its advanceOn events.`)}function p(y){if(!Se(n,y))return;let{step:S}=y;t.trackAllowed(n,S,y.controller.signal),Ll(n,y);let b=Ts(n,S);u(S,b),b&&Nl(n,b,y,()=>Ui(n,y))}function v(y){let S=n.state.__activation;S&&(S.popoverPatch=y?{...S.popoverPatch,...y}:void 0,m())}function d(y){let S=n.state.__activation;!S||(S.feedback||"")===y||(S.feedback=y,m(),t.announce(n,n.state.popover?.feedback?.textContent||""))}function m(){t.refreshPopover(n)}function g(){n.state.isInitialized||(me&&me!==i&&me(),me=i,n.state.isInitialized=!0,t.mount(n))}function f(y=0,S=!1){Ft(n),n.state.__destroyReason=void 0;let b=n.config.steps;if(!b){console.error("No steps to drive through"),k("api");return}if(!b[y]){k("api");return}let M=b[y],O=R(n,M,"waitForElement")??0;if(!S&&O>0&&M.element&&!Ee(M.element)){ut(n)?.index===y?wt(n,"initial"):n.state.activeStep?wt(n,"next"):(t.endInitialWait(n),t.showInitialWait(n,y)),Cl(n,M,O,L=>{L?f(y,!0):xl(n,y)}),go(n,vt(n,y),y);return}if(t.endInitialWait(n),to(n,M)){let L=n.state.activeIndex,T=typeof L=="number"&&y<L?-1:1;b[y+T]?f(y+T):T===1&&k("done");return}xs(n,y,!1),w(vt(n,y))}function w(y){let S=Ms(n,y);t.highlight(n,y),p(S)}function _(){me===i&&(me=void 0),t.detach(n),Ft(n),Cs(n),t.unmount(n);let y=n.state;return n.state={},y}function k(y,S=!0){if(!n.state.isInitialized)return;y==="api"&&(y=n.state.__destroyReason??"api");let b=!!n.state.__activeElement||!!n.state.__activeStep,M=b?n.state.__activeElement:n.state.activeElement,O=n.state.__activeStep??ut(n)?.step??n.state.activeStep??n.state.__activation?.step,L=V(M)?void 0:M,T=document.activeElement,A=!T||T===document.body||n.state.popover?.wrapper.contains(T)?n.state.__activeOnDestroyed:void 0,N=n.config.onDestroyStarted,U=fe(n)??n.state.activeStep??n.state.__activation?.step;if(S&&N&&U){n.state.__destroyReason=y,N(L,U,z(n,void 0,y));return}let Q=O?.onDeselected||n.config.onDeselected,q=n.config.onDestroyed,W=_();O&&(b&&Q&&Q(L,O,z(n,W,y)),q?.(L,O,z(n,W,y))),A&&t.restoreFocus(A)}let E={isActive:()=>n.state.isInitialized||!1,refresh:()=>t.refresh(n),drive:(y=0)=>{g(),f(y)},setConfig:y=>cn(n,y),setSteps:y=>{n.state.isInitialized?_():n.state={},cn(n,{...n.config,steps:y})},getConfig:(y=>y?n.config[y]:n.config),getState:y=>y?n.state[y]:n.state,getActiveIndex:()=>n.state.activeIndex,isFirstStep:()=>ae(n,-1),isLastStep:()=>ae(n,1),getActiveStep:()=>n.state.activeStep,getActiveElement:()=>n.state.activeElement,getPreviousElement:()=>n.state.previousElement,getPreviousStep:()=>n.state.previousStep,getNextStep:()=>{let y=n.config.steps||[],S=n.state.activeIndex;if(S===void 0)return;let b=gt(n,S+1,1);return b===void 0?void 0:y[b]},moveNext:o,movePrevious:r,moveTo:a,hasNextStep:()=>n.state.activeIndex!==void 0&&!ae(n,1),hasPreviousStep:()=>n.state.activeIndex!==void 0&&!ae(n,-1),highlight:y=>{g(),Ft(n),t.endInitialWait(n),n.state.__destroyReason=void 0,w(kl({...y,popover:y.popover?{showButtons:[],showProgress:!1,progressText:"",...y.popover}:void 0}))},updatePopover:v,advance:c,nudge:y=>{typeof y=="object"&&v(y),d(typeof y=="string"?y:""),t.nudge(n)},destroy:()=>{k("api",!1)}};return n.driver=E,E}function Pl(e,t,n){let i=e.state.__activation,s=()=>!Se(e,i),o=e.state.__activeStep,r=e.state.__activeElement||(o?void 0:t),a=n.onHighlightStarted||e.config.onHighlightStarted,c=n.onHighlighted||e.config.onHighlighted,h=o?.onDeselected||e.config.onDeselected,u=i?.controller.signal,p=z(e);if(!(o&&o!==n&&h&&(h(V(r)?void 0:r,o,p),s()))&&!(a&&(a(V(t)?void 0:t,n,{...p,signal:u}),s())))return e.state.previousStep=o,e.state.previousElement=r,e.state.activeStep=n,e.state.activeElement=t,v=>{e.state.__previousStep=o,e.state.__previousElement=r,e.state.__activeStep=n,e.state.__activeElement=v,c&&c(V(t)?void 0:v,n,{...z(e),signal:u})}}function Dl(e,t,n){return(e.state.activeStep===t?e.state.activeElement:void 0)||n}const gn={"aria-haspopup":"dialog","aria-expanded":"true","aria-controls":"driver-popover-content"},yt=new WeakSet;function Rl(e){if(!(Object.keys(gn).some(t=>e.hasAttribute(t))&&!yt.has(e))){for(let[t,n]of Object.entries(gn))e.setAttribute(t,n);yt.add(e)}}function Bl(e){if(yt.has(e)){for(let[t,n]of Object.entries(gn))e.getAttribute(t)===n&&e.removeAttribute(t);yt.delete(e)}}function vo(){let e=document.getElementById(un);if(e)return e;let t=document.createElement("div");return t.id=un,t.style.cssText="width:0;height:0;pointer-events:none;opacity:0;position:fixed;top:50%;left:50%",document.body.appendChild(t),t}function Fl(e,t){let n=Ee(t.element);n||(n=vo()),$l(e,n,t)}function vn(e,t){let n=e.state.__resizeObserver;n?.disconnect(),t&&n?.observe(t)}function wo(e){let t=e.state.__activeElement,n=e.state.__activeStep;if(!(!t||!n)){if(Mt(e)){La(e),ji(e);return}e.state.__syncAllowedElements?.(),yo(e,t),Bn(e,t),ji(e),po(e,t,n)}}function yo(e,t){let n=e.state.popover?.wrapper;n&&zs(n,t)}function $l(e,t,n){vn(e);let i=e.config.duration||400,s=Date.now(),o=e.config.animate,r=Pl(e,t,n);if(!r)return;let a=e.state.previousElement||t,c=a!==t&&o,h=!1;Xa(e.state.popover);let u=()=>{if(!Ei(e,u))return;let v=Date.now()-s,d=i-v<=i/2,m=Dl(e,n,t);if(n.popover&&d&&!h&&c&&(fn(e,m,n),h=!0),e.config.animate&&v<i)dl(e,v,i,a,m);else{if(Bn(e,m),r(m),!Ei(e,u))return;El(e,m,n);let g=Ia(e);vn(e,m),g&&wo(e);return}window.requestAnimationFrame(u)};xa(e,u),window.requestAnimationFrame(u),Un(e);let p=R(e,n,"scrollIntoView");p!==!1&&Bs(t,e.config.smoothScroll,typeof p=="object"?p:void 0),!c&&n.popover&&fn(e,t,n),zn(e),_o(e,t,n)}const _t=new WeakMap;function jl(e,t){_t.get(e)?.disconnect();let n=new MutationObserver(()=>{let i=t().filter(s=>!e.classList.contains(s));i.length>0&&e.classList.add(...i)});n.observe(e,{attributes:!0,attributeFilter:["class"]}),_t.set(e,n)}function zl(e){_t.get(e)?.disconnect(),_t.delete(e),e.classList.remove("driver-active-element","driver-no-interaction",ht),Bl(e)}function zn(e){let t=e.state.__marked?.element;new Set([t,...document.querySelectorAll(".driver-active-element")]).forEach(n=>{n&&zl(n)})}function Un(e){let t=e.state.__marked?.parent;new Set([t,...document.querySelectorAll(".driver-active-element-parent")]).forEach(n=>{n?.classList.remove("driver-active-element-parent","driver-active-element-parent-no-scroll")})}function _o(e,t,n){document.body.classList.toggle(Ds,!!R(e,n,"allowPageInteraction"));let i=R(e,n,"disableActiveInteraction")===!0;i&&t.classList.add("driver-no-interaction");let s=t.parentElement,o=s&&s!==document.body?s:void 0;o&&(o.classList.add("driver-active-element-parent"),Fa(o)&&o.classList.add("driver-active-element-parent-no-scroll")),e.state.__marked={element:t,parent:o},t.classList.add("driver-active-element"),V(t)||(Rl(t),t.classList.toggle(ht,pt(t)),jl(t,()=>["driver-active-element",...i?["driver-no-interaction"]:[],...pt(t)?[ht]:[]]))}function bo(){document.getElementById(un)?.remove()}function Ul(e){bo(),Un(e),zn(e)}function Wl(e,t){let n=e.state.activeStep;n&&(Un(e),zn(e),_o(e,t,n),e.state.activeElement=t,e.state.__activeElement=t,vn(e,t),yo(e,t),Bn(e,t),po(e,t,n))}function Ao(e,t){let n=e.state.activeElement;return!V(n)&&!!n&&t.includes(n)}function Wn(e,t){let n=e.state.popover?.wrapper;return n&&t.includes(n)?"popover":Ao(e,t)?"element":e.ui.isAllowed(e,t)?"allowed":"outside"}function Hl(e){let t=[];for(let n=e;n;)t.push(n),n=n.parentNode||(n instanceof ShadowRoot?n.host:null);return t}const ql=new Set(["pointerdown","mousedown","pointerup","mouseup"]),ko=["click","auxclick","contextmenu","dblclick"];function Gl(e){if(e instanceof MouseEvent)return ql.has(e.type)?`press${e.button}`:ko.includes(e.type)?e.type:void 0}function Vl(e,t){let{types:n,strict:i}=On(Ts(e,t));if(!(!i||!n.length))return n.every(ft)?n:void 0}function jt(e,t){let n=e.state.activeStep,i=Gl(t);if(!n||!i||!Ao(e,t.composedPath()))return;if(e.ui.blocksInteraction&&R(e,n,"disableActiveInteraction"))return"disabled";let s=Vl(e,n);if(!(!s||s.some(o=>Ns[o].includes(i))))return"strict"}function zt(e){return e.isTrusted}const Ql=["pointerdown","mousedown","touchstart"],Yl=["pointerup","mouseup","touchend"],Jl=new Set(["touchstart","touchend"]),Kl=new Set(["pointerdown","mousedown","pointerup","mouseup","click"]);function So(e,t){t.preventDefault(),t.stopImmediatePropagation(),e.consumed.add(t)}function Ut(e,t){if(!e.ui.blocksInteraction||Nn(e))return;let n=t.composedPath();if(Wn(e,n)!=="outside")return;let i=n[0];if(i===document.body||i===document.documentElement)return"root";let s=e.state.__overlaySvg;if(s&&n.includes(s))return"overlay"}function Wt(e){Kl.has(e.type)&&e.preventDefault(),e.stopImmediatePropagation()}function Xl(e,t){if(!e.state.isInitialized)return;let n=e.state.activeStep,i=R(e,n,"onInteraction");if(!n||!i||t.type==="auxclick"&&t.button===2)return;let s=Wn(e,t.composedPath());if(s==="popover")return;let o=e.state.activeElement;i(V(o)?void 0:o,n,{...z(e),event:t,region:s})===!1&&So(e,t)}function Zl(e){let t=new AbortController,n=!1,i=a=>{!e.state.isInitialized||!zt(a)||(n=!!Ut(e,a),(n||jt(e,a))&&Wt(a))},s=a=>{!e.state.isInitialized||!zt(a)||(n&&Ut(e,a)||jt(e,a))&&Wt(a)},o=a=>{if(Xl(e,a),!e.state.isInitialized||e.consumed.has(a)||!zt(a))return;let c=a.type==="dblclick"||a.type==="auxclick"&&a.button===2;if(n&&Ut(e,a)==="root"){Wt(a),Me(e.state.activeStep)&&!c&&e.ui.nudge(e);return}let h=jt(e,a);h&&(So(e,a),h==="strict"&&!c&&e.ui.nudge(e))},r=(a,c)=>{window.addEventListener(a,c,{capture:!0,passive:Jl.has(a)||void 0,signal:t.signal})};return Ql.forEach(a=>r(a,i)),Yl.forEach(a=>r(a,s)),ko.forEach(a=>r(a,o)),()=>t.abort()}function ec(e,t){let n=Wn(e,t);return n==="element"||n==="allowed"||n==="outside"&&Nn(e)}function Eo(e,t){return Qa(t[0])&&ec(e,t)}function Mo(e){return Eo(e,Hl(document.activeElement))}function ie(e){return e.code||e.key}function Hn(e){let t=e.state.__handledKeys;return t||(t=new Set,e.state.__handledKeys=t),t}function Co(e,t){let n=e.state.__pressedKeys,i=ie(t);return n?.has(i)?n.get(i)!==e.state.__activation:t.repeat}function tc(e){let t=new AbortController,n=new Map;e.state.__pressedKeys=n;let i=s=>{let o=s;o.type==="keydown"&&!o.repeat&&n.set(ie(o),e.state.__activation);let r=e.state.popover?.wrapper;r&&o.composedPath().includes(r)&&Co(e,o)&&o.preventDefault()};return["keydown","keypress","keyup"].forEach(s=>window.addEventListener(s,i,{capture:!0,signal:t.signal})),window.addEventListener("blur",()=>{e.state.__widgetKey=void 0,n.clear()},{signal:t.signal}),()=>t.abort()}function Pe(e){let t=e.state.__resizeTimeout;t&&window.cancelAnimationFrame(t),e.state.__resizeTimeout=window.requestAnimationFrame(()=>wo(e))}function nc(e){let t=e.state.__activeElement?.getBoundingClientRect();!t||t.width===0&&t.height===0||Pe(e)}function ic(e,t){if(!e.state.isInitialized||!(t.key==="Tab"||t.keyCode===9)||Nn(e))return;let n=e.state.__activeElement,i=e.state.popover?.wrapper,s=[...new Set(Rs([...i?[i]:[],...n?[n]:[],...Array.from(document.querySelectorAll(`.${ve}`))]))],o=s[0],r=s[s.length-1];t.preventDefault(),t.shiftKey?(s[s.indexOf(document.activeElement)-1]||r)?.focus():(s[s.indexOf(document.activeElement)+1]||o)?.focus()}function sc(e,t){Hn(e).add(ie(t)),(Eo(e,t.composedPath())||Mo(e))&&(e.state.__widgetKey=ie(t))}function oc(e,t){let n=ie(t);!t.defaultPrevented&&e.state.__widgetKey!==n&&Hn(e).delete(n)}function rc(e,t){let n=e.config.allowKeyboardControl??!0,i=Hn(e).delete(ie(t)),s=Co(e,t);e.state.__pressedKeys?.delete(ie(t)),e.state.__widgetKey===ie(t)&&(e.state.__widgetKey=void 0),!(!n||i||s||Mo(e))&&(t.key==="Escape"?e.tour.escape():t.key==="ArrowRight"?e.tour.arrowRight():t.key==="ArrowLeft"&&e.tour.arrowLeft())}function ac(e){if(e.state.__events)return;let t=h=>rc(e,h),n=h=>{oc(e,h),ic(e,h)},i=h=>sc(e,h),s=()=>Pe(e),o=h=>{h.target instanceof Node&&e.state.popover?.wrapper.contains(h.target)||Pe(e)};e.state.__events={onKeyup:t,onKeydown:n,onKeydownCapture:i,onResize:s,onScroll:o},typeof ResizeObserver<"u"&&(e.state.__resizeObserver=new ResizeObserver(()=>nc(e)));let r=new MutationObserver(()=>Pe(e));r.observe(document.documentElement,{attributes:!0,attributeFilter:["open"],subtree:!0}),e.state.__openObserver=r;let a=Zl(e),c=tc(e);e.state.__teardownGate=()=>{a(),c()},window.addEventListener("keydown",i,!0),window.addEventListener("keyup",t,!1),window.addEventListener("keydown",n,!1),window.addEventListener("resize",s),window.addEventListener("scroll",o,!0),document.addEventListener("close",s,!0)}function lc(e){let t=e.state.__events;t&&(window.removeEventListener("keyup",t.onKeyup),window.removeEventListener("keydown",t.onKeydown),window.removeEventListener("keydown",t.onKeydownCapture,!0),e.state.__teardownGate?.(),e.state.__resizeObserver?.disconnect(),e.state.__openObserver?.disconnect(),window.removeEventListener("resize",t.onResize),document.removeEventListener("close",t.onResize,!0),window.removeEventListener("scroll",t.onScroll,!0))}function xo(e){let t=e.state.__activation?.step??fe(e);return!Ue(e)&&!Me(t)}function qn(e){let t=e.state.__activation;return Me(t?.step??fe(e))?(!(t&&Ls(e,t.step))&&!Ue(e)&&e.ui.nudge(e),!0):!1}function Io(e,t){if(t==="previous"&&Ue(e)||t==="next"&&!xo(e))return!1;let n=lo(e,fe(e));return n.showButtons.includes(t)&&!n.disableButtons.includes(t)}function Lo(e,t="close"){e.config.allowClose&&e.tour.destroy(t)}function cc(e){lo(e,fe(e)).disableButtons.includes("close")||Lo(e,"escape")}function dc(e){qn(e)||e.tour.next()}function To(e){let{element:t,step:n}=It(e),i=no(e,n);if(!n||!i){xt(n)||e.tour.movePrevious();return}i(t,n,z(e))}function uc(e){let t=e.config.overlayClickBehavior;if(!(typeof t!="function"&&t!=="none"&&qn(e))){if(e.config.allowClose&&t==="close"){e.tour.destroy("overlay");return}if(typeof t=="function"){e.state.__destroyReason="overlay";let n=fe(e)??e.state.activeStep;n&&t(e.state.__activeElement,n,z(e));return}t==="nextStep"&&xo(e)&&e.tour.next()}}function fc(e){let t=e.state.activeIndex;Mt(e)||t===void 0||!e.state.__activeStep||!(e.config.steps||[])[t-1]||!Io(e,"previous")||To(e)}function hc(e){let t=e.state.activeIndex!==void 0&&!!fe(e);Mt(e)||!t||qn(e)||!Io(e,"next")||e.tour.next()}function pc(e){return{pressNext:()=>dc(e),previous:()=>To(e),requestClose:()=>Lo(e),overlayClick:()=>uc(e),escape:()=>cc(e),arrowLeft:()=>fc(e),arrowRight:()=>hc(e)}}const wn="driver-popover-nudge",Qe=new WeakMap;function mc(){let e=getComputedStyle(document.documentElement).getPropertyValue("--driver-nudge-duration").trim(),t=parseFloat(e);return Number.isNaN(t)?500:e.endsWith("ms")||!e.endsWith("s")?t:t*1e3}function gc(e,t){window.clearTimeout(Qe.get(e));let n=()=>{window.clearTimeout(Qe.get(e)),Qe.delete(e),e.removeEventListener("animationend",i),t()},i=s=>{let o=s.animationName;o&&!o.startsWith("driver-nudge")||n()};e.addEventListener("animationend",i),Qe.set(e,window.setTimeout(n,mc()+150))}function vc(e){e.classList.remove(wn),e.offsetWidth,e.classList.add(wn)}function wc(e){let t=e.state.popover?.wrapper;!e.state.isInitialized||!t||!t.isConnected||t.style.display==="none"||(vc(t),gc(t,()=>t.classList.remove(wn)))}function yc(e){document.body.classList.add("driver-active",e.config.animate?"driver-fade":"driver-simple"),e.config.allowScroll||document.body.classList.add("driver-no-scroll"),document.body.style.setProperty("--driver-animation-duration",`${e.config.duration||400}ms`),ac(e),wl(e)}function _c(){document.body.classList.remove("driver-active","driver-fade","driver-simple","driver-no-scroll",Ds),document.body.style.removeProperty("--driver-animation-duration")}function bc(e){lc(e),yl(e),Rn(e.state.popover),Ul(e),gl(e)}function Ac(e,t){let n=vt(e,t);if(!n.popover)return;let i=vo();xs(e,t,!0),Ms(e,n,{element:i,index:t}),fn(e,i,n),wt(e,"initial")}function kc(e){Oa(e)&&(Rn(e.state.popover),e.state.popover=void 0,bo())}function Sc(e){let t=e.state.__activation;if(!t)return;let n=e.state.popover,{element:i,step:s}=It(e);if(!n||!i||s!==t.step||n.wrapper.style.display==="none"||!n.wrapper.isConnected)return;let o=hn(n);ho(e,i,t.step),$n(e,hn(n).filter((r,a)=>r&&r!==o[a]).join(". "))}const Ec={blocksInteraction:!0,controls:pc,mount:yc,detach:_c,unmount:bc,highlight:Fl,rebind:Wl,refresh:Pe,trackAllowed:vl,isAllowed:(e,t)=>t.some(n=>n instanceof Element&&n.classList.contains("driver-allowed-element")),showWaiting:mo,hideWaiting:Ml,showInitialWait:Ac,endInitialWait:kc,refreshPopover:Sc,nudge:wc,announce:$n,restoreFocus:e=>e.focus()};function Mc(e={}){return Ol(e,Ec)}const Ht=e=>()=>[...document.querySelectorAll(`[data-tour="nav-${e}"]`)].find(n=>n.getClientRects().length>0)??document.querySelector("main")??document.body,Cc=()=>document.querySelector(\'[data-tour="filters"]\')??document.querySelector("main")??document.body;function xc(e){return[{view:"foryou",title:`Welcome to ${e}`,description:"A quick look around: three pages, under a minute. Press Skip any time to leave the tour."},{view:"foryou",target:Ht("foryou"),title:"For you",description:"Your picks, ranked from what you\'ve watched and how you scored it on AniList. Open a card for details, or mark it Not interested."},{view:"foryou",target:Cc,title:"Filters",description:"Narrow your picks by genre, format, year and more. Switch between anime and manga at the top of the page."},{view:"stats",target:Ht("stats"),title:"Stats",description:"What the recommendations learned from your lists: what you tend to enjoy and avoid."},{view:"settings",target:Ht("settings"),title:"Settings",description:"Title language, ratings, picks per page, and the titles and tags you\'ve excluded."},{view:"settings",title:"You\'re all set",description:"You can replay this tour any time from Settings."}]}const Wi=()=>new Promise(e=>requestAnimationFrame(()=>setTimeout(e)));function Ic(e){const t=xc(e.appName),n=async s=>{if(!(s<0)){if(s>=t.length){i.destroy();return}e.setView(t[s].view),await Wi(),i.moveTo(s)}},i=Mc({steps:t.map(s=>({...s.target?{element:s.target}:{},popover:{title:s.title,description:s.description}})),popoverClass:"tour-popover",showProgress:!0,progressText:"{{current}} of {{total}}",showButtons:["next","previous"],overlayClickBehavior:"none",nextBtnText:"Next",prevBtnText:"Back",doneBtnText:"Done",stageRadius:10,onNextClick:(s,o,{index:r})=>{n((r??0)+1)},onPrevClick:(s,o,{index:r})=>{n((r??0)-1)},onPopoverRender:(s,{index:o})=>{if(o===t.length-1)return;const r=document.createElement("button");r.type="button",r.className="tour-skip",r.textContent="Skip",r.addEventListener("click",()=>i.destroy()),s.footer.insertBefore(r,s.footer.firstChild)},onDestroyed:()=>e.onEnd()});e.setView("foryou"),Wi().then(()=>i.drive())}const bt="Konomi.moe",Lc=2,Tc=e=>`hsl(${Math.max(0,Math.min(120,(e-45)*2.6))}, 70%, 55%)`,yn=e=>e>=1e6?`${(e/1e6).toFixed(1)}M`:e>=1e4?`${Math.round(e/1e3)}k`:e.toLocaleString(),_n=e=>e==="ANIME"?"anime":"manga",Nc={TV:"TV",TV_SHORT:"TV short",MOVIE:"Movie",OVA:"OVA",ONA:"ONA",SPECIAL:"Special",MUSIC:"Music",MANGA:"Manga",NOVEL:"Light novel",ONE_SHOT:"One shot"},je=e=>e?Nc[e]??e:"\u2014",Gn=[["JP","Japan"],["KR","South Korea"],["CN","China"],["TW","Taiwan"]],Lt=e=>Gn.find(([t])=>t===e)?.[1]??e,Oc={FINISHED:"Finished",RELEASING:"Releasing",NOT_YET_RELEASED:"Not yet released",CANCELLED:"Cancelled",HIATUS:"On hiatus"},At=e=>Oc[e]??e;function Tt(e){const t=e.indexOf(":");return t<0?["",e]:[e.slice(0,t),e.slice(t+1)]}const No={genre:"Genre",tag:"Tag",studio:"Studio",country:"Country",format:"Format"};function te(e){const[t,n]=Tt(e);return t==="country"?Lt(n):t==="format"?je(n):n}const Nt=e=>`${No[Tt(e)[0]]??"Label"}: ${te(e)}`;function bn(e){if(e===null)return"never";const t=Math.round((Date.now()-e)/6e4);if(t<1)return"just now";if(t<60)return`${t} min ago`;const n=Math.round(t/60);return n<24?`${n} h ago`:`${Math.round(n/24)} d ago`}const J=e=>e instanceof Error?e.message:String(e),Y=(e,t)=>e.includes(t)?e.filter(n=>n!==t):[...e,t];function ye({d:e,cls:t="icon"}){return l("svg",{class:t,"aria-hidden":"true",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":"2",children:l("path",{d:e})})}const _e={foryou:"M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4z",stats:"M4 20V10M10 20V4M16 20v-7M22 20H2",settings:"M12 15a3 3 0 100-6 3 3 0 000 6zM12 2v3M12 19v3M2 12h3M19 12h3",filters:"M3 5h18M6 12h12M10 19h4",caret:"M6 9l6 6 6-6",next:"M9 6l6 6-6 6",sliders:"M4 7h9M17 7h3M15 5v4M4 17h3M11 17h9M9 15v4"};function Oo(e){return l("fieldset",{class:"seg","aria-label":e.label,children:e.options.map(([t,n])=>l("button",{type:"button",class:t===e.value?"on":"","aria-pressed":t===e.value,onClick:()=>e.onChange(t),children:n},t))})}function Hi(e){return l("label",{class:"switch",children:[l("input",{type:"checkbox","aria-label":e.label,checked:e.checked,onChange:t=>e.onChange(t.target.checked)}),l("span",{})]})}function Vn({busy:e,note:t}){const n=e.total!==void 0&&e.total>0,i=Math.min(e.done??0,e.total??0),s=n?Math.max(0,(e.total??0)-i)*Lc:0;return l("div",{class:"overlay",role:"status","aria-live":"polite",children:l("div",{class:"overlay-card",children:[l("span",{class:"spinner big"}),l("h2",{children:[e.step,"\u2026"]}),l("div",{class:`progress ${n?"":"indeterminate"}`,children:l("i",{style:n?{width:`${i/(e.total??1)*100}%`}:void 0})}),n&&s>=5&&l("p",{class:"muted",children:["About ",s<60?`${s} s`:`${Math.ceil(s/60)} min`," left"]}),t&&l("p",{class:"overlay-note",children:t})]})})}function Pc({host:e}){const[t,n]=x(null),[i,s]=x(!1),[o,r]=x(null),[a,c]=x(null),[h,u]=x(0),[p,v]=x(null),d=ee(async g=>{const{name:f}=g;v(g);try{await e.waitForSetup?.((w,_,k)=>c({step:w,done:_,total:k})).catch(()=>{}),c(null),n(await dt.open(e,f)),s(!1)}catch(w){r(J(w))}},[e]);j(()=>{e.user().then(g=>g?d(g):s(!0),g=>r(J(g)))},[e,d]);const m=ee(async()=>{p&&n(await dt.open(e,p.name))},[e,p]);return j(()=>{if(!(!t||!e.serve))return e.serve(t,()=>u(g=>g+1))},[e,t]),o?l("div",{class:"empty",children:[l("h2",{children:"Something went wrong"}),l("p",{children:o})]}):i?l(Rc,{host:e,onUser:async(g,f)=>{f&&await e.setUser?.(g.name),await d(g)}}):a?l(Vn,{busy:a,note:Po}):t?l(Bc,{session:t,avatarUrl:p?.avatarUrl??null,onCleared:m},h):l("div",{class:"empty",children:l("span",{class:"spinner"})})}function Dc({name:e,url:t}){const[n,i]=x(!1);return t&&!n?l("img",{class:"avatar",src:t,alt:"",onError:()=>i(!0)}):l("div",{class:"avatar",children:e.slice(0,1).toUpperCase()})}function Rc(e){const{host:t}=e,n=t.signIn?.bind(t),[i,s]=x(""),[o,r]=x(""),[a,c]=x("idle"),[h,u]=x(null),p=ue(!1),v=m=>{p.current||(p.current=!0,e.onUser(m,!1))},d=m=>{p.current||(u(J(m)),c("idle"))};return l("div",{class:"welcome",children:l("form",{onSubmit:m=>{m.preventDefault(),a==="waiting"&&o.trim()&&t.signInWithCode?(c("checking"),t.signInWithCode(o.trim()).then(v,d)):!n&&i.trim()&&e.onUser({name:i.trim()},!0)},children:[l("img",{class:"logo",src:Ss,alt:"",width:44,height:44}),l("h1",{children:"Find your next favourite"}),l("p",{class:"muted",children:"Recommendations learned from your own anime and manga list: what you scored, finished and dropped. Everything stays on this device."}),n?l(F,{children:[a!=="waiting"&&l("button",{type:"button",class:"btn primary signin",disabled:a==="checking","aria-busy":a==="checking",onClick:()=>{u(null),c("waiting"),n().then(v,d)},children:[a==="checking"?l("span",{class:"spinner small","aria-hidden":"true"}):l("img",{src:Es,alt:"",width:18,height:18}),a==="checking"?"Signing in\u2026":"Sign in with AniList"]}),a==="idle"&&l("p",{class:"muted signin-note",children:["You approve ",bt," on AniList, which lets it read your lists (private ones too) and add picks to your planning list. Nothing else."]}),a==="waiting"&&l(F,{children:[l("div",{class:"signin-wait",children:[l("span",{class:"spinner small","aria-hidden":"true"}),"Approve ",bt," in the AniList tab that opened."]}),t.signInWithCode&&l(F,{children:[l("label",{class:"label",for:"code",children:"Didn\'t come back here? Paste the code AniList shows"}),l("input",{id:"code",class:"field",value:o,autocomplete:"off",spellcheck:!1,placeholder:"eyJ0eXAiOiJKV1Qi\u2026",onInput:m=>r(m.target.value)}),l("button",{class:"btn primary",type:"submit",disabled:!o.trim(),style:"justify-content:center;height:42px",children:"Continue"})]}),l("button",{type:"button",class:"btn ghost",style:"justify-content:center",onClick:()=>c("idle"),children:"Start again"})]}),h&&l("p",{class:"signin-error",children:h})]}):l(F,{children:[l("label",{class:"label",for:"username",children:"AniList username"}),l("input",{id:"username",class:"field",value:i,placeholder:"Your public AniList username",onInput:m=>s(m.target.value)}),l("button",{class:"btn primary",type:"submit",style:"justify-content:center;height:42px",children:"See my picks"})]})]})})}function Bc({session:e,avatarUrl:t,onCleared:n}){const i=e.host.kind==="seanime",[s,o]=x("foryou"),[r,a]=x("ANIME"),[c,h]=x(null),[u,p]=x(null),[v,d]=x(null),m=ue(null),g=ee(b=>{d(b),m.current&&clearTimeout(m.current),m.current=setTimeout(()=>d(null),2600)},[]);j(()=>{e.settings().then(h),e.lastSynced().then(p)},[e]);const f=ee(async b=>{h(b),await e.setSettings(b)},[e]),w=ee(()=>{const b=s;Ic({appName:bt,setView:o,onEnd:async()=>{o(b),await f({...await e.settings(),tourSeen:!0})}})},[e,f,s]),[_,k]=x(!1),E=ee(()=>k(!0),[]);j(()=>k(!1),[e]);const y=ue(!1);if(j(()=>{!c||c.tourSeen||s!=="foryou"||!_||y.current||(y.current=!0,w())},[c,s,_,w]),!c)return null;const S=[["foryou","For you"],["stats","Stats"],["settings","Settings"]];return l("div",{class:`shell ${i?"host-seanime":""}`,children:[l("aside",{class:"side",children:[l("div",{class:"brand",children:[l("img",{class:"logo",src:Ss,alt:"",width:30,height:30}),bt]}),S.map(([b,M])=>l("button",{type:"button",class:`nav ${s===b?"on":""}`,"data-tour":`nav-${b}`,"aria-current":s===b?"page":void 0,onClick:()=>o(b),children:[l(ye,{d:_e[b]}),M]},b)),l("div",{class:"side-foot",children:[l("div",{class:"sync",children:[l("span",{class:"dot"}),"Synced ",bn(u)]}),l("div",{class:"me",children:[l(Dc,{name:e.user,url:t}),l("div",{children:[e.user,l("small",{children:"AniList"})]})]})]})]}),l("main",{children:[l("div",{class:"page-tabs",role:"tablist",children:[S.map(([b,M])=>l("button",{type:"button",role:"tab","aria-selected":s===b,class:`page-tab ${s===b?"on":""}`,"data-tour":`nav-${b}`,onClick:()=>o(b),children:M},b)),l("span",{class:"note",children:["Signed in through Seanime \xB7 synced ",bn(u)]})]}),s==="foryou"&&l(Fc,{session:e,kind:r,setKind:a,settings:c,saveSettings:f,setSynced:p,toast:g,onLoaded:E}),s==="stats"&&l(Xc,{session:e,kind:r,setKind:a}),s==="settings"&&l(Zc,{session:e,settings:c,saveSettings:f,toast:g,startTour:w,onCleared:n})]}),l("div",{class:`toast ${v?"show":""}`,role:"status",children:v})]})}const Po="Setting up your recommendations. The first sync reads your whole anime and manga list and fetches details from AniList, which can take up to a minute.";function Fc(e){const{session:t,kind:n,settings:i,toast:s,onLoaded:o}=e,r=i.titleLanguage,[a,c]=x(null),[h,u]=x(null),[p,v]=x(!1),[d,m]=x(!1),[g,f]=x(null),[w,_]=x(new Map),[k,E]=x(null),[y,S]=x(1),[b,M]=x(ge),O=ue(!1),L=ee((C,I,H)=>u({step:C,done:I,total:H}),[]),T=ee(async(C,I=ge)=>{if(!O.current){O.current=!0,f(null);try{C&&(v(await t.lastSynced()===null),await t.sync(L),e.setSynced(await t.lastSynced())),L("Finding your picks");const H=await t.recommend(n,L,I);c(H),M(I),I===ge&&S(1),!H&&C&&f(`No titles came back from your ${_n(n)} list, so there\'s nothing to learn from yet.`)}catch(H){f(J(H))}finally{O.current=!1,u(null),v(!1),o()}}},[t,n,L,e.setSynced,o]);j(()=>{let C=!0;return(async()=>{const I=await t.picks(n);C&&(c(I),S(1),M(Math.max(ge,I?.recommendations.length??0)),I?o():await T(await t.lastSynced()===null))})(),()=>{C=!1}},[t,n,T,o]);const A=Fe(()=>(a?.recommendations??[]).slice(0,y*i.limit),[a,y,i.limit]);j(()=>{Promise.all(A.map(async C=>[C.media.id,(await t.themesOf(C.media)).filter(I=>I.main).map(I=>I.genre)])).then(C=>_(new Map(C)))},[t,A]);const N=async C=>{const I=C[n];if(c(I),I&&I.recommendations.length<y*i.limit&&!O.current){m(!0),O.current=!0;try{c(await t.recommend(n,()=>{},b))}catch(H){f(J(H))}finally{O.current=!1,m(!1)}}},U=a?.recommendations.length??0,Q=U>A.length||U>=b,q=async()=>{U>A.length||await T(!1,b+ge),S(y+1)},W=i.filters[n];return l("section",{class:"view on",children:[l("div",{class:"head",children:[l("div",{children:[l("h1",{children:"For you"}),l("div",{class:"sub",children:a?`${n==="ANIME"?"Anime":"Manga"} picks from your AniList \xB7 updated ${bn(a.at)}`:"Picks from your AniList"})]}),l("div",{class:"tools",children:l(Oo,{label:"Anime or manga",value:n,options:[["ANIME","Anime"],["MANGA","Manga"]],onChange:e.setKind})})]}),l(zc,{session:t,advancedOpen:i.advancedOpen,setAdvancedOpen:C=>e.saveSettings({...i,advancedOpen:C}),kind:n,filters:W,busy:h!==null,version:a?.at??0,onApply:async C=>{const I=Et(C),H={...C,exclude:C.exclude.filter(Ot=>!I.has(Ot))};await e.saveSettings({...i,filters:{...i.filters,[n]:H}}),await T(!0)},onUnexclude:async C=>{const I={...W,exclude:W.exclude.filter(H=>H!==C)};await e.saveSettings({...i,filters:{...i.filters,[n]:I}}),await T(!1),s(`${te(C)} is back in this search`)}}),h&&l(Vn,{busy:h,note:p?Po:null}),d&&l("div",{class:"status",children:[l("span",{class:"spinner"}),"Finding more picks\u2026"]}),g&&l("div",{class:"warn error",children:g}),a?.warnings.map(C=>l("div",{class:"warn",children:C},C)),!h&&a===null&&!g&&l("div",{class:"empty",children:[l("h2",{children:"No picks yet"}),l("p",{children:"Press Apply above to read your lists and find picks."})]}),a&&A.length===0&&!h&&!d&&l("div",{class:"empty",children:[l("h2",{children:"Nothing matches"}),l("p",{children:"Try fewer filters or fewer exclusions."})]}),l("div",{class:"grid",children:A.map((C,I)=>l($c,{rec:C,rank:I+1,title:xe(C.media,r),mains:w.get(C.media.id)??[],showRatings:i.showRatings,onOpen:()=>E(C),onNope:async()=>{const H=xe(C.media,r);await N(await t.notInterested(C.media)),s(`Not interested in ${H}. Future picks will lean away from it.`)}},C.media.id))}),A.length>0&&Q&&l("div",{class:"more",children:l("button",{type:"button",class:"btn",disabled:h!==null,onClick:q,children:"Show more"})}),k&&l(Gc,{session:t,rec:k,title:xe(k.media,r),showRatings:i.showRatings,onClose:()=>E(null),filters:W,onExcludeLabels:async C=>{E(null);const I=await t.excludeLabels(n,C);await e.saveSettings(I.settings),await N(I.left),I.excluded.length&&s(`Excluded ${I.excluded.map(te).join(", ")} from this search`)},onPlanned:async C=>{c((await t.dropPicks(I=>I.id===C.id))[n]),s(`Added ${xe(C,r)} to your planning list`)},toast:s})]})}function $c(e){const{media:t,reasons:n}=e.rec;return l("div",{class:"card",role:"button",tabIndex:0,"aria-label":`#${e.rank} ${e.title}`,onClick:e.onOpen,onKeyDown:i=>(i.key==="Enter"||i.key===" ")&&e.onOpen(),children:[l("div",{class:"cv",children:[t.coverUrl?l("img",{src:t.coverUrl,alt:"",loading:"lazy"}):l("span",{class:"ph",children:"No cover"}),l("span",{class:`rank ${e.rank<=3?"top3":""}`,children:["#",e.rank]}),l("span",{class:"format",children:je(t.format)}),l("button",{type:"button",class:"nope",title:"Not interested: hides it and its sequels, and teaches your picks to lean away","aria-label":`Not interested in ${e.title}`,onClick:i=>{i.stopPropagation(),e.onNope()},children:"\u2715"}),e.showRatings&&t.averageScore!==null&&l("span",{class:"score",children:[l("i",{style:{background:Tc(t.averageScore)}}),t.averageScore,"%"]}),e.showRatings&&t.popularity!==null&&l("span",{class:"users",children:yn(t.popularity)})]}),l("h3",{children:e.title}),l("div",{class:"meta",children:[t.year??"\u2014",t.status?` \xB7 ${At(t.status)}`:"",t.country&&t.country!=="JP"?` \xB7 ${Lt(t.country)}`:""]}),e.mains.length>0&&l("div",{class:"main",children:["Mainly ",e.mains.join(" & ")]}),l("div",{class:"tags",children:n.slice(0,2).map(i=>l("span",{class:"pill",children:i.value},i.value))})]})}const jc=[["Last 5 years",e=>[e-4,null]],["2010s",()=>[2010,2019]],["2000s",()=>[2e3,2009]],["Before 2000",()=>[null,1999]]];function qi(e){return e.tags.length+e.countries.length+(e.minTagRank&&e.tags.length?1:0)+(e.minScore?1:0)+(e.hideListed?0:1)+(e.hideSeenAdaptations?1:0)}function zc(e){const[t,n]=x(e.filters);j(()=>n(e.filters),[e.filters]);const[i,s]=x(new Set);j(()=>{e.session.exclusions().then(f=>s(new Set(f.labels)))},[e.session]);const[o,r]=x(null);j(()=>{if(!o)return;const f=_=>{_.target.closest?.(".dd")||r(null)},w=_=>_.key==="Escape"&&r(null);return document.addEventListener("mousedown",f),document.addEventListener("keydown",w),()=>{document.removeEventListener("mousedown",f),document.removeEventListener("keydown",w)}},[o]);const a=JSON.stringify(t)!==JSON.stringify(e.filters),c=e.kind==="ANIME"?"reading":"watching",h=f=>/^\\d{4}$/.test(f.trim())?Number(f.trim()):null,u=(f,w,_,k)=>{const E=i.has(f)&&!w;return l("button",{type:"button",class:`pill btnlike ${w?"on":""} ${E?"blocked":""}`,"aria-pressed":w,disabled:E,title:E?`${_} is blacklisted in Settings`:void 0,onClick:k,children:_},f)},p=f=>l("button",{type:"button",class:"linkish",onClick:f,children:"Clear"}),v=(f,w,_,k,E)=>l("div",{class:"dd",children:[l("button",{type:"button",class:`trigger ${k?"set":""} ${o===f?"open":""}`,"aria-expanded":o===f,onClick:()=>r(o===f?null:f),children:[l("span",{class:"t-name",children:w}),_>0&&l("span",{class:"count",children:_}),l(ye,{d:_e.caret,cls:"caret"})]}),o===f&&l("div",{class:`pop ${f==="genres"?"wide":""}`,children:E})]}),d=t.yearFrom&&t.yearTo?t.yearFrom===t.yearTo?`${t.yearFrom}`:`${t.yearFrom}\u2013${t.yearTo}`:t.yearFrom?`From ${t.yearFrom}`:t.yearTo?`Until ${t.yearTo}`:null,g=[...[...t.genres.map(f=>[`genre:${f}`,f,()=>n({...t,genres:Y(t.genres,f)})]),...t.mainTheme&&t.genres.length?[["main","Main theme",()=>n({...t,mainTheme:!1})]]:[],...t.formats.map(f=>[`format:${f}`,je(f),()=>n({...t,formats:Y(t.formats,f)})]),...d?[["years",d,()=>n({...t,yearFrom:null,yearTo:null})]]:[],...t.statuses.map(f=>[`status:${f}`,At(f),()=>n({...t,statuses:Y(t.statuses,f)})]),...t.minScore?[["score",`Score ${t.minScore}%+`,()=>n({...t,minScore:0})]]:[],...t.tags.map(f=>[`tag:${f}`,f,()=>n({...t,tags:Y(t.tags,f)})]),...t.minTagRank&&t.tags.length?[["rank",`Tags ${t.minTagRank}%+`,()=>n({...t,minTagRank:0})]]:[],...t.countries.map(f=>[`country:${f}`,Lt(f),()=>n({...t,countries:Y(t.countries,f)})]),...t.hideListed?[]:[["listed","Showing my titles",()=>n({...t,hideListed:!0})]],...t.hideSeenAdaptations?[["seen",`Hiding my ${c} list`,()=>n({...t,hideSeenAdaptations:!1})]]:[]].map(([f,w,_])=>l("button",{type:"button",class:"pill btnlike on",title:`Remove ${w}`,onClick:_,children:[w," ",l("span",{class:"x",children:"\u2715"})]},f)),...t.exclude.map(f=>l("button",{type:"button",class:"pill btnlike excluded",title:`Excluded from this search. Put ${Nt(f)} back`,"aria-label":`Put ${te(f)} back in this search`,disabled:e.busy,onClick:()=>e.onUnexclude(f),children:[l("span",{class:"kind",children:"not"})," ",te(f)," ",l("span",{class:"x",children:"\u2715"})]},`not:${f}`))];return l("div",{class:"fx","data-tour":"filters",children:[l("div",{class:"fx-row",children:[v("genres","Genres",t.genres.length,t.genres.length>0,l(F,{children:[l("div",{class:"pop-grid",children:Cn.map(f=>l(qt,{on:t.genres.includes(f),text:f,blocked:i.has(`genre:${f}`),onClick:()=>n({...t,genres:Y(t.genres,f)})},f))}),l("div",{class:"pop-theme",children:l(Gt,{small:!0,label:"Enforce as main theme",checked:t.mainTheme,onChange:f=>n({...t,mainTheme:f})})}),l("div",{class:"pop-foot",children:[l("span",{class:"muted",children:"Titles must have every genre you pick"}),p(()=>n({...t,genres:[]}))]})]})),v("format","Format",t.formats.length,t.formats.length>0,l(F,{children:[l("div",{class:"pop-list",children:(Zt[e.kind]??[]).map(f=>l(qt,{on:t.formats.includes(f),text:je(f),blocked:i.has(`format:${f}`),onClick:()=>n({...t,formats:Y(t.formats,f)})},f))}),l("div",{class:"pop-foot end",children:p(()=>n({...t,formats:[]}))})]})),v("years","Released",0,!!(t.yearFrom||t.yearTo),l(F,{children:[l("div",{class:"label",children:"First released"}),l("div",{class:"years",children:[l("input",{class:"field","aria-label":"From year",placeholder:"Any",value:t.yearFrom??"",onChange:f=>n({...t,yearFrom:h(f.target.value)})}),l("span",{class:"muted",children:"to"}),l("input",{class:"field","aria-label":"To year",placeholder:"Any",value:t.yearTo??"",onChange:f=>n({...t,yearTo:h(f.target.value)})})]}),l("div",{class:"label",style:"margin-top:.85rem",children:"Quick picks"}),l("div",{class:"pills",children:jc.map(([f,w])=>l("button",{type:"button",class:"pill btnlike",onClick:()=>{const[_,k]=w(new Date().getFullYear());n({...t,yearFrom:_,yearTo:k})},children:f},f))}),l("div",{class:"pop-foot end",children:p(()=>n({...t,yearFrom:null,yearTo:null}))})]})),v("status","Status",t.statuses.length,t.statuses.length>0,l(F,{children:[l("div",{class:"pop-list",children:(Nr[e.kind]??[]).map(f=>l(qt,{on:t.statuses.includes(f),text:At(f),onClick:()=>n({...t,statuses:Y(t.statuses,f)})},f))}),l("div",{class:"pop-foot end",children:p(()=>n({...t,statuses:[]}))})]})),l("button",{type:"button",class:`adv-btn ${e.advancedOpen?"open":""}`,"aria-expanded":e.advancedOpen,onClick:()=>e.setAdvancedOpen(!e.advancedOpen),children:[l(ye,{d:_e.sliders}),"Advanced",qi(t)>0&&l("span",{class:"count",children:qi(t)}),l(ye,{d:_e.caret,cls:"caret"})]}),l(Uc,{count:g.length,children:g.length?g:l("span",{class:"muted",children:"No filters: picks from everything"})}),g.length>0&&l("button",{type:"button",class:"round small",title:"Clear all filters","aria-label":"Clear all filters",onClick:()=>n(be()),children:"\u2715"}),l("button",{type:"button",class:`btn primary ${a?"":"idle"}`,disabled:e.busy,title:a?"Unapplied changes":"Apply also rereads your lists",onClick:()=>e.onApply(t),children:["Apply",a&&l("span",{class:"dot-new"})]})]}),e.advancedOpen&&l("div",{class:"adv-body",children:[l("div",{class:"adv-col",children:[l("div",{children:[l("div",{class:"label",children:"Tags"}),l(qc,{session:e.session,kind:e.kind,version:e.version,chosen:t.tags,blocked:i,onChange:f=>n({...t,tags:f})})]}),l(Wc,{value:t.minTagRank,active:t.tags.length>0,onChange:f=>n({...t,minTagRank:f})})]}),l("div",{class:"adv-col",children:[l("div",{children:[l("div",{class:"label",children:"Country of origin"}),l("div",{class:"pills",children:Gn.map(([f,w])=>u(`country:${f}`,t.countries.includes(f),w,()=>n({...t,countries:Y(t.countries,f)})))}),l("div",{class:"label",style:"margin-top:1rem",children:"Your list"}),l("div",{class:"toggles",children:[l(Gt,{label:"Hide my titles",checked:t.hideListed,onChange:f=>n({...t,hideListed:f})}),l(Gt,{label:`Hide titles on my ${c} list`,checked:t.hideSeenAdaptations,onChange:f=>n({...t,hideSeenAdaptations:f})})]})]}),l(Hc,{value:t.minScore,onChange:f=>n({...t,minScore:f})})]})]})]})}function qt(e){const t=!!e.blocked&&!e.on;return l("button",{type:"button",role:"menuitemcheckbox","aria-checked":e.on,class:`check ${e.on?"on":""} ${t?"blocked":""}`,disabled:t,title:t?`${e.text} is blacklisted in Settings`:void 0,onClick:e.onClick,children:[l("span",{class:"box",children:e.on?"\u2713":""}),e.text]})}function Uc(e){const t=ue(null),[n,i]=x({left:!1,right:!1,hidden:0}),s=ue(e.count),o=ee(()=>{const a=t.current;if(!a)return;const c=a.scrollWidth>a.clientWidth+1,h=a.scrollLeft+a.clientWidth;i({left:c&&a.scrollLeft>1,right:c&&h<a.scrollWidth-1,hidden:[...a.children].filter(u=>u.offsetLeft+u.offsetWidth/2>h).length})},[]);j(()=>{const a=t.current;if(!a)return;const c=u=>{a.scrollWidth<=a.clientWidth||Math.abs(u.deltaX)>Math.abs(u.deltaY)||(a.scrollLeft+=u.deltaY,u.preventDefault())},h=new ResizeObserver(o);return h.observe(a),a.addEventListener("wheel",c,{passive:!1}),()=>{h.disconnect(),a.removeEventListener("wheel",c)}},[o]),j(()=>{const a=t.current;a&&e.count>s.current&&a.scrollTo({left:a.scrollWidth,behavior:"smooth"}),s.current=e.count,o()});const r=a=>{const c=t.current;c?.scrollBy({left:a*c.clientWidth*.8,behavior:"smooth"})};return l("div",{class:`chip-strip ${n.left?"fade-l":""} ${n.right?"fade-r":""}`,children:[l("div",{class:"chip-track",ref:t,onScroll:o,children:e.children}),l("button",{type:"button",class:"chip-more l","aria-label":"Scroll filters left",onClick:()=>r(-1),children:l(ye,{d:_e.next,cls:"caret"})}),l("button",{type:"button",class:"chip-more r","aria-label":`${n.hidden} more filters`,onClick:()=>r(1),children:[n.hidden>0&&`+${n.hidden}`,l(ye,{d:_e.next,cls:"caret"})]})]})}function Wc(e){const t=e.value>0;return l("div",{class:`tagmin ${t?"on":""} ${e.active?"":"idle"}`,children:[l("div",{class:"tagmin-head",children:[l("span",{children:"Minimum tag percentage"}),l("b",{children:t?`${e.value}%+`:"Off"}),t&&l("button",{type:"button",class:"linkish muted",onClick:()=>e.onChange(0),children:"Turn off"})]}),l("input",{type:"range",min:0,max:100,step:5,value:e.value,"aria-label":"Minimum tag percentage","aria-valuetext":t?`${e.value}% or more`:"Off",style:{"--p":`${e.value}%`},onInput:n=>e.onChange(Number(n.target.value))}),l("div",{class:"tagmin-ticks",children:[l("span",{children:"Off"}),l("span",{children:"25%"}),l("span",{children:"50%"}),l("span",{children:"75%"}),l("span",{children:"100%"})]}),l("div",{class:"hint",children:e.active?"Only count a tag where AniList ranks it at least this relevant to the title.":"Applies once you pick a tag."})]})}function Hc(e){const t=e.value>0;return l("div",{class:`tagmin ${t?"on":""}`,children:[l("div",{class:"tagmin-head",children:[l("span",{children:"Minimum AniList score"}),l("b",{children:t?`${e.value}%+`:"Off"}),t&&l("button",{type:"button",class:"linkish muted",onClick:()=>e.onChange(0),children:"Turn off"})]}),l("input",{type:"range",min:0,max:100,step:5,value:e.value,"aria-label":"Minimum AniList score","aria-valuetext":t?`${e.value}% or more`:"Off",style:{"--p":`${e.value}%`},onInput:n=>e.onChange(Number(n.target.value))}),l("div",{class:"tagmin-ticks",children:[l("span",{children:"Off"}),l("span",{children:"25%"}),l("span",{children:"50%"}),l("span",{children:"75%"}),l("span",{children:"100%"})]}),l("div",{class:"hint",children:"Only titles AniList\'s users average at least this high; titles without a score yet are left out."})]})}function qc(e){const[t,n]=x([]),[i,s]=x([]),[o,r]=x(""),[a,c]=x(!1);j(()=>{e.session.tagNames().then(n)},[e.session]),j(()=>{e.session.preferencesFor(e.kind).then(d=>s(d?.likedTags.slice(0,8)??[]),()=>s([]))},[e.session,e.kind,e.version]);const h=o.trim().toLowerCase(),u=d=>!e.chosen.includes(d)&&!e.blocked?.has(`tag:${d}`),p=(h?t.filter(d=>d.toLowerCase().includes(h)):t).filter(u),v=d=>{e.onChange([...e.chosen,d]),r("")};return l("div",{class:"tag-picker",children:[e.chosen.length>0&&l("div",{class:"pills",style:"margin-bottom:.5rem",children:e.chosen.map(d=>l("button",{type:"button",class:"pill btnlike on",title:`Remove ${d}`,onClick:()=>e.onChange(e.chosen.filter(m=>m!==d)),children:[d," ",l("span",{class:"x",children:"\u2715"})]},d))}),l("input",{class:"field","aria-label":"Search tags",placeholder:t.length?`Search ${t.length} AniList tags\u2026`:"Loading tags\u2026",value:o,onInput:d=>r(d.target.value),onFocus:()=>c(!0),onBlur:()=>setTimeout(()=>c(!1),150),onKeyDown:d=>{d.key==="Enter"&&p[0]&&(d.preventDefault(),v(p[0]))}}),a&&p.length>0&&l("div",{class:"tag-menu",role:"listbox",children:p.map(d=>l("button",{type:"button",role:"option","aria-selected":!1,onMouseDown:m=>m.preventDefault(),onClick:()=>v(d),children:d},d))}),i.filter(u).length>0&&l("div",{class:"pills",style:"margin-top:.5rem;align-items:center",children:[l("span",{class:"muted",style:"font-size:.78rem",children:"Your top tags:"}),i.filter(u).map(d=>l("button",{type:"button",class:"pill btnlike",onClick:()=>v(d),children:["+ ",d]},d))]})]})}function Gt(e){return l("label",{class:`toggle ${e.small?"small":""}`,children:[l("span",{class:"switch",children:[l("input",{type:"checkbox",checked:e.checked,onChange:t=>e.onChange(t.target.checked)}),l("span",{})]}),e.label]})}function Gc(e){const{session:t,rec:n,onClose:i}=e,s=n.media,o=t.host,[r,a]=x([]),[c,h]=x(null),[u,p]=x([]),[v,d]=x("idle"),[m,g]=x(null),f=ue(m);f.current=m,j(()=>{t.themesOf(s).then(a),t.titleDetails(s.id).then(h,()=>h("failed"));const b=M=>{M.key==="Escape"&&(f.current?g(null):i())};return document.addEventListener("keydown",b),document.documentElement.classList.add("dialog-open"),()=>{document.removeEventListener("keydown",b),document.documentElement.classList.remove("dialog-open")}},[t,s,i]);const w=Fe(()=>[...s.genres.map(b=>`genre:${b}`),...s.tags.filter(b=>!b.spoiler).slice(0,8).map(b=>`tag:${b.name}`),...s.studios.map(b=>`studio:${b}`),...s.format?[`format:${s.format}`]:[],...s.country?[`country:${s.country}`]:[]],[s]),_=Fe(()=>Et(e.filters),[e.filters]),k=s.scoreDistribution??[],E=Math.max(1,...k.map(([,b])=>b)),y=rs(s),S=s.type==="ANIME"?"episode":"chapter";return l(F,{children:[l("button",{type:"button",class:"scrim open",tabIndex:-1,"aria-label":"Close",onClick:i}),l("div",{class:"drawer open",role:"dialog","aria-modal":"true","aria-label":e.title,children:[l("button",{type:"button",class:"close",title:"Close","aria-label":"Close",onClick:i,children:"\u2715"}),l("div",{class:"dtop",children:[l("div",{class:"dcover",children:[s.coverUrl?l("img",{src:s.coverUrl,alt:""}):null,c&&c!=="failed"&&c.trailer&&l(Vc,{trailer:c.trailer,onOpen:async b=>{if(o.embedsTrailers&&b.site==="youtube"){g(b);return}if(!o.openTrailer){window.open(b.url,"_blank","noopener");return}try{await o.openTrailer(s,b)}catch(M){e.toast(`Couldn\'t open the trailer: ${J(M)}`)}}})]}),l("div",{class:"dinfo",children:[l("h2",{children:e.title}),l("div",{class:"muted",style:"font-size:.88rem",children:[je(s.format)," \xB7 ",s.year??"\u2014",s.status?` \xB7 ${At(s.status)}`:"",y?` \xB7 ${y} ${S}${y===1?"":"s"}`:"",s.studios[0]?` \xB7 ${s.studios[0]}`:"",s.country?` \xB7 ${Lt(s.country)}`:""]}),l("div",{class:"themes",children:r.slice(0,5).map(b=>l("span",{class:`theme ${b.main?"main":""}`,children:[b.genre,b.main?" \xB7 main theme":""]},b.genre))}),e.showRatings&&s.averageScore!==null&&l("div",{class:"ratings",children:[l("div",{class:"metrics",children:[l(Ye,{name:"Average",value:`${s.averageScore}%`}),l(Ye,{name:"Mean",value:s.meanScore!==null?`${s.meanScore}%`:"\u2014"}),l(Ye,{name:"Users",value:s.popularity!==null?yn(s.popularity):"\u2014"}),l(Ye,{name:"Favourites",value:s.favourites!==null?yn(s.favourites):"\u2014"})]}),k.length>0&&l(F,{children:[l("div",{class:"dist",children:k.map(([b,M])=>l("span",{title:`${b}: ${M.toLocaleString()} users`,style:{height:`${Math.max(3,M/E*100)}%`,background:`hsl(${(b-10)/90*120},65%,52%)`}},b))}),l("div",{class:"dist-axis",children:k.map(([b])=>l("span",{children:b},b))})]})]}),l("div",{class:"synopsis",children:c===null?"Loading the description\u2026":c==="failed"?"":c.description})]})]}),l("div",{class:"dfoot",children:[l("div",{class:"actions",children:[o.addToPlanning?l("button",{type:"button",class:`btn primary ${v==="done"||v==="listed"?"done":""}`,disabled:v!=="idle","aria-busy":v==="busy",onClick:async()=>{d("busy");try{await t.addToPlanning(s),d("done"),e.onPlanned(s)}catch(b){const M=J(b).includes("already on your list");d(M?"listed":"idle"),e.toast(M?"It\'s already on your list":`Couldn\'t add it: ${J(b)}`)}},children:v==="busy"?l(F,{children:[l("span",{class:"spinner small","aria-hidden":"true"}),"Adding\u2026"]}):v==="done"?"\u2713 On your planning list":v==="listed"?"Already on your list":"\uFF0B Add to planning"}):null,o.kind==="seanime"&&l("button",{type:"button",class:"btn",onClick:()=>o.openTitle(s),children:"Open in Seanime"}),l("button",{type:"button",class:"btn site",title:"Open on AniList",onClick:async()=>{if(!o.openOnSite){s.siteUrl&&window.open(s.siteUrl,"_blank","noopener");return}try{await o.openOnSite(s)}catch(b){e.toast(`Couldn\'t open AniList: ${J(b)}`)}},children:[l("img",{src:Es,alt:"",width:18,height:18}),"AniList"]})]}),l("div",{children:[l("div",{class:"label",children:"Exclude from this search"}),l("div",{class:"chips dtags",style:"margin:0",children:w.map(b=>{const M=_.has(b);return l("button",{type:"button",class:`pill btnlike ${u.includes(b)?"on":""} ${M?"blocked":""}`,"aria-pressed":u.includes(b),disabled:M,title:M?`You\'re filtering by ${te(b)}, so it can\'t be excluded`:Nt(b),onClick:()=>p(Y(u,b)),children:te(b)},b)})}),l("button",{type:"button",class:"btn",disabled:!u.length,style:{marginTop:".6rem",opacity:u.length?1:.5},onClick:()=>e.onExcludeLabels(u),children:u.length?`Exclude ${u.length} selected`:"Exclude selected"})]}),c===null&&l("div",{class:"muted people-loading",children:"Loading characters and staff\u2026"}),c&&c!=="failed"&&l(Kc,{details:c})]})]}),m&&l(Yc,{trailer:m,title:e.title,onClose:()=>g(null)})]})}const Do={youtube:"YouTube",dailymotion:"Dailymotion"};function Vc(e){const{trailer:t}=e,n=Do[t.site];return l("button",{type:"button",class:"trailer",title:`Watch the trailer on ${n}`,"aria-label":`Watch the trailer on ${n}`,style:t.thumbnail?{backgroundImage:`url("${t.thumbnail}")`}:void 0,onClick:()=>e.onOpen(t),children:[l("span",{class:"tr-play","aria-hidden":"true"}),l("span",{class:"tr-tag",children:["\u25B6 Trailer \xB7 ",n]})]})}function Qc(e){const t=new URL(e.embedUrl);return t.searchParams.set("autoplay","1"),e.site==="youtube"&&(t.searchParams.set("rel","0"),t.searchParams.set("playsinline","1")),t.href}function Yc(e){const{trailer:t}=e,n=Do[t.site];return l("div",{class:"player",role:"dialog","aria-modal":"true","aria-label":`Trailer: ${e.title}`,children:[l("button",{type:"button",class:"player-scrim",tabIndex:-1,"aria-label":"Close the trailer",onClick:e.onClose}),l("div",{class:"player-box",children:[l("div",{class:"player-frame",children:l("iframe",{src:Qc(t),title:`${e.title} trailer`,allow:"autoplay; encrypted-media; picture-in-picture; fullscreen",allowFullScreen:!0,referrerpolicy:"strict-origin-when-cross-origin"})}),l("div",{class:"player-bar",children:[l("span",{class:"player-title",children:e.title}),l("a",{class:"btn",href:t.url,target:"_blank",rel:"noopener noreferrer",children:["Open on ",n," \u2197"]}),l("button",{type:"button",class:"btn",onClick:e.onClose,children:"Close"})]})]})]})}const Jc={MAIN:"Main",SUPPORTING:"Supporting",BACKGROUND:"Background"};function Vt({src:e,round:t,size:n}){const i={width:`${n}px`,height:`${t?n:Math.round(n*1.33)}px`};return e?l("img",{class:`avatar-img ${t?"round":""}`,src:e,alt:"",loading:"lazy",style:i}):l("span",{class:`avatar-img ph ${t?"round":""}`,style:i})}function Kc({details:e}){return l(F,{children:[e.characters.length>0&&l("div",{children:[l("div",{class:"label",children:"Characters"}),l("div",{class:"people-grid",children:e.characters.map(t=>l("div",{class:"person",children:[l(Vt,{src:t.image,size:44}),l("div",{class:"who",children:[l("b",{children:t.name}),l("small",{children:Jc[t.role]??t.role}),t.voiceActor&&l("span",{class:"va",title:"Japanese voice actor",children:[l(Vt,{src:t.voiceActor.image,size:18,round:!0}),t.voiceActor.name]})]})]},t.id))})]}),e.staff.length>0&&l("div",{children:[l("div",{class:"label",children:"Staff"}),l("div",{class:"people-grid",children:e.staff.map(t=>l("div",{class:"person",children:[l(Vt,{src:t.image,size:38,round:!0}),l("div",{class:"who",children:[l("b",{children:t.name}),l("small",{children:t.roles.join(", ")})]})]},t.id))})]})]})}function Ye({name:e,value:t}){return l("div",{class:"metric",children:[l("span",{children:e}),l("b",{children:t})]})}function Xc(e){const[t,n]=x(void 0),[i,s]=x(null);j(()=>{n(void 0),e.session.preferencesFor(e.kind).then(n,r=>s(J(r)))},[e.session,e.kind]);const o=(r,a)=>{const c=Math.max(1e-9,...r.map(([,h])=>Math.abs(h)));return r.map(([h,u])=>{const[p,v]=Tt(h);return l("div",{class:"barrow",children:[l("span",{children:[v,l("small",{children:p})]}),l("div",{class:"bar",children:l("i",{style:{width:`${Math.abs(u)/c*100}%`,background:a}})}),l("span",{class:"muted",children:Math.abs(u).toFixed(2)})]},h)})};return l("section",{class:"view on",children:[l("div",{class:"head",children:[l("div",{children:[l("h1",{children:"Stats"}),l("div",{class:"sub",children:t?`Learned from your anime and manga lists together; showing what appears in your ${_n(e.kind)} list`:"What the recommendations learned from your lists"})]}),l("div",{class:"tools",children:l(Oo,{label:"Anime or manga",value:e.kind,options:[["ANIME","Anime"],["MANGA","Manga"]],onChange:e.setKind})})]}),i&&l("div",{class:"warn error",children:i}),t===void 0&&!i&&l(Vn,{busy:{step:"Reading your list"}}),t===null&&l("div",{class:"empty",children:[l("h2",{children:["No ",_n(e.kind)," list yet"]}),l("p",{children:"Sync your list from the For you page first."})]}),t&&l(F,{children:[l("div",{class:"stats",children:[l(Je,{name:"On your list",value:String(t.onList)}),l(Je,{name:"Scored",value:String(t.scored)}),l(Je,{name:"Your average",value:t.mean!==null?t.mean.toFixed(1):"\u2014",suffix:" / 10"}),l(Je,{name:"Learned from",value:String(t.learnedFrom)})]}),l("div",{class:"two",children:[l("div",{class:"panel",children:[l("h2",{children:"You tend to enjoy"}),o(t.likes,"linear-gradient(90deg, var(--accent), #a99cff)")]}),l("div",{class:"panel",children:[l("h2",{children:"You tend to avoid"}),o(t.dislikes,"linear-gradient(90deg, var(--accent-2), #ff9cc0)")]})]})]})]})}function Je({name:e,value:t,suffix:n}){return l("div",{class:"stat",children:[l("span",{class:"muted",children:e}),l("b",{children:[t,n&&l("span",{class:"muted",style:"font-size:1rem",children:n})]})]})}function Zc(e){const{session:t,settings:n}=e,i=t.host.kind==="seanime",s=r=>e.saveSettings({...n,...r}),o=[["english","English (Attack on Titan)"],["romaji","Romaji (Shingeki no Kyojin)"],["native","Native (\u9032\u6483\u306E\u5DE8\u4EBA)"]];return l("section",{class:"view on",children:[l("div",{class:"head",children:l("div",{children:[l("h1",{children:"Settings"}),l("div",{class:"sub",children:i?"Uses the AniList account you\'re signed in with in Seanime":`Signed in as ${t.user} \xB7 stored on this device`})]})}),l("div",{class:"settings",children:[l("h2",{class:"section",children:"Preferences"}),l(oe,{name:"Title language",hint:"Falls back to another language when AniList has none",children:l("select",{class:"field",style:"width:240px","aria-label":"Title language",value:n.titleLanguage,onChange:r=>s({titleLanguage:r.target.value}),children:o.map(([r,a])=>l("option",{value:r,children:a},r))})}),l(oe,{name:"Show AniList ratings",hint:"Score and users on cards, distribution in details",children:l(Hi,{label:"Show AniList ratings",checked:n.showRatings,onChange:r=>s({showRatings:r})})}),l(oe,{name:"Include adult titles",children:l(Hi,{label:"Include adult titles",checked:n.includeAdult,onChange:r=>s({includeAdult:r})})}),l(oe,{name:"Picks per page",hint:"Show more adds another page",children:l("select",{class:"field",style:"width:110px","aria-label":"Picks per page",value:n.limit,onChange:r=>s({limit:Number(r.target.value)}),children:[20,40,60].map(r=>l("option",{value:r,children:r},r))})}),t.host.signOut&&l(F,{children:[l("h2",{class:"section",children:"Account"}),l(oe,{name:"AniList",hint:`Signed in as ${t.user}`,children:l("button",{type:"button",class:"btn",onClick:async()=>{await t.host.signOut?.(),location.reload()},children:"Sign out"})})]}),l("h2",{class:"section",children:"Exclusions"}),l(td,{session:t,language:n.titleLanguage}),l("h2",{class:"section",children:"Help"}),l(oe,{name:"Tour",hint:"A quick look at each page",children:l("button",{type:"button",class:"btn",onClick:e.startTour,children:"Start tour"})}),l("h2",{class:"section",children:"Data"}),l(oe,{name:"Clear all data",hint:i?"Deletes this plugin\'s saved picks, settings and exclusions (your Seanime sign-in is untouched)":"Deletes everything stored locally",children:l(ed,{session:t,toast:e.toast,onCleared:e.onCleared})})]})]})}function ed(e){const[t,n]=x("idle"),i=e.session.host.kind==="seanime";return j(()=>{if(t!=="confirm")return;const o=r=>r.key==="Escape"&&n("idle");return window.addEventListener("keydown",o),()=>window.removeEventListener("keydown",o)},[t]),l(F,{children:[l("button",{type:"button",class:"btn",style:"color:var(--bad)",disabled:t==="clearing",onClick:()=>n("confirm"),children:t==="clearing"?"Clearing\u2026":"Clear"}),t!=="idle"&&l("div",{class:"overlay",children:l("div",{class:"overlay-card",role:"alertdialog","aria-modal":"true","aria-labelledby":"clear-title",children:[l("h2",{id:"clear-title",children:"Clear all data?"}),l("p",{children:[i?"Deletes this plugin\'s saved picks, settings, exclusions and synced lists. Your Seanime sign-in and your AniList account aren\'t touched.":"Deletes your saved picks, settings, exclusions and synced lists from this browser. Your AniList account isn\'t touched."," ","This can\'t be undone."]}),l("div",{class:"row-gap",children:[l("button",{type:"button",class:"btn",disabled:t==="clearing",onClick:()=>n("idle"),children:"Cancel"}),l("button",{type:"button",class:"btn",style:"color:var(--bad)",disabled:t==="clearing",onClick:async()=>{n("clearing");try{await e.session.clear(),await e.onCleared(),e.toast("All data cleared")}catch(o){e.toast(`Couldn\'t clear your data: ${J(o)}`)}n("idle")},autoFocus:!0,children:t==="clearing"?"Clearing\u2026":"Clear all data"})]})]})})]})}function oe(e){return l("div",{class:"setting",children:[l("div",{children:[e.name,e.hint&&l("small",{children:e.hint})]}),e.children]})}function td({session:e,language:t}){const[n,i]=x(null),[s,o]=x(new Map),[r,a]=x({ANIME:[],MANGA:[]});if(j(()=>{(async()=>{const d=await e.exclusions();i(d),o(await e.media([...d.titles,...d.notInterested??[]])),a({ANIME:await e.customListNames("ANIME"),MANGA:await e.customListNames("MANGA")})})()},[e]),!n)return null;const c=async d=>i(await e.setExclusions(d)),h=l("span",{class:"muted",children:"Nothing yet."}),u=n.notInterested??[],p=n.titles.filter(d=>!u.includes(d)),v=d=>{const m=s.get(d);return m?xe(m,t):`#${d}`};return l(F,{children:[l("div",{class:"panel",children:[l("h2",{children:["Not interested"," ",l("span",{class:"muted",style:"font-weight:400;font-size:.8rem",children:"hidden, and your picks lean away from them"})]}),l("div",{class:"chips",style:"margin:0",children:u.length?u.map(d=>l(Qt,{text:v(d),onRemove:()=>c(m=>{m.titles=m.titles.filter(g=>g!==d),m.notInterested=(m.notInterested??[]).filter(g=>g!==d)})},d)):h})]}),l("div",{class:"panel",children:[l("h2",{children:["Excluded titles"," ",l("span",{class:"muted",style:"font-weight:400;font-size:.8rem",children:"sequels follow"})]}),l("div",{class:"chips",style:"margin:0",children:p.length?p.map(d=>l(Qt,{text:v(d),onRemove:()=>c(m=>m.titles=m.titles.filter(g=>g!==d))},d)):h})]}),l("div",{class:"panel",children:[l("h2",{children:["Blacklisted"," ",l("span",{class:"muted",style:"font-weight:400;font-size:.8rem",children:"always left out of every search; exclude from a title to leave it out of one search"})]}),l(id,{session:e,taken:new Set(n.labels),onAdd:async d=>i(await e.blacklist([d]))}),l("div",{class:"chips",style:"margin:.6rem 0 0",children:n.labels.length?n.labels.map(d=>l(Qt,{text:te(d),title:Nt(d),onRemove:()=>c(m=>m.labels=m.labels.filter(g=>g!==d))},d)):h})]}),l("div",{class:"panel",children:[l("h2",{children:"Excluded custom lists"}),nt.map(d=>l("div",{class:"chips",style:"margin:.2rem 0",children:[l("span",{class:"muted",style:"width:60px",children:d==="ANIME"?"Anime":"Manga"}),r[d].length?r[d].map(m=>{const g=n.customLists[d].includes(m);return l("button",{type:"button",class:`pill btnlike ${g?"on":""}`,"aria-pressed":g,onClick:()=>c(f=>{f.customLists[d]=Y(f.customLists[d],m)}),children:m},m)}):l("span",{class:"muted",children:"No custom lists"})]},d))]})]})}function Qt({text:e,title:t,onRemove:n}){return l("button",{type:"button",class:"pill btnlike",title:`Remove ${t??e}`,onClick:n,children:[e," ",l("span",{class:"x",children:"\u2715"})]})}function nd(e){const t=[...new Set([...Zt.ANIME??[],...Zt.MANGA??[]])];return[...Cn.map(n=>`genre:${n}`),...e.map(n=>`tag:${n}`),...Gn.map(([n])=>`country:${n}`),...t.map(n=>`format:${n}`)]}function id(e){const[t,n]=x([]),[i,s]=x(""),[o,r]=x(!1);j(()=>{e.session.tagNames().then(n)},[e.session]);const a=i.trim().toLowerCase(),c=a?nd(t).filter(v=>!e.taken.has(v)&&Nt(v).toLowerCase().includes(a)).slice(0,40):[],h=`studio:${i.trim()}`,u=a&&!e.taken.has(h)?[...c,h]:c,p=v=>{e.onAdd(v),s("")};return l("div",{class:"tag-picker",children:[l("input",{class:"field","aria-label":"Blacklist a genre, tag, country, format or studio",placeholder:"Add a genre, tag, country, format or studio\u2026",value:i,onInput:v=>s(v.target.value),onFocus:()=>r(!0),onBlur:()=>setTimeout(()=>r(!1),150),onKeyDown:v=>{v.key==="Enter"&&u[0]&&(v.preventDefault(),p(u[0]))}}),o&&u.length>0&&l("div",{class:"tag-menu",role:"listbox",children:u.map(v=>l("button",{type:"button",role:"option","aria-selected":!1,onMouseDown:d=>d.preventDefault(),onClick:()=>p(v),children:[l("span",{class:"muted",children:No[Tt(v)[0]]})," ",te(v)]},v))})]})}function sd(e,t=document.body){Go(l(Pc,{host:e}),t)}const od="rpc",rd="rpc-reply",ad="seanime",Ro=6e4,ld=1e3;function cd(e,t=Ro){let n=1;const i=new Map;return e.on(rd,s=>{const o=s,r=i.get(o?.id);r&&(i.delete(o.id),clearTimeout(r.timer),o.ok?r.resolve(o.result):r.reject(new Error(o.error)))}),function(o,...r){const a=n++;return new Promise((c,h)=>{const u=setTimeout(()=>{i.delete(a),h(new Error(`Seanime didn\'t answer (${o})`))},t);i.set(a,{resolve:c,reject:h,timer:u}),e.send(od,{id:a,method:o,args:r})})}}function dd(e,t=Ro,n=ld){const i=cd(e,t);return{kind:"seanime",transport:Xo({}),user:async()=>({name:ad}),waitForSetup:async s=>{for(;;){const o=await i("setupStatus");if(!o.running)return;s(o.step??"Setting up",o.done,o.total),await new Promise(r=>setTimeout(r,n))}},list:s=>i("list",s),loadStore:()=>i("loadStore"),saveStore:async s=>{await i("saveStore",s)},addToPlanning:async s=>{await i("addToPlanning",s.id,s.type)},openTitle:s=>{i("openTitle",s.id,s.type)},openOnSite:async s=>{const o=s.siteUrl??`https://anilist.co/${s.type.toLowerCase()}/${s.id}`;await i("openOnSite",o,s.titles?.english??s.title)},openTrailer:async(s,o)=>{await i("openTrailer",o.url,s.titles?.english??s.title)},crowdTable:()=>ud("https://raw.githubusercontent.com/AbnormallyGrim/konomi-moe/refs/heads/main/seanime/release/crowd-737ddba84b51.bin")}}async function ud(e){const t=await fetch(e);if(!t.ok)throw new Error(`the table didn\'t download (${t.status})`);return t.arrayBuffer()}const Gi=window.webview;Gi?sd(dd(Gi),document.getElementById("app")??document.body):document.body.textContent="This page only works inside Seanime.";</script>\n    <style rel="stylesheet" crossorigin>.driver-layer{width:auto!important;max-width:none!important;height:auto!important;max-height:none!important;color:inherit!important;pointer-events:none!important;background:0 0!important;border:0!important;margin:0!important;padding:0!important;position:fixed!important;inset:0!important;overflow:visible!important}.driver-layer::backdrop{display:none}.driver-layer .driver-popover{pointer-events:auto}.driver-popover{all:unset;font-family:var(--driver-popover-font-family,"Helvetica Neue", Inter, ui-sans-serif, "Apple Color Emoji", Helvetica, Arial, sans-serif);box-sizing:border-box;pointer-events:auto;color:#2d2d2d;z-index:1000000000;background-color:#fff;border-radius:5px;min-width:250px;max-width:300px;margin:0;padding:15px;position:fixed;top:0;right:0;box-shadow:0 1px 10px #0006}.driver-popover-title{zoom:1;margin:0;font-size:19px;font-weight:700;line-height:1.5;display:block;position:relative}.driver-popover-close-btn{all:unset;cursor:pointer;color:#d2d2d2;z-index:1;text-align:center;width:32px;height:28px;font-size:18px;font-weight:500;transition:color .2s;position:absolute;top:0;right:0}.driver-popover-close-btn:hover,.driver-popover-close-btn:focus-visible{color:#2d2d2d}.driver-popover-title:not([style*=none])+.driver-popover-description{margin-top:5px}.driver-popover-description{zoom:1;margin-bottom:0;font-size:14px;font-weight:400;line-height:1.5}.driver-popover-footer{text-align:right;zoom:1;justify-content:space-between;align-items:center;margin-top:15px;display:flex}.driver-popover-progress-text{color:#727272;zoom:1;font-size:13px;font-weight:400}.driver-popover-footer-btn{all:unset;box-sizing:border-box;color:#2d2d2d;cursor:pointer;zoom:1;background-color:#fff;border:1px solid #ccc;border-radius:3px;outline:0;padding:3px 7px;font-size:12px;line-height:1.3;text-decoration:none;display:inline-block}.driver-popover-footer .driver-popover-btn-disabled{opacity:.5;pointer-events:none}.driver-popover-footer-btn:hover,.driver-popover-footer-btn:focus-visible{background-color:#f7f7f7}.driver-popover-navigation-btns{flex-grow:1;justify-content:flex-end;display:flex}.driver-popover-navigation-btns button+button{margin-inline-start:4px}.driver-popover-arrow{content:"";border:5px solid #fff;position:absolute}.driver-popover-arrow-side-over{display:none}.driver-popover-arrow-side-left{border-top-color:#0000;border-bottom-color:#0000;border-right-color:#0000;left:100%}.driver-popover-arrow-side-right{border-top-color:#0000;border-bottom-color:#0000;border-left-color:#0000;right:100%}.driver-popover-arrow-side-top{border-bottom-color:#0000;border-left-color:#0000;border-right-color:#0000;top:100%}.driver-popover-arrow-side-bottom{border-top-color:#0000;border-left-color:#0000;border-right-color:#0000;bottom:100%}.driver-popover-arrow-side-center,.driver-popover-arrow-none{display:none}.driver-active .driver-overlay{pointer-events:none}.driver-active.driver-no-scroll{overflow:hidden}.driver-active :where(:not(.driver-page-interactive *,.driver-active-element,.driver-active-element *,.driver-allowed-element,.driver-allowed-element *,.driver-popover,.driver-popover *)){pointer-events:none}.driver-page-interactive .driver-overlay path{pointer-events:none!important}.driver-active .driver-active-element,.driver-popover{pointer-events:auto}.driver-active .driver-allowed-element{pointer-events:auto;z-index:var(--driver-allowed-z-index,10001)}.driver-active .driver-active-element-raised{outline:var(--driver-raised-highlight-width,2px) solid var(--driver-raised-highlight-color,#2563eb);outline-offset:var(--driver-raised-highlight-offset,-2px);box-shadow:inset 0 0 0 100vmax var(--driver-raised-highlight-background,#2563eb1a)}@keyframes animate-fade-in{0%{opacity:0}to{opacity:1}}.driver-fade .driver-overlay{animation:animate-fade-in var(--driver-animation-duration,.4s) ease-in-out}.driver-fade .driver-popover{animation:animate-fade-in var(--driver-animation-duration,.4s)}.driver-active-element-parent-no-scroll{overflow:hidden!important}.driver-no-interaction,.driver-no-interaction *{pointer-events:none!important}.driver-popover.driver-popover-waiting .driver-popover-title,.driver-popover.driver-popover-waiting .driver-popover-description,.driver-popover.driver-popover-waiting .driver-popover-footer{opacity:.55;transition:opacity .15s ease-in-out}@keyframes driver-nudge-shake{0%,to{transform:translate(0)}20%{transform:translate(calc(-1 * var(--driver-nudge-distance,6px)))}40%{transform:translate(var(--driver-nudge-distance,6px))}60%{transform:translate(calc(-.5 * var(--driver-nudge-distance,6px)))}80%{transform:translate(calc(.5 * var(--driver-nudge-distance,6px)))}}@keyframes driver-nudge-flash{0%{box-shadow:0 0 0 3px var(--driver-nudge-color,#f59e0b)}to{box-shadow:0 0 0 3px #0000}}.driver-popover.driver-popover-nudge{animation:driver-nudge-shake var(--driver-nudge-duration,.5s) ease-in-out}.driver-fade .driver-popover.driver-popover-nudge{animation:animate-fade-in var(--driver-animation-duration,.4s),driver-nudge-shake var(--driver-nudge-duration,.5s) ease-in-out}@media(prefers-reduced-motion:reduce){.driver-popover.driver-popover-nudge{animation:driver-nudge-flash var(--driver-nudge-duration,.5s) ease-out}.driver-fade .driver-popover.driver-popover-nudge{animation:animate-fade-in var(--driver-animation-duration,.4s),driver-nudge-flash var(--driver-nudge-duration,.5s) ease-out}}.driver-popover-instruction{padding:var(--driver-instruction-padding,8px 10px);border-radius:var(--driver-instruction-radius,4px);background-color:var(--driver-instruction-background,#f2f2f2);color:var(--driver-instruction-color,inherit);align-items:flex-start;gap:10px;margin-top:12px;font-size:14px;line-height:1.5;display:flex}.driver-popover-instruction-text{overflow-wrap:break-word;flex:1;min-width:0}.driver-popover-instruction-indicator{--size:var(--driver-instruction-indicator-size,8px);box-sizing:border-box;width:var(--size);height:var(--size);margin:calc((1.5em - var(--size)) / 2) 2px 0;background-color:var(--driver-instruction-indicator-color,#f59e0b);border-radius:50%;flex:none;animation:1.6s ease-in-out infinite driver-instruction-pulse}:where(.driver-popover:not(.driver-popover-has-instruction)) .driver-popover-instruction-indicator{display:none}@keyframes driver-instruction-pulse{50%{opacity:.35;transform:scale(.7)}}.driver-popover-instruction-done .driver-popover-instruction{background-color:var(--driver-instruction-done-background,#dcfce7);color:var(--driver-instruction-done-color,#15803d)}.driver-popover-instruction-done .driver-popover-instruction-indicator{width:calc(var(--size) * .7);height:calc(var(--size) * 1.3);margin-top:calc((1.5em - var(--size) * 1.3) / 2 - 1px);background:0 0;border:2px solid;border-width:0 2px 2px 0;border-radius:0;animation:none;transform:rotate(45deg)}.driver-popover-footer .driver-popover-btn-disabled[aria-disabled]{pointer-events:auto;cursor:default;opacity:1;color:var(--driver-instruction-next-color,#a3a3a3);background-color:#fff}.driver-popover-instruction-done .driver-popover-footer .driver-popover-next-btn{border-color:var(--driver-instruction-done-color,#15803d);background-color:var(--driver-instruction-done-color,#15803d);color:#fff}.driver-popover-nudge .driver-popover-instruction{box-shadow:0 0 0 2px var(--driver-instruction-indicator-color,#f59e0b)}@media(prefers-reduced-motion:reduce){.driver-popover-instruction-indicator{animation:none}}.driver-popover-feedback{color:var(--driver-feedback-color,#b45309);overflow-wrap:break-word;margin-top:8px;font-size:13px;line-height:1.4}:root{--bg: #0d0f14;--surface: #151821;--surface-2: #1c202b;--surface-3: #252a37;--line: #2a2f3c;--text: #e9ebf1;--muted: #8d94a6;--faint: #5d6476;--accent: #8b7bff;--accent-2: #ff6fa3;--accent-soft: rgba(139, 123, 255, .14);--good: #4ade80;--ok: #facc15;--bad: #f87171;--radius: 14px;--shadow: 0 10px 30px rgba(0, 0, 0, .35);color-scheme:dark}[data-theme=light]{--bg: #f5f6fa;--surface: #ffffff;--surface-2: #f0f1f6;--surface-3: #e6e8ef;--line: #e1e4ec;--text: #171a22;--muted: #646b7d;--faint: #9aa0ae;--accent: #6b5cf0;--accent-2: #e5508a;--accent-soft: rgba(107, 92, 240, .1);--shadow: 0 10px 30px rgba(20, 24, 40, .12);color-scheme:light}*{box-sizing:border-box}html,body{margin:0}body{font:14px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;background:var(--bg);color:var(--text);-webkit-font-smoothing:antialiased}button{font:inherit;color:inherit}a{color:var(--accent);text-decoration:none}h1,h2,h3{margin:0;letter-spacing:-.01em}.muted{color:var(--muted)}.icon{width:18px;height:18px;flex:none}.btn{display:inline-flex;align-items:center;gap:.45rem;height:36px;padding:0 .9rem;border-radius:10px;border:1px solid var(--line);background:var(--surface-2);cursor:pointer;transition:background .15s,border-color .15s,transform .1s;white-space:nowrap}.btn:hover{background:var(--surface-3)}.btn:active{transform:scale(.98)}.btn.primary{background:linear-gradient(135deg,var(--accent),#6a5cff);border-color:transparent;color:#fff;box-shadow:0 6px 18px #7c6cff59}.btn.primary:hover{filter:brightness(1.08)}.btn.ghost{background:transparent;border-color:transparent;color:var(--muted)}.btn.ghost:hover{color:var(--text);background:var(--surface-2)}.btn.danger{color:var(--bad);background:transparent;border-color:transparent;padding:0;height:auto}.badge{min-width:20px;height:20px;padding:0 6px;border-radius:999px;background:var(--accent);color:#fff;font-size:.72rem;font-weight:700;display:inline-grid;place-items:center}.seg{display:inline-flex;padding:3px;border-radius:11px;background:var(--surface-2);border:1px solid var(--line)}.seg button{border:0;background:transparent;padding:.35rem .95rem;border-radius:8px;cursor:pointer;color:var(--muted);font-weight:600}.seg button.on{background:var(--surface);color:var(--text);box-shadow:0 1px 3px #00000040}.pill{display:inline-flex;align-items:center;gap:.35rem;padding:.28rem .7rem;border-radius:999px;background:var(--surface-2);border:1px solid var(--line);font-size:.8rem;color:var(--text);cursor:pointer;transition:background .15s,border-color .15s}.pill:hover{border-color:var(--faint)}.pill.on{background:var(--accent-soft);border-color:var(--accent);color:var(--accent)}.pill .x{opacity:.6}.pill:hover .x{opacity:1}.switch{position:relative;display:inline-block;cursor:pointer;width:38px;height:22px;flex:none}.switch input{opacity:0;width:0;height:0}.switch span{position:absolute;inset:0;border-radius:999px;background:var(--surface-3);transition:background .15s;cursor:pointer}.switch span:after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .15s}.switch input:checked+span{background:var(--accent)}.switch input:checked+span:after{transform:translate(16px)}.field{height:36px;padding:0 .75rem;border-radius:10px;border:1px solid var(--line);background:var(--surface-2);color:var(--text);font:inherit;width:100%}.label{font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:.45rem}.toast{position:fixed;bottom:24px;left:50%;transform:translate(-50%,20px);opacity:0;pointer-events:none;background:var(--surface-3);color:var(--text);padding:.65rem 1rem;border-radius:12px;box-shadow:var(--shadow);transition:all .2s;z-index:60;border:1px solid var(--line)}.toast.show{opacity:1;transform:translate(-50%)}.shell{display:grid;grid-template-columns:236px 1fr;min-height:100vh}.shell.top{grid-template-columns:1fr;grid-template-rows:auto 1fr}.side{position:sticky;top:0;height:100vh;display:flex;flex-direction:column;gap:.25rem;padding:1.1rem .85rem;background:var(--surface);border-right:1px solid var(--line)}.shell.top .side{position:sticky;top:0;z-index:20;height:auto;flex-direction:row;align-items:center;padding:.6rem 1.2rem;border-right:0;border-bottom:1px solid var(--line)}.brand{display:flex;align-items:center;gap:.6rem;font-weight:800;font-size:1.05rem;padding:.2rem .5rem 1rem}.shell.top .brand{padding:0 1.2rem 0 0}.nav{display:flex;align-items:center;gap:.65rem;padding:.55rem .7rem;border-radius:10px;color:var(--muted);cursor:pointer;font-weight:600;transition:background .15s,color .15s}.nav:hover{background:var(--surface-2);color:var(--text)}.nav.on{background:var(--accent-soft);color:var(--accent)}.side-foot{margin-top:auto;display:flex;flex-direction:column;gap:.6rem}.shell.top .side-foot{margin:0 0 0 auto;flex-direction:row;align-items:center}.me{display:flex;align-items:center;gap:.6rem;padding:.55rem .6rem;border-radius:12px;background:var(--surface-2);cursor:pointer}.avatar{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;font-weight:700;color:#fff;background:linear-gradient(135deg,#3aa7ff,#6a5cff);flex:none}img.avatar{object-fit:cover;background:var(--surface-3)}.me small{display:block;color:var(--muted);font-size:.72rem;line-height:1.2}.shell.top .me small,.shell.top .nav-profile{display:none}.sync{display:flex;align-items:center;gap:.45rem;font-size:.75rem;color:var(--muted);padding:0 .6rem}.dot{width:7px;height:7px;border-radius:50%;background:var(--good);box-shadow:0 0 0 3px #4ade8026}main{padding:1.6rem 2rem 3rem;min-width:0}.view{display:none;animation:fade .2s ease}.view.on{display:block}@keyframes fade{0%{opacity:0;transform:translateY(4px)}}.head{display:flex;align-items:flex-end;gap:1rem;flex-wrap:wrap;margin-bottom:1.1rem}.head h1{font-size:1.75rem;font-weight:800}.head .sub{color:var(--muted);font-size:.85rem;margin-top:.15rem}.head .tools{margin-left:auto;display:flex;gap:.55rem;align-items:center}.chips{display:flex;gap:.45rem;flex-wrap:wrap;align-items:center;margin-bottom:1.1rem}.toggles{display:grid;gap:.65rem}.toggle{display:flex;align-items:center;gap:.7rem}.fx{position:relative;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);margin-bottom:1.2rem}.fx-row{display:flex;align-items:center;flex-wrap:wrap;gap:.5rem;padding:.7rem .8rem}.fx .pills{display:flex;gap:.4rem;flex-wrap:wrap}.btn.primary.idle{background:var(--surface-2);border-color:var(--line);color:var(--muted);box-shadow:none}.btn.primary.idle:hover{color:var(--text);filter:none;background:var(--surface-3)}.dd{position:relative}.trigger{display:inline-flex;align-items:center;gap:.45rem;height:36px;padding:0 .7rem 0 .8rem;border-radius:10px;border:1px solid var(--line);background:var(--surface-2);cursor:pointer;white-space:nowrap;max-width:260px}.trigger:hover{background:var(--surface-3)}.trigger .t-name{color:var(--muted)}.trigger.set{border-color:var(--accent);background:var(--accent-soft)}.trigger.set .t-name{color:var(--accent)}.trigger.open{border-color:var(--accent)}.caret{width:14px;height:14px;flex:none;opacity:.7;transition:transform .15s}.count{min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:var(--accent);color:#fff;font-size:.7rem;font-weight:700;display:inline-grid;place-items:center}.pop{position:absolute;z-index:25;top:calc(100% + 6px);left:0;min-width:220px;padding:.6rem;background:var(--surface);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow);animation:fade .14s ease}.pop.wide{width:470px}.pop-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:.1rem}.check{display:flex;align-items:center;gap:.55rem;padding:.4rem .5rem;border-radius:8px;border:0;background:none;font:inherit;color:var(--text);text-align:left;cursor:pointer;white-space:nowrap}.check:hover{background:var(--surface-2)}.check .box{width:16px;height:16px;flex:none;border-radius:5px;border:1.5px solid var(--faint);display:grid;place-items:center;font-size:11px;color:#fff}.check.on .box{background:var(--accent);border-color:var(--accent)}.check.blocked{opacity:.4;cursor:not-allowed}.pop-foot{display:flex;align-items:center;justify-content:space-between;gap:.5rem;margin-top:.5rem;padding-top:.5rem;border-top:1px solid var(--line);font-size:.78rem}.linkish{border:0;background:none;padding:0;font:inherit;color:var(--accent);cursor:pointer}.linkish.muted{color:var(--muted)}.linkish:hover{text-decoration:underline}.years{display:flex;gap:.5rem;align-items:center}.years .field{width:86px}.adv-btn{display:inline-flex;align-items:center;gap:.45rem;height:36px;padding:0 .8rem;border-radius:10px;border:1px dashed var(--faint);background:transparent;color:var(--text);cursor:pointer;white-space:nowrap;font-weight:600}.adv-btn:hover{border-style:solid;background:var(--surface-2)}.adv-btn.open{border-style:solid;border-color:var(--accent);color:var(--accent);background:var(--accent-soft)}.adv-body{border-top:1px solid var(--line);padding:1rem 1.2rem 1.1rem;display:grid;grid-template-columns:1.3fr 1fr;gap:1.2rem 2rem;background:color-mix(in srgb,var(--surface-2) 40%,var(--surface));border-radius:0 0 var(--radius) var(--radius)}.adv-col{display:grid;grid-row:span 2;grid-template-rows:subgrid;align-content:start}.adv-body .hint{font-size:.75rem;color:var(--faint);margin-top:.35rem}.round{width:30px;height:30px;flex:none;border-radius:50%;border:1px solid var(--line);background:var(--surface-2);display:grid;place-items:center;cursor:pointer;color:var(--muted)}.round:hover{color:var(--text);background:var(--surface-3)}.toggle.small{font-size:.85rem;gap:.5rem;white-space:nowrap}.toggle.small .switch{width:32px;height:18px}.toggle.small .switch span:after{width:12px;height:12px}.toggle.small .switch input:checked+span:after{transform:translate(14px)}.pill .kind{font-size:.64rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;opacity:.8}.pop-theme{display:grid;gap:.2rem;margin-top:.5rem;padding:.65rem .5rem .15rem;border-top:1px solid var(--line)}.pop-theme .toggle.small{font-size:.875rem;font-weight:600}.chip-strip{position:relative;min-width:140px;display:flex;align-items:center;align-self:stretch;border-left:1px solid var(--line);margin-left:.15rem;padding-left:.6rem}.chip-track{position:relative;flex:1;min-width:0;display:flex;flex-wrap:nowrap;align-items:center;gap:.35rem;overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:none;padding:2px 0;font-size:.8rem}.chip-track::-webkit-scrollbar{display:none}.chip-track>*{flex:none;white-space:nowrap}.chip-track .pill{padding:.22rem .55rem;font-size:.76rem}.chip-more{position:absolute;top:50%;transform:translateY(-50%);z-index:1;display:none;align-items:center;gap:.15rem;height:26px;min-width:26px;padding:0 .35rem;border-radius:999px;border:1px solid var(--line);background:var(--surface-3);color:var(--text);font:inherit;font-size:.72rem;font-weight:700;cursor:pointer;box-shadow:0 2px 8px #00000040}.chip-more:hover{border-color:var(--faint)}.chip-more .caret{opacity:1}.chip-more.l{left:.45rem;justify-content:center}.chip-more.l .caret{transform:rotate(180deg)}.chip-more.r{right:0}.btn .dot-new{width:7px;height:7px;margin-left:.1rem;border-radius:50%;background:#fff}.tagmin-head{display:flex;align-items:baseline;gap:.6rem;font-size:.875rem}.tagmin-head b{font-variant-numeric:tabular-nums;color:var(--muted);font-weight:600}.tagmin.on .tagmin-head b{color:var(--accent)}.tagmin-head .linkish{margin-left:auto;font-size:.75rem}.tagmin input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:6px;margin:.7rem 0 .35rem;border-radius:999px;background:linear-gradient(90deg,var(--accent) var(--p),var(--surface-3) var(--p));cursor:pointer}.tagmin input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:#fff;border:3px solid var(--faint);box-shadow:0 1px 4px #00000059}.tagmin.on input[type=range]::-webkit-slider-thumb{border-color:var(--accent)}.tagmin-ticks{display:flex;justify-content:space-between;font-size:.7rem;color:var(--faint)}.tagmin.idle{opacity:.5}.round.small{width:24px;height:24px;font-size:.7rem}.chip-strip.fade-r .chip-track{mask-image:linear-gradient(90deg,#000 calc(100% - 96px),transparent calc(100% - 52px))}.chip-strip.fade-l .chip-track{mask-image:linear-gradient(90deg,transparent 42px,#000 72px)}.chip-strip.fade-l.fade-r .chip-track{mask-image:linear-gradient(90deg,transparent 42px,#000 72px,#000 calc(100% - 96px),transparent calc(100% - 52px))}.trigger.open .caret,.adv-btn.open .caret{transform:rotate(180deg)}.pop-list{display:grid}.pop-foot.end{justify-content:flex-end}.fx>.fx-row{flex-wrap:nowrap}.fx>.fx-row>*{flex:none}.fx>.fx-row>.chip-strip{flex:1}.chip-strip.fade-l .chip-more.l,.chip-strip.fade-r .chip-more.r{display:inline-flex}@media(max-width:1000px){.fx>.fx-row{flex-wrap:wrap}.fx>.fx-row>.chip-strip{order:10;flex-basis:100%;border-left:0;margin-left:0;padding-left:0}}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:1.2rem}.card{position:relative;cursor:pointer;border-radius:var(--radius)}.card .cv{position:relative;aspect-ratio:2 / 3;border-radius:var(--radius);overflow:hidden;background:var(--surface-2);box-shadow:0 6px 16px #00000040;transition:transform .2s,box-shadow .2s}.card .cv img{width:100%;height:100%;object-fit:cover;display:block}.card:hover .cv{transform:translateY(-4px);box-shadow:0 14px 28px #0006}.card .cv:after{content:"";position:absolute;inset:55% 0 0;background:linear-gradient(transparent,#000000bf)}.rank{position:absolute;top:.55rem;left:.55rem;z-index:1;min-width:30px;height:26px;padding:0 .5rem;display:grid;place-items:center;border-radius:8px;background:#0a0c12c7;backdrop-filter:blur(6px);color:#fff;font-weight:800;font-size:.85rem}.rank.top3{background:linear-gradient(135deg,var(--accent),var(--accent-2))}.score{position:absolute;left:.6rem;bottom:.55rem;z-index:1;display:flex;align-items:center;gap:.3rem;color:#fff;font-weight:700;font-size:.82rem}.score i{width:8px;height:8px;border-radius:50%}.users{position:absolute;right:.6rem;bottom:.58rem;z-index:1;color:#fffc;font-size:.74rem}.nope{position:absolute;top:.5rem;right:.5rem;z-index:2;width:30px;height:30px;border-radius:50%;border:0;background:#0a0c12c7;color:#fff;display:grid;place-items:center;cursor:pointer;opacity:0;transition:opacity .15s}.card:hover .nope{opacity:1}.nope:hover{background:var(--bad)}.card h3{font-size:.92rem;font-weight:700;margin-top:.65rem;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.card .meta{color:var(--muted);font-size:.78rem;margin-top:.2rem}.card .main{color:var(--accent);font-size:.76rem;font-weight:600;margin-top:.15rem}.card .tags{display:flex;gap:.3rem;flex-wrap:wrap;margin-top:.45rem}.card .tags .pill{font-size:.7rem;padding:.12rem .5rem}body.no-ratings .score,body.no-ratings .users,body.no-ratings .ratings{display:none}.scrim{position:fixed;inset:0;background:#000000a8;opacity:0;pointer-events:none;transition:opacity .2s;z-index:30}.scrim.open{opacity:1;pointer-events:auto}.drawer{position:fixed;z-index:31;inset:0;margin:auto;height:fit-content;width:min(920px,94vw);max-height:calc(100vh - 52px);overflow-y:auto;overscroll-behavior:contain;background:var(--surface);border:1px solid var(--line);border-radius:20px;box-shadow:0 30px 80px #00000080;opacity:0;pointer-events:none}.drawer.open{opacity:1;pointer-events:auto;animation:fade .18s ease}html.dialog-open,html.dialog-open body{overflow:hidden}html,body{overscroll-behavior:none}.drawer .close{position:absolute;top:1rem;right:1rem;z-index:2;width:34px;height:34px;border-radius:50%;border:1px solid var(--line);background:var(--surface-2);color:var(--text);cursor:pointer}.dtop{display:grid;grid-template-columns:250px 1fr;gap:1.6rem;padding:1.6rem 1.6rem 1.2rem}.dcover{display:grid;gap:.8rem;align-content:start}.dcover>img{width:100%;aspect-ratio:2 / 3;object-fit:cover;border-radius:14px;box-shadow:var(--shadow)}.dinfo{display:grid;gap:.9rem;align-content:start;padding-right:2rem}.dinfo h2{font-size:1.5rem;font-weight:800;line-height:1.2}.themes{display:flex;gap:.4rem;flex-wrap:wrap}.theme{padding:.25rem .65rem;border-radius:999px;font-size:.78rem;font-weight:600;background:var(--surface-2);color:var(--muted)}.theme.main{background:var(--accent-soft);color:var(--accent)}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:.6rem}.metric{background:var(--surface-2);border-radius:12px;padding:.65rem .8rem}.metric span{font-size:.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;font-weight:600}.metric b{display:block;font-size:1.35rem;font-weight:800}.ratings{display:grid;gap:.4rem}.dist{display:flex;align-items:flex-end;gap:6px;height:90px}.dist span{flex:1;border-radius:5px 5px 0 0;min-height:2px}.dist-axis{display:flex;gap:6px;font-size:.7rem;color:var(--faint)}.dist-axis span{flex:1;text-align:center}.synopsis{color:var(--muted);line-height:1.6}.dfoot{border-top:1px solid var(--line);padding:1.1rem 1.6rem 1.5rem;display:grid;gap:1rem}.actions{display:grid;grid-template-columns:repeat(4,1fr);gap:.6rem}.actions .btn{justify-content:center;height:40px}.dtags .pill.on{background:#f8717124;border-color:var(--bad);color:var(--bad)}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-bottom:1.4rem}.stat{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:1rem 1.1rem}.stat b{display:block;font-size:1.6rem;font-weight:800;margin-top:.15rem}.two{display:grid;grid-template-columns:1fr 1fr;gap:1.2rem}.panel{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:1.2rem}.panel h2{font-size:1rem;margin-bottom:.9rem}.barrow{display:grid;grid-template-columns:130px 1fr 40px;gap:.7rem;align-items:center;padding:.32rem 0;font-size:.85rem}.barrow small{color:var(--faint);margin-left:.3rem;font-size:.7rem}.bar{height:8px;border-radius:999px;background:var(--surface-2);overflow:hidden}.bar i{display:block;height:100%;border-radius:inherit}.profile{display:grid;grid-template-columns:200px 1fr;gap:2rem}.tabs{display:flex;flex-direction:column;gap:.2rem}.tab{padding:.55rem .75rem;border-radius:10px;cursor:pointer;color:var(--muted);font-weight:600}.tab:hover,.tab.on{color:var(--text);background:var(--surface-2)}.pane{display:none;max-width:760px}.pane.on{display:grid;gap:.9rem}.account{display:grid;grid-template-columns:46px 1fr auto;gap:1rem;align-items:center;padding:1rem 1.1rem;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius)}.account.linked{border-color:color-mix(in srgb,var(--accent) 45%,var(--line))}.svc{width:46px;height:46px;border-radius:12px;display:grid;place-items:center;font-weight:800;color:#fff;font-size:.95rem}.account .sub{color:var(--muted);font-size:.8rem}.src{font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--accent);background:var(--accent-soft);padding:.12rem .45rem;border-radius:6px;margin-left:.4rem;vertical-align:2px}.setting{display:flex;align-items:center;gap:1rem;padding:.9rem 1.1rem;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius)}.setting div{flex:1}.setting small{display:block;color:var(--muted);font-size:.8rem}.shell.host-seanime{grid-template-columns:1fr}.shell.host-seanime .side,.page-tabs{display:none}.shell.host-seanime .page-tabs{display:flex;align-items:center;gap:.3rem;margin:-.4rem 0 1.4rem;border-bottom:1px solid var(--line)}.page-tab{padding:.6rem .9rem;color:var(--muted);font-weight:600;cursor:pointer;border:0;border-bottom:2px solid transparent;margin-bottom:-1px;background:none}.page-tab.on{color:var(--text);border-color:var(--accent)}.page-tabs .note{margin-left:auto;font-size:.78rem;color:var(--muted)}.logo{display:block;object-fit:contain;flex:none}.status{display:flex;align-items:center;gap:.6rem;color:var(--muted);font-size:.85rem;margin-bottom:1rem}.spinner{width:16px;height:16px;border-radius:50%;border:2px solid var(--surface-3);border-top-color:var(--accent);animation:spin .8s linear infinite;flex:none}@keyframes spin{to{transform:rotate(360deg)}}.warn{background:#facc1514;border:1px solid rgba(250,204,21,.3);color:var(--text);border-radius:12px;padding:.6rem .9rem;font-size:.82rem;margin-bottom:1rem}.error{background:#f8717114;border-color:#f8717166}.empty{text-align:center;padding:4rem 1rem;color:var(--muted);display:grid;gap:.8rem;justify-items:center}.empty h2{color:var(--text);font-size:1.2rem}.card .cv .ph{position:absolute;inset:0;display:grid;place-items:center;color:var(--faint);font-size:.8rem}.welcome{min-height:100vh;display:grid;place-items:center;padding:2rem;background:radial-gradient(1000px 500px at 20% 0%,rgba(139,123,255,.18),transparent),radial-gradient(800px 500px at 100% 100%,rgba(255,111,163,.12),transparent)}.welcome form{width:min(480px,100%);background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:2rem;box-shadow:var(--shadow);display:grid;gap:.9rem}.welcome h1{font-size:1.5rem;font-weight:800}.welcome p{margin:0}.synopsis{white-space:pre-line}.pill.btnlike{font:inherit;font-size:.8rem}dialog.drawer{margin:0;padding:0;color:var(--text)}@media(max-width:760px){.shell{grid-template-columns:1fr}.side{display:none}main{padding:1rem}.dtop{grid-template-columns:1fr}.dcover>img{width:160px}.dcover .trailer{max-width:280px}.actions,.metrics,.stats{grid-template-columns:1fr 1fr}.two,.adv-body,.profile{grid-template-columns:1fr}}fieldset.seg{margin:0;min-width:0}button.nav{border:0;background:none;font:inherit;width:100%;text-align:left}button.scrim{border:0;padding:0;cursor:default}button.tab{background:none}button.tab:hover,button.tab.on{background:var(--surface-2)}.actions{grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}@media(max-width:760px){.head .tools{margin-left:0;flex-wrap:wrap}}.overlay{position:fixed;inset:0;z-index:40;display:grid;place-items:center;padding:1.5rem;background:color-mix(in srgb,var(--bg) 55%,transparent);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);animation:fade .2s ease}.overlay-card{width:min(460px,100%);display:grid;justify-items:center;gap:.8rem;text-align:center;padding:1.8rem 1.6rem;background:var(--surface);border:1px solid var(--line);border-radius:20px;box-shadow:var(--shadow)}.overlay-card h2{font-size:1.3rem;font-weight:800;line-height:1.3}.overlay-card p{margin:0}.overlay-note{font-size:.88rem;color:var(--muted);line-height:1.5;padding-top:.3rem;border-top:1px solid var(--line)}.spinner.big{width:34px;height:34px;border-width:3px}.progress{width:100%;height:8px;border-radius:999px;background:var(--surface-3);overflow:hidden}.progress i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--accent),var(--accent-2));transition:width .4s ease}.progress.indeterminate i{width:35%;animation:slide 1.2s ease-in-out infinite}@keyframes slide{0%{transform:translate(-100%)}to{transform:translate(290%)}}.tag-picker{position:relative}.tag-menu{position:absolute;z-index:10;left:0;right:0;top:calc(100% + 4px);max-height:280px;overflow-y:auto;background:var(--surface);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow);padding:.3rem;display:grid}.tag-picker>.tag-menu{top:auto}.tag-menu button{text-align:left;border:0;background:none;padding:.45rem .6rem;border-radius:8px;cursor:pointer;font:inherit;color:var(--text)}.tag-menu button:hover{background:var(--surface-2)}.more{display:flex;justify-content:center;margin:1.6rem 0 .5rem}.more .btn{min-width:180px;justify-content:center}.settings{display:grid;gap:.8rem;max-width:820px}.settings h2.section{font-size:1.05rem;margin:.8rem 0 0}.settings h2.section:first-child{margin-top:0}.card .cv .format{position:absolute;top:.55rem;right:.55rem;z-index:1;height:24px;padding:0 .55rem;display:grid;place-items:center;border-radius:8px;background:#0a0c12c7;backdrop-filter:blur(6px);color:#fff;font-weight:700;font-size:.72rem;letter-spacing:.02em}.card .nope{top:2.35rem}.btn .spinner.small{width:14px;height:14px;border-width:2px;border-color:#ffffff59;border-top-color:#fff}.btn[disabled]{cursor:default}.btn.primary[aria-busy=true]{filter:saturate(.8)}.btn.primary.done{background:var(--surface-2);border-color:var(--line);color:var(--good);box-shadow:none}.btn.site img{border-radius:4px;flex:none}.people-loading{font-size:.85rem}.people-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:.55rem}.person{display:flex;align-items:center;gap:.65rem;padding:.45rem .55rem;background:var(--surface-2);border-radius:12px;min-width:0}.person .who{display:grid;gap:.1rem;min-width:0}.person b{font-size:.85rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.person small{color:var(--muted);font-size:.74rem}.person .va{display:flex;align-items:center;gap:.35rem;color:var(--muted);font-size:.74rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.avatar-img{display:block;flex:none;object-fit:cover;border-radius:8px;background:var(--surface-3)}.avatar-img.round{border-radius:50%}.pill.excluded{color:var(--bad);border-color:color-mix(in srgb,var(--bad) 45%,transparent);background:color-mix(in srgb,var(--bad) 10%,transparent)}.pill.excluded .x{display:inline-block;text-decoration:none}.pill.blocked,.pill.blocked:hover{opacity:.4;cursor:not-allowed;border-color:var(--line)}.driver-popover.tour-popover{background:var(--surface);color:var(--text);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);max-width:340px;padding:1.1rem 1.2rem 1rem;--driver-popover-font-family: inherit}.driver-popover.tour-popover .driver-popover-title{font-size:1.05rem;font-weight:700}.driver-popover.tour-popover .driver-popover-description{color:var(--muted);line-height:1.5}.driver-popover.tour-popover .driver-popover-progress-text{color:var(--faint)}.driver-popover.tour-popover .driver-popover-footer{gap:.5rem;align-items:center}.driver-popover.tour-popover .driver-popover-footer button{font:inherit;font-size:.85rem;text-shadow:none;padding:.35rem .8rem;border-radius:8px;border:1px solid var(--line);background:var(--surface-2);color:var(--text);cursor:pointer}.driver-popover.tour-popover .driver-popover-footer .driver-popover-next-btn{background:var(--accent);border-color:var(--accent);color:#fff}.driver-popover.tour-popover .driver-popover-footer .driver-popover-btn-disabled{opacity:.4;cursor:default}.driver-popover.tour-popover .driver-popover-footer .tour-skip{border-color:transparent;background:none;color:var(--muted)}.driver-popover.tour-popover .driver-popover-arrow-side-left.driver-popover-arrow{border-left-color:var(--surface)}.driver-popover.tour-popover .driver-popover-arrow-side-right.driver-popover-arrow{border-right-color:var(--surface)}.driver-popover.tour-popover .driver-popover-arrow-side-top.driver-popover-arrow{border-top-color:var(--surface)}.driver-popover.tour-popover .driver-popover-arrow-side-bottom.driver-popover-arrow{border-bottom-color:var(--surface)}.trailer{position:relative;display:block;width:100%;aspect-ratio:16 / 9;padding:0;border:1px solid var(--line);border-radius:12px;overflow:hidden;cursor:pointer;background:var(--surface-3) center / cover no-repeat;transition:filter .15s,transform .1s}.trailer:after{content:"";position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.55),transparent 45%)}.trailer:hover{filter:brightness(1.1)}.trailer:active{transform:scale(.99)}.trailer:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.tr-play{position:absolute;z-index:1;left:50%;top:50%;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:#0d0f1499;border:2px solid rgba(255,255,255,.85)}.tr-play:before{content:"";position:absolute;left:16px;top:12px;border-style:solid;border-width:9px 0 9px 14px;border-color:transparent transparent transparent #fff}.trailer:hover .tr-play{background:var(--accent);border-color:var(--accent)}.tr-tag{position:absolute;z-index:1;left:.7rem;bottom:.55rem;color:#fff;font-size:.78rem;font-weight:600;text-shadow:0 1px 3px rgba(0,0,0,.6)}.player{position:fixed;inset:0;z-index:40;display:grid;place-items:center;animation:fade .18s ease}.player-scrim{position:absolute;inset:0;border:0;padding:0;background:#000000d9;cursor:pointer}.player-box{position:relative;width:min(1100px,94vw,calc((100vh - 120px) * 16 / 9));display:grid;gap:.7rem}.player-frame{aspect-ratio:16 / 9;border-radius:14px;overflow:hidden;background:#000;box-shadow:0 30px 80px #0009}.player-frame iframe{width:100%;height:100%;border:0;display:block}.player-bar{display:flex;align-items:center;gap:.6rem}.player-title{flex:1;min-width:0;color:#fff;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.welcome .signin{justify-content:center;height:44px}.welcome .signin-note{margin:-.4rem 0 0;font-size:.8rem}.welcome .signin-error{margin:0;color:var(--bad);font-size:.84rem}.welcome .signin-wait{display:flex;align-items:center;gap:.6rem;padding:.7rem .8rem;border-radius:12px;background:var(--accent-soft);font-size:.9rem}.row-gap{display:flex;gap:.5rem;align-items:center;justify-content:flex-end;flex-wrap:wrap}</style>\n  </head>\n  <body>\n    <div id="app"></div>\n  </body>\n</html>\n');
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
