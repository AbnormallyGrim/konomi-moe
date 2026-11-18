/* Filter redesign wireframes: Today plus four ways (A–D) to show basic filters in a small block
   with an "Advanced" section that expands. Every variant edits the same filter state, so switching
   between them keeps your choices. Mock data comes from ../mock/data.js. */
(() => {
  /* Data, mirroring the app (engine/src/themes.ts, engine/src/filters.ts, ui/src/app.tsx) */
  const GENRES = [
    "Action", "Adventure", "Comedy", "Drama", "Ecchi", "Fantasy", "Horror", "Mahou Shoujo",
    "Mecha", "Music", "Mystery", "Psychological", "Romance", "Sci-Fi", "Slice of Life",
    "Sports", "Supernatural", "Thriller",
  ];
  // B orders genres by the user's taste (what Your taste already computes).
  const TASTE = {
    ANIME: ["Action", "Drama", "Fantasy", "Supernatural", "Mystery", "Psychological", "Adventure",
      "Comedy", "Sci-Fi", "Horror", "Thriller", "Romance", "Slice of Life", "Mecha", "Sports",
      "Music", "Mahou Shoujo", "Ecchi"],
    MANGA: ["Drama", "Psychological", "Action", "Mystery", "Fantasy", "Romance", "Comedy",
      "Slice of Life", "Supernatural", "Horror", "Adventure", "Thriller", "Sci-Fi", "Sports",
      "Music", "Mecha", "Mahou Shoujo", "Ecchi"],
  };
  const FORMATS = {
    ANIME: ["TV", "TV_SHORT", "MOVIE", "OVA", "ONA", "SPECIAL", "MUSIC"],
    MANGA: ["MANGA", "NOVEL", "ONE_SHOT"],
  };
  const FORMAT_NAMES = {
    TV: "TV", TV_SHORT: "TV short", MOVIE: "Movie", OVA: "OVA", ONA: "ONA", SPECIAL: "Special",
    MUSIC: "Music", MANGA: "Manga", NOVEL: "Light novel", ONE_SHOT: "One shot",
  };
  // AniList's statuses, named as on the cards (STATUS_NAMES in ui/src/app.tsx).
  const STATUSES = [["FINISHED", "Finished"], ["RELEASING", "Releasing"], ["NOT_YET_RELEASED", "Not yet released"], ["HIATUS", "On hiatus"], ["CANCELLED", "Cancelled"]];
  const statusName = (k) => STATUSES.find(([s]) => s === k)?.[1] ?? k;
  const COUNTRIES = [["JP", "Japan"], ["KR", "South Korea"], ["CN", "China"], ["TW", "Taiwan"]];
  const TOP_TAGS = {
    ANIME: ["Male Protagonist", "Shounen", "Super Power", "Tragedy", "Coming of Age", "Revenge", "Military", "Urban Fantasy"],
    MANGA: ["Seinen", "Philosophy", "Coming of Age", "Tragedy", "Psychosexual", "Revenge", "Survival", "Historical"],
  };
  // A blacklisted label from Settings: shown but can't be chosen.
  const BLACKLIST = new Set(["genre:Ecchi"]);
  const MOCK = window.MOCK;
  const EXTRA_TAGS = ["Isekai", "Iyashikei", "Time Travel", "Reincarnation", "Love Triangle", "Idol",
    "Harem", "Villainess", "Office Lady", "Cyberpunk", "Space", "Mythology", "Magic", "Cute Girls Doing Cute Things",
    "Work", "Food", "Gods", "Elf", "Witch", "Robots", "Aliens", "Zombie", "Pirates", "Samurai", "Episodic",
    "Afterlife", "Amnesia", "Twins", "Yandere", "Kuudere", "Boys' Love", "Yuri", "Josei", "Shoujo", "Romantic Subtext",
    "Mixed Gender Harem", "Rural", "Band", "Baseball", "Basketball", "Volleyball", "Chess", "Cooking", "Detective",
    "Heist", "Mafia", "Primarily Adult Cast", "Primarily Female Cast", "Primarily Male Cast", "Tragedy"];
  const ALL_TAGS = [...new Set([...MOCK.anime, ...MOCK.manga].flatMap((m) => m.tags).concat(EXTRA_TAGS))].sort();
  const NOW = 2026;

  /* State */
  const blank = () => ({
    genres: [], tags: [], mainTheme: false, formats: [], yearFrom: null, yearTo: null,
    finishedOnly: false, hideListed: true, hideSeen: false, countries: [], tagMin: 0, statuses: [],
  });
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const startAnime = { ...blank(), genres: ["Action", "Drama"], yearFrom: 2010, countries: ["JP"] };
  const startManga = { ...blank(), genres: ["Drama"] };
  const VARIANTS = ["today", "a", "a1", "a2", "a3", "b", "c", "d", "compare"];
  const S = {
    variant: VARIANTS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "a1",
    kind: "ANIME",
    adv: false,
    todayOpen: true,
    applied: { ANIME: clone(startAnime), MANGA: clone(startManga) },
    draft: { ANIME: clone(startAnime), MANGA: clone(startManga) },
    exclude: { ANIME: ["tag:Gore"], MANGA: [] },
    pop: null,
    more: false,
    tab: "tags",
    omniQ: "",
    omniFocus: false,
    omniHi: 0,
    tagQ: "",
    refocus: null,
  };
  const f = () => S.draft[S.kind];
  const dirty = () => JSON.stringify(f()) !== JSON.stringify(S.applied[S.kind]);
  const advCount = (x) =>
    x.tags.length + x.countries.length + (x.mainTheme ? 1 : 0) + (x.hideListed ? 0 : 1) + (x.hideSeen ? 1 : 0);
  // In the refined A variants main theme is basic (Genres dropdown) and tags have their own switch.
  const advCountR = (x) =>
    x.tags.length + x.countries.length + (x.tagMin && x.tags.length ? 1 : 0) + (x.hideListed ? 0 : 1) + (x.hideSeen ? 1 : 0);

  /* Helpers */
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const fmt = (x) => FORMAT_NAMES[x] ?? x;
  const country = (c) => COUNTRIES.find(([k]) => k === c)?.[1] ?? c;
  const toggleIn = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const and = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} & ${xs.at(-1)}`);
  const or = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} or ${xs.at(-1)}`);
  const kindWord = () => (S.kind === "ANIME" ? "anime" : "manga");
  const scoreColour = (s) => `hsl(${Math.max(0, Math.min(120, (s - 45) * 2.6))}, 70%, 55%)`;
  const compact = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : n.toLocaleString());
  const svg = (inner, cls = "icon") =>
    `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  const I = {
    filters: svg('<path d="M3 5h18M6 12h12M10 19h4"/>'),
    caret: svg('<path d="M6 9l6 6 6-6"/>', "caret"),
    next: svg('<path d="M9 6l6 6-6 6"/>', "caret"),
    search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
    sliders: svg('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>'),
  };
  const yearsText = (x) =>
    x.yearFrom && x.yearTo
      ? x.yearFrom === x.yearTo ? `${x.yearFrom}` : `${x.yearFrom}–${x.yearTo}`
      : x.yearFrom ? `${x.yearFrom}–now` : x.yearTo ? `Until ${x.yearTo}` : "";
  const seenLabel = () =>
    S.kind === "ANIME"
      ? "Hide titles whose manga or light novel I'm reading or have read"
      : "Hide titles whose anime I'm watching or have watched";

  /* Shared pieces */
  const pill = (key, on, text, act) => {
    const blocked = BLACKLIST.has(key) && !on;
    return `<button type="button" class="pill btnlike ${on ? "on" : ""} ${blocked ? "blocked" : ""}" ${blocked ? `disabled title="${esc(text)} is blacklisted in Settings"` : ""} data-act="${esc(act)}">${esc(text)}</button>`;
  };
  const genrePills = (order = GENRES) => order.map((g) => pill(`genre:${g}`, f().genres.includes(g), g, `genre:${g}`)).join("");
  const formatPills = () => FORMATS[S.kind].map((x) => pill(`format:${x}`, f().formats.includes(x), fmt(x), `format:${x}`)).join("");
  const countryPills = () => COUNTRIES.map(([c, n]) => pill(`country:${c}`, f().countries.includes(c), n, `country:${c}`)).join("");
  const toggle = (key, label, cls = "") =>
    `<label class="toggle ${cls}"><span class="switch"><input type="checkbox" data-opt="${key}" ${f()[key] ? "checked" : ""}><span></span></span>${esc(label)}</label>`;
  const check = (on, text, act, key, radio = false) => {
    const blocked = key && BLACKLIST.has(key) && !on;
    return `<button type="button" class="check ${on ? "on" : ""} ${blocked ? "blocked" : ""}" ${blocked ? "disabled" : ""} data-act="${esc(act)}"><span class="box" ${radio ? 'style="border-radius:50%"' : ""}>${on ? (radio ? "●" : "✓") : ""}</span>${esc(text)}${blocked ? ' <span class="muted" style="font-size:.72rem">blacklisted</span>' : ""}</button>`;
  };
  const years = (cls = "") =>
    `<div class="years ${cls}"><input class="field" data-year="from" aria-label="From year" placeholder="Any" value="${f().yearFrom ?? ""}"><span class="muted">to</span><input class="field" data-year="to" aria-label="To year" placeholder="Any" value="${f().yearTo ?? ""}"></div>`;
  const yearPresets = () =>
    `<div class="pills">${[["last5", "Last 5 years"], ["2010s", "2010s"], ["2000s", "2000s"], ["pre2000", "Before 2000"]]
      .map(([k, t]) => `<button type="button" class="pill btnlike" data-act="preset:${k}">${t}</button>`).join("")}</div>`;

  function tagPicker() {
    const chosen = f().tags;
    const top = TOP_TAGS[S.kind].filter((t) => !chosen.includes(t));
    return `<div class="tag-picker">
      ${chosen.length ? `<div class="pills" style="margin-bottom:.5rem">${chosen.map((t) => `<button type="button" class="pill btnlike on" data-act="tag-rm:${esc(t)}">${esc(t)} <span class="x">✕</span></button>`).join("")}</div>` : ""}
      <input class="field" data-tagsearch aria-label="Search tags" placeholder="Search AniList tags…" value="${esc(S.tagQ)}">
      ${top.length ? `<div class="pills" style="margin-top:.5rem;align-items:center"><span class="muted" style="font-size:.78rem">Your top tags:</span>${top.map((t) => `<button type="button" class="pill btnlike" data-act="tag-add:${esc(t)}">+ ${esc(t)}</button>`).join("")}</div>` : ""}
    </div>`;
  }
  function tagMenu() {
    const q = S.tagQ.trim().toLowerCase();
    const list = ALL_TAGS.filter((t) => !f().tags.includes(t) && (!q || t.toLowerCase().includes(q))).slice(0, 40);
    if (!list.length) return "";
    return `<div class="tag-menu" role="listbox">${list.map((t) => `<button type="button" data-act="tag-add:${esc(t)}">${esc(t)}</button>`).join("")}</div>`;
  }

  /** Every active filter as a removable chip, advanced ones included. */
  function chips(withKinds = false) {
    const x = f();
    const k = (s) => (withKinds ? `<span class="kind">${s}</span> ` : "");
    const out = [
      ...x.genres.map((g) => [`${k("Genre")}${esc(g)}`, `genre:${g}`]),
      ...x.tags.map((t) => [`${k("Tag")}${esc(t)}`, `tag-rm:${t}`]),
      ...x.formats.map((v) => [`${k("Format")}${fmt(v)}`, `format:${v}`]),
      ...x.countries.map((c) => [`${k("Country")}${country(c)}`, `country:${c}`]),
      ...(x.yearFrom ? [[`${k("Year")}From ${x.yearFrom}`, "year-clear:from"]] : []),
      ...(x.yearTo ? [[`${k("Year")}Until ${x.yearTo}`, "year-clear:to"]] : []),
      ...(x.finishedOnly ? [["Finished only", "opt:finishedOnly"]] : []),
      ...(x.mainTheme ? [["Main theme only", "opt:mainTheme"]] : []),
      ...(!x.hideListed ? [["Showing listed titles", "opt:hideListed"]] : []),
      ...(x.hideSeen ? [["Hiding seen adaptations", "opt:hideSeen"]] : []),
    ];
    return out.map(([label, act]) => `<button type="button" class="pill btnlike on" data-act="${esc(act)}" title="Remove">${label} <span class="x">✕</span></button>`);
  }

  const excludedRow = () => {
    const ex = S.exclude[S.kind];
    if (!ex.length) return "";
    return `<div class="excluded-row"><span class="muted">Excluded from this search:</span>${ex
      .map((key) => `<button type="button" class="pill btnlike excluded" data-act="unexclude:${esc(key)}" title="Put it back in this search">${esc(key.split(":")[1])} <span class="x">✕</span></button>`)
      .join("")}</div>`;
  };
  const applyBtns = (reset = true) =>
    `${dirty() ? '<span class="pending">Unapplied changes</span>' : ""}${reset ? '<button type="button" class="btn ghost" data-act="reset">Reset</button>' : ""}<button type="button" class="btn primary ${dirty() ? "" : "idle"}" data-act="apply">Apply</button>`;
  const advBtn = (label = "Advanced", cls = "", n = advCount(f())) => {
    return `<button type="button" class="adv-btn ${cls} ${S.adv ? "open" : ""}" data-act="adv" aria-expanded="${S.adv}">${I.sliders}${label}${n ? `<span class="count">${n}</span>` : ""}${I.caret}</button>`;
  };
  const adv = (body) => `<div class="adv ${S.adv ? "open" : ""}"><div>${body}</div></div>`;
  /** A dropdown: a trigger plus its popover when open. Ids carry the variant so only one opens. */
  const dd = (v, id, trigger, pop, popCls = "") => {
    const key = `${v}:${id}`;
    const open = S.pop === key;
    return `<div class="dd">${trigger(open, key)}${open ? `<div class="pop ${popCls}">${pop()}</div>` : ""}</div>`;
  };
  const trig = (name, val, set) => (open, key) =>
    `<button type="button" class="trigger ${set ? "set" : ""} ${open ? "open" : ""}" data-act="pop:${key}"><span class="t-name">${name}</span>${val ? `<span class="t-val">${esc(val)}</span>` : ""}${I.caret}</button>`;

  const genrePop = () =>
    `<div class="pop-grid">${GENRES.map((g) => check(f().genres.includes(g), g, `genre:${g}`, `genre:${g}`)).join("")}</div>
     <div class="pop-foot"><span class="muted">Titles must have every genre you pick</span><button type="button" class="linkish" data-act="clear:genres">Clear</button></div>`;
  const formatPop = () =>
    `<div style="display:grid">${FORMATS[S.kind].map((x) => check(f().formats.includes(x), fmt(x), `format:${x}`)).join("")}</div>
     <div class="pop-foot"><span class="muted">Any of these</span><button type="button" class="linkish" data-act="clear:formats">Clear</button></div>`;
  const yearPop = () =>
    `<div class="label">First released</div>${years()}<div class="label" style="margin-top:.85rem">Quick picks</div>${yearPresets()}
     <div class="pop-foot"><span></span><button type="button" class="linkish" data-act="year-clear:both">Clear</button></div>`;

  /** The advanced panel used by A and B: tags on the left, origin and list rules on the right. */
  const advColumns = () => adv(`<div class="adv-body">
      <div>
        <div class="label">Tags</div>
        ${tagPicker()}
        <div style="margin-top:.8rem">${toggle("mainTheme", "Only where the chosen genres and tags are the main theme")}</div>
      </div>
      <div>
        <div class="label">Country of origin</div>
        <div class="pills">${countryPills()}</div>
        <div class="label" style="margin-top:1rem">Your list</div>
        <div class="toggles">
          ${toggle("hideListed", "Hide titles on my list, in any format (light novel, OVA, recap film…)")}
          ${toggle("hideSeen", seenLabel())}
        </div>
      </div>
      <div class="adv-foot"><span class="muted">Advanced filters stay on when this is closed; they show on the button's count.</span><button type="button" class="btn ghost" data-act="adv">Close</button>${applyBtns(false)}</div>
    </div>`);

  /* Variants */
  function today() {
    if (!S.todayOpen) {
      const c = chips();
      return `<div class="filters-bar" data-measure data-variant="today">${I.filters}<b>Filters</b>${c.length ? c.join("") : '<span class="muted">None</span>'}<button type="button" class="btn ghost" data-act="today-toggle">Show filters</button>${excludedRow()}</div>`;
    }
    return `<div class="filter-card open-card" data-measure data-variant="today">
      <div class="filter-head">${I.filters}<b>Filters</b><button type="button" class="btn ghost" data-act="today-toggle">Minimise</button></div>
      <div>
        <div class="label">Genres</div><div class="pills">${genrePills()}</div>
        <div class="label" style="margin-top:1rem">Tags</div>${tagPicker()}
        <div class="label" style="margin-top:1rem">Format</div><div class="pills">${formatPills()}</div>
      </div>
      <div>
        <div class="label">Country of origin</div><div class="pills">${countryPills()}</div>
        <div class="label" style="margin-top:1rem">First released</div>${years()}
        <div class="label" style="margin-top:1rem">Options</div>
        <div class="toggles">
          ${toggle("mainTheme", "Only where the chosen genres and tags are the main theme")}
          ${toggle("finishedOnly", "Finished only")}
          ${toggle("hideListed", "Hide titles on my list, in any format (light novel, OVA, recap film…)")}
          ${toggle("hideSeen", seenLabel())}
        </div>
      </div>
      ${excludedRow()}
      <div class="filter-foot"><button type="button" class="btn ghost" data-act="reset">Reset</button><button type="button" class="btn primary" data-act="apply">Apply</button></div>
    </div>`;
  }

  function variantA() {
    const x = f();
    const c = chips();
    return `<div class="fx fx-a" data-measure data-variant="a" data-tour="filters">
      <div class="fx-row">
        ${dd("a", "genres", trig("Genres", x.genres.length ? (x.genres.length > 2 ? `${x.genres[0]} +${x.genres.length - 1}` : x.genres.join(", ")) : "Any", x.genres.length), genrePop, "wide")}
        ${dd("a", "format", trig("Format", x.formats.length ? (x.formats.length > 2 ? `${fmt(x.formats[0])} +${x.formats.length - 1}` : x.formats.map(fmt).join(", ")) : "Any", x.formats.length), formatPop)}
        ${dd("a", "years", trig("Released", yearsText(x) || "Any", x.yearFrom || x.yearTo), yearPop)}
        ${toggle("finishedOnly", "Finished only", "small")}
        <span class="vline"></span>
        ${advBtn()}
        <div class="push">${applyBtns()}</div>
      </div>
      ${c.length ? `<div class="chiprow">${c.join("")}<button type="button" class="linkish muted" data-act="reset" style="margin-left:.2rem">Clear all</button></div>` : ""}
      ${excludedRow()}
      ${advColumns()}
    </div>`;
  }

  function variantB() {
    const x = f();
    return `<div class="fx fx-b" data-measure data-variant="b" data-tour="filters">
      <div class="fx-row">
        <span class="mini-label" title="Ordered by Your taste">Genres</span>
        <div class="strip">
          <div class="scroller ${S.more ? "wrap" : ""}" data-scroll="b-genres">${genrePills(TASTE[S.kind])}</div>
          ${S.more ? "" : `<button type="button" class="round" data-act="strip-next" aria-label="More genres">${I.next}</button>`}
        </div>
        <button type="button" class="linkish" data-act="more" style="font-size:.8rem;white-space:nowrap">${S.more ? "Show less" : "Show all"}</button>
      </div>
      <div class="fx-row second">
        ${dd("b", "format", trig("Format", x.formats.length ? x.formats.map(fmt).join(", ") : "Any", x.formats.length), formatPop)}
        <span class="vline"></span>
        <div class="group"><span class="mini-label">Released</span>${years("tight")}</div>
        <span class="vline"></span>
        ${toggle("finishedOnly", "Finished only", "small")}
        <div class="push">${advBtn("Advanced filters", "link")}${applyBtns()}</div>
      </div>
      ${excludedRow()}
      ${advColumns()}
    </div>`;
  }

  /* C: one field for everything */
  function omniItems() {
    const x = f();
    const q = S.omniQ.trim().toLowerCase();
    const groups = [];
    const push = (name, items) => items.length && groups.push([name, items]);
    if (!q) {
      push("Your top genres", TASTE[S.kind].filter((g) => !x.genres.includes(g) && !BLACKLIST.has(`genre:${g}`)).slice(0, 5).map((g) => ({ label: g, kind: "Genre", act: `genre:${g}` })));
      push("Your top tags", TOP_TAGS[S.kind].filter((t) => !x.tags.includes(t)).slice(0, 5).map((t) => ({ label: t, kind: "Tag", act: `tag-add:${t}` })));
      push("Try typing", [
        { label: "a year, like 2016", kind: "Year", act: "noop", hint: true },
        { label: "a format, like movie", kind: "Format", act: "noop", hint: true },
        { label: "finished", kind: "Option", act: "noop", hint: true },
      ]);
      return groups;
    }
    const has = (s) => s.toLowerCase().includes(q);
    push("Genres", GENRES.filter((g) => has(g) && !x.genres.includes(g)).map((g) => ({ label: g, kind: BLACKLIST.has(`genre:${g}`) ? "Blacklisted" : "Genre", act: BLACKLIST.has(`genre:${g}`) ? "noop" : `genre:${g}` })));
    push("Tags", ALL_TAGS.filter((t) => has(t) && !x.tags.includes(t)).slice(0, 6).map((t) => ({ label: t, kind: "Tag", act: `tag-add:${t}` })));
    push("Format", FORMATS[S.kind].filter((v) => has(fmt(v)) && !x.formats.includes(v)).map((v) => ({ label: fmt(v), kind: "Format", act: `format:${v}` })));
    push("Country", COUNTRIES.filter(([c, n]) => has(n) && !x.countries.includes(c)).map(([c, n]) => ({ label: n, kind: "Country", act: `country:${c}` })));
    const y = q.match(/^(19|20)\d{2}$/);
    if (y) push("Released", [
      { label: `From ${q}`, kind: "Year", act: `year-from:${q}` },
      { label: `Until ${q}`, kind: "Year", act: `year-to:${q}` },
      { label: `Only ${q}`, kind: "Year", act: `year-in:${q}` },
    ]);
    const opts = [
      ["finished only", "Finished only", "finishedOnly"],
      ["main theme only", "Main theme only", "mainTheme"],
    ].filter(([k, , key]) => k.includes(q) && !x[key]);
    push("Options", opts.map(([, label, key]) => ({ label, kind: "Option", act: `opt:${key}` })));
    return groups;
  }
  function omniMenu() {
    if (!S.omniFocus) return "";
    const groups = omniItems();
    if (!groups.length) return `<div class="omni-menu"><div class="empty-q">Nothing called “${esc(S.omniQ)}”. Try a genre, tag, format or year.</div></div>`;
    const q = S.omniQ.trim();
    const mark = (s) => (q ? esc(s).replace(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"), "<mark>$1</mark>") : esc(s));
    let i = 0;
    return `<div class="omni-menu" role="listbox">${groups
      .map(([name, items]) => `<div class="grp">${name}</div>${items
        .map((it) => {
          const hi = !it.hint && i++ === S.omniHi;
          return `<button type="button" class="${hi ? "hi" : ""}" ${it.hint ? 'style="color:var(--muted);cursor:default"' : ""} data-act="${esc(it.act)}" data-omni-item><span>${it.hint ? esc(it.label) : mark(it.label)}</span><span class="kind">${it.kind}</span></button>`;
        })
        .join("")}`)
      .join("")}</div>`;
  }
  function variantC() {
    const x = f();
    const sugg = [
      ...TASTE[S.kind].filter((g) => !x.genres.includes(g)).slice(0, 2).map((g) => [g, `genre:${g}`]),
      ...TOP_TAGS[S.kind].filter((t) => !x.tags.includes(t)).slice(0, 2).map((t) => [t, `tag-add:${t}`]),
      ...(x.formats.includes("MOVIE") || S.kind !== "ANIME" ? [] : [["Movie", "format:MOVIE"]]),
      ...(x.finishedOnly ? [] : [["Finished only", "opt:finishedOnly"]]),
      ...(x.yearFrom ? [] : [["Last 5 years", "preset:last5"]]),
    ];
    return `<div class="fx fx-c" data-measure data-variant="c" data-tour="filters">
      <div class="fx-row">
        <div class="omni">
          <label class="omni-box">${I.search}${chips(true).join("")}<input data-omni aria-label="Add a filter" placeholder="${chips().length ? "Add more…" : "Add a genre, tag, format, year…"}" value="${esc(S.omniQ)}"></label>
          <div class="omni-slot">${omniMenu()}</div>
        </div>
        ${advBtn("Browse all")}
        ${applyBtns(false)}
      </div>
      <div class="suggest"><span class="muted">Suggested for you:</span>${sugg.map(([t, act]) => `<button type="button" class="pill btnlike" data-act="${esc(act)}">+ ${esc(t)}</button>`).join("")}</div>
      ${excludedRow()}
      ${adv(`<div class="adv-body">
        <div>
          <div class="label">Genres</div><div class="pills">${genrePills()}</div>
          <div class="label" style="margin-top:1rem">Format</div><div class="pills">${formatPills()}</div>
          <div class="hint">Tags: type them in the search above, there are too many to list.</div>
        </div>
        <div>
          <div class="label">Country of origin</div><div class="pills">${countryPills()}</div>
          <div class="label" style="margin-top:1rem">First released</div>${years()}
          <div class="label" style="margin-top:1rem">Options</div>
          <div class="toggles">
            ${toggle("mainTheme", "Only where the chosen genres and tags are the main theme")}
            ${toggle("finishedOnly", "Finished only")}
            ${toggle("hideListed", "Hide titles on my list, in any format")}
            ${toggle("hideSeen", seenLabel())}
          </div>
        </div>
        <div class="adv-foot"><span class="muted">Everything here also shows as a chip in the search box.</span><button type="button" class="btn ghost" data-act="reset">Reset</button><button type="button" class="btn ghost" data-act="adv">Close</button></div>
      </div>`)}
    </div>`;
  }

  /* D: a sentence of dropdowns, advanced as tabs */
  function variantD() {
    const x = f();
    const slot = (text, set) => (open, key) =>
      `<button type="button" class="slot ${set ? "set" : ""} ${open ? "open" : ""}" data-act="pop:${key}">${esc(text)}${I.caret}</button>`;
    const gText = x.genres.length ? (x.genres.length > 3 ? `${x.genres.slice(0, 2).join(", ")} & ${x.genres.length - 2} more` : and(x.genres)) : "any genre";
    const fText = x.formats.length ? `${or(x.formats.map(fmt))}${S.kind === "ANIME" ? "" : ""}` : kindWord();
    const yText = x.yearFrom && x.yearTo
      ? x.yearFrom === x.yearTo ? `in ${x.yearFrom}` : `between ${x.yearFrom} and ${x.yearTo}`
      : x.yearFrom ? `from ${x.yearFrom}` : x.yearTo ? `until ${x.yearTo}` : "any year";
    const statusPop = () =>
      `<div style="display:grid">${check(!x.finishedOnly, "Finished or still releasing", "set-finished:0", null, true)}${check(x.finishedOnly, "Finished only", "set-finished:1", null, true)}</div>`;
    const tabs = [
      ["tags", "Tags", x.tags.length + (x.mainTheme ? 1 : 0)],
      ["origin", "Country", x.countries.length],
      ["list", "My list", (x.hideListed ? 0 : 1) + (x.hideSeen ? 1 : 0)],
      ["excluded", "Excluded", S.exclude[S.kind].length],
    ];
    const body = {
      tags: `${tagPicker()}<div style="margin-top:.9rem">${toggle("mainTheme", "Only where the chosen genres and tags are the main theme")}</div>`,
      origin: `<div class="label">Country of origin</div><div class="pills">${countryPills()}</div><div class="hint muted" style="font-size:.78rem;margin-top:.6rem">Pick none for all countries.</div>`,
      list: `<div class="toggles">${toggle("hideListed", "Hide titles on my list, in any format (light novel, OVA, recap film…)")}${toggle("hideSeen", seenLabel())}</div>`,
      excluded: S.exclude[S.kind].length
        ? `${excludedRow()}<div class="muted" style="font-size:.78rem;margin-top:.6rem">Labels you excluded from a title's details. Click one to put it back.</div>`
        : '<div class="muted">Nothing excluded. Exclude a genre or tag from any title\'s details.</div>',
    };
    return `<div class="fx fx-d" data-measure data-variant="d" data-tour="filters">
      <div class="sentence">
        <span>Show me</span>
        ${dd("d", "genres", slot(gText, x.genres.length), genrePop, "wide")}
        ${dd("d", "format", slot(fText, x.formats.length), formatPop)}
        <span>released</span>
        ${dd("d", "years", slot(yText, x.yearFrom || x.yearTo), yearPop)}
        <span>that are</span>
        ${dd("d", "status", slot(x.finishedOnly ? "finished" : "finished or airing", x.finishedOnly), statusPop)}
        <div class="push">${advBtn("More filters")}${applyBtns(false)}</div>
      </div>
      ${S.adv ? "" : S.exclude[S.kind].length ? excludedRow() : ""}
      ${adv(`<div class="tabs-d">${tabs.map(([k, t, n]) => `<button type="button" class="${S.tab === k ? "on" : ""}" data-act="tab:${k}">${t}${n ? `<span class="count">${n}</span>` : ""}</button>`).join("")}
          <span style="margin-left:auto;align-self:center"><button type="button" class="linkish muted" data-act="reset" style="font-size:.8rem;margin-right:.8rem">Reset all</button></span></div>
        <div class="tab-body">${body[S.tab]}</div>`)}
    </div>`;
  }

  /* A, refined after feedback (A1–A3). Common to all three:
     - Main theme moves into the Genres dropdown: it mostly decides genres ("romance as the story,
       not a subplot"). Tags get their own "central to the story" switch in Advanced (rank 70+).
     - Kept and excluded labels are shown the same way: no label on either (A1, A3) or both (A2).
     - No Reset button in the row; "Clear all" sits at the end of the chips. */
  const genrePopR = () =>
    `<div class="pop-grid">${GENRES.map((g) => check(f().genres.includes(g), g, `genre:${g}`, `genre:${g}`)).join("")}</div>
     <div class="pop-theme">${toggle("mainTheme", "Only where they're the main theme", "small")}<div class="muted">Romance as the story, not an action show with a romance subplot</div></div>
     <div class="pop-foot"><span class="muted">Titles must have every genre you pick</span><button type="button" class="linkish" data-act="clear:genres">Clear</button></div>`;
  /** Status as a list like Format: pick any number, or none for any status. */
  const statusPop = () =>
    `<div style="display:grid">${STATUSES.map(([k, n]) => check(f().statuses.includes(k), n, `status:${k}`)).join("")}</div>
     <div class="pop-foot"><span class="muted">Any of these. None picked means any status.</span><button type="button" class="linkish" data-act="clear:statuses">Clear</button></div>`;
  const statusesText = (x) => (x.statuses.length > 2 ? `${statusName(x.statuses[0])} +${x.statuses.length - 1}` : x.statuses.map(statusName).join(", "));
  const genresText = (x) => (x.genres.length > 2 ? `${x.genres[0]} +${x.genres.length - 1}` : x.genres.join(", "));
  const formatsText = (x) => (x.formats.length > 2 ? `${fmt(x.formats[0])} +${x.formats.length - 1}` : x.formats.map(fmt).join(", "));
  /** Labels the search keeps, as removable chips. */
  function keptChips() {
    const x = f();
    const yr = x.yearFrom && x.yearTo
      ? x.yearFrom === x.yearTo ? `${x.yearFrom}` : `${x.yearFrom}–${x.yearTo}`
      : x.yearFrom ? `From ${x.yearFrom}` : x.yearTo ? `Until ${x.yearTo}` : null;
    const out = [
      ...x.genres.map((g) => [esc(g), `genre:${g}`]),
      ...(x.mainTheme && x.genres.length ? [["Main theme", "opt:mainTheme"]] : []),
      ...x.formats.map((v) => [fmt(v), `format:${v}`]),
      ...(yr ? [[yr, "year-clear:both"]] : []),
      ...(x.finishedOnly ? [["Finished only", "opt:finishedOnly"]] : []),
      ...x.statuses.map((k) => [statusName(k), `status:${k}`]),
      ...x.tags.map((t) => [esc(t), `tag-rm:${t}`]),
      ...(x.tagMin && x.tags.length ? [[`Tags ${x.tagMin}%+`, "tagmin-clear"]] : []),
      ...x.countries.map((c) => [country(c), `country:${c}`]),
      ...(!x.hideListed ? [["Showing listed titles", "opt:hideListed"]] : []),
      ...(x.hideSeen ? [["Hiding seen adaptations", "opt:hideSeen"]] : []),
    ];
    return out.map(([label, a]) => `<button type="button" class="pill btnlike on" data-act="${esc(a)}" title="Remove">${label} <span class="x">✕</span></button>`);
  }
  /** Labels excluded from this search; "not" says so on the chip itself when there's no group label. */
  const notChips = (prefix) =>
    S.exclude[S.kind].map(
      (key) => `<button type="button" class="pill btnlike excluded noted" data-act="unexclude:${esc(key)}" title="Excluded from this search. Click to put it back">${prefix ? '<span class="kind">not</span> ' : ""}${esc(key.split(":")[1])} <span class="x">✕</span></button>`,
    );
  const applyR = () =>
    `<button type="button" class="btn primary ${dirty() ? "" : "idle"}" data-act="apply">Apply</button>${dirty() ? '<span class="pending">Unapplied changes</span>' : ""}`;
  const clearAll = '<button type="button" class="linkish muted clear-all" data-act="clear-all">Clear all</button>';
  /** Minimum tag percentage: 0 means off. Dimmed until a tag is picked, since it only applies to tags. */
  const tagMinText = (v) => (v ? `${v}%+` : "Off");
  const tagSlider = () => {
    const x = f();
    const idle = !x.tags.length;
    return `<div class="tagmin ${x.tagMin ? "on" : ""} ${idle ? "idle" : ""}">
      <div class="tagmin-head"><span>Minimum tag percentage</span><b data-tagmin-val>${tagMinText(x.tagMin)}</b>${x.tagMin ? '<button type="button" class="linkish muted" data-act="tagmin-clear">Turn off</button>' : ""}</div>
      <input type="range" min="0" max="100" step="5" value="${x.tagMin}" data-tagmin aria-label="Minimum tag percentage" style="--p:${x.tagMin}%">
      <div class="tagmin-ticks"><span>Off</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>
      <div class="hint">${idle ? "Applies once you pick a tag." : "Only count a tag where AniList ranks it at least this relevant to the title."}</div>
    </div>`;
  };
  /** Advanced for A1–A3: tags with their own switch, then origin and list rules. */
  const advR = () => adv(`<div class="adv-body">
      <div>
        <div class="label">Tags</div>
        ${tagPicker()}
        ${tagSlider()}
      </div>
      <div>
        <div class="label">Country of origin</div>
        <div class="pills">${countryPills()}</div>
        <div class="label" style="margin-top:1rem">Your list</div>
        <div class="toggles">
          ${toggle("hideListed", "Hide titles on my list, in any format (light novel, OVA, recap film…)")}
          ${toggle("hideSeen", seenLabel())}
        </div>
      </div>
    </div>`);

  /* A1: packed row. Apply follows Advanced, so there's no gap; one unlabelled line of chips. */
  function variantA1() {
    const x = f();
    const all = [...keptChips(), ...notChips(true)];
    return `<div class="fx fx-a1" data-measure data-variant="a1" data-tour="filters">
      <div class="fx-row">
        ${dd("a1", "genres", trig("Genres", genresText(x) || "Any", x.genres.length), genrePopR, "wide")}
        ${dd("a1", "format", trig("Format", formatsText(x) || "Any", x.formats.length), formatPop)}
        ${dd("a1", "years", trig("Released", yearsText(x) || "Any", x.yearFrom || x.yearTo), yearPop)}
        ${toggle("finishedOnly", "Finished only", "small")}
        <span class="vline"></span>
        ${advBtn("Advanced", "", advCountR(x))}
        ${applyR()}
      </div>
      ${all.length ? `<div class="chiprow">${all.join("")}${clearAll}</div>` : ""}
      ${advR()}
    </div>`;
  }

  /* A2: AniList-style labelled fields that stretch to fill the row; both chip groups labelled. */
  function variantA2() {
    const x = f();
    const field = (id, name, val, set, pop, popCls = "") =>
      dd("a2", id, (open, key) =>
        `<button type="button" class="fld ${set ? "set" : ""} ${open ? "open" : ""}" data-act="pop:${key}"><span class="fld-name">${name}</span><span class="fld-val"><span>${esc(val)}</span>${I.caret}</span></button>`,
        pop, popCls);
    const kept = keptChips();
    const not = notChips(false);
    return `<div class="fx fx-a2" data-measure data-variant="a2" data-tour="filters">
      <div class="fields">
        ${field("genres", "Genres", genresText(x) || "Any", x.genres.length, genrePopR, "wide")}
        ${field("format", "Format", formatsText(x) || "Any", x.formats.length, formatPop)}
        ${field("years", "Released", yearsText(x) || "Any", x.yearFrom || x.yearTo, yearPop)}
        ${field("status", "Status", statusesText(x) || "Any", x.statuses.length, statusPop)}
        ${advBtn("Advanced", "", advCountR(x))}
        <button type="button" class="btn primary ${dirty() ? "" : "idle"}" data-act="apply">Apply</button>
      </div>
      <div class="sumrow">
        <span class="sum-label">Including</span>${kept.length ? kept.join("") : '<span class="muted">Everything</span>'}
        ${not.length ? `<span class="sum-sep"></span><span class="sum-label">Excluding</span>${not.join("")}` : ""}
        <span class="push">${dirty() ? '<span class="pending">Unapplied changes</span>' : ""}${kept.length || not.length ? clearAll : ""}</span>
      </div>
      ${advR()}
    </div>`;
  }

  /* A3: one row. Triggers show a name (and count); values appear once, as chips in the same row. */
  /* A3: one row that never grows. Triggers show a name (and count); values appear once, as chips
     in a strip that scrolls sideways once they outgrow it, with a "+N" count of the hidden ones. */
  function variantA3() {
    const x = f();
    const t = (name, n, set) => (open, key) =>
      `<button type="button" class="trigger ${set ? "set" : ""} ${open ? "open" : ""}" data-act="pop:${key}"><span class="t-name">${name}</span>${n ? `<span class="count">${n}</span>` : ""}${I.caret}</button>`;
    const all = [...keptChips(), ...notChips(true)];
    return `<div class="fx fx-a3" data-measure data-variant="a3" data-tour="filters">
      <div class="fx-row">
        ${dd("a3", "genres", t("Genres", x.genres.length, x.genres.length), genrePopR, "wide")}
        ${dd("a3", "format", t("Format", x.formats.length, x.formats.length), formatPop)}
        ${dd("a3", "years", t("Released", 0, x.yearFrom || x.yearTo), yearPop)}
        ${dd("a3", "status", t("Status", x.statuses.length, x.statuses.length), statusPop)}
        ${advBtn("Advanced", "", advCountR(x))}
        <div class="chip-strip">
          <div class="chip-track" data-scroll="a3-chips" data-count="${all.length}">${all.length ? all.join("") : '<span class="muted">No filters: picks from everything</span>'}</div>
          <button type="button" class="chip-more l" data-act="chips:-1" aria-label="Scroll filters left">${I.next}</button>
          <button type="button" class="chip-more r" data-act="chips:1" aria-label="Scroll filters right"><span class="n"></span>${I.next}</button>
        </div>
        ${all.length ? '<button type="button" class="round small" data-act="clear-all" title="Clear all" aria-label="Clear all">✕</button>' : ""}
        <button type="button" class="btn primary ${dirty() ? "" : "idle"}" data-act="apply" title="${dirty() ? "Unapplied changes" : "Apply also rereads your lists"}">Apply${dirty() ? '<span class="dot-new"></span>' : ""}</button>
      </div>
      ${advR()}
    </div>`;
  }

  const RENDER = { today, a: variantA, a1: variantA1, a2: variantA2, a3: variantA3, b: variantB, c: variantC, d: variantD };
  const COMPARE = ["today", "a", "a1", "a2", "a3"];
  const TITLES = {
    today: ["Today", "what ships now"],
    a: ["A · Dropdown bar", "first pass"],
    a1: ["A1 · Packed row", "Apply beside Advanced; one unlabelled line of chips"],
    a2: ["A2 · Full-width fields", "labelled fields fill the row; Including and Excluding labelled alike"],
    a3: ["A3 · Single row", "values appear once, as chips in the same row"],
    b: ["B · Genre strip", "genres stay one click away, the rest compact"],
    c: ["C · Smart search", "one field for genres, tags, formats and years"],
    d: ["D · Sentence", "the filters read as a sentence; advanced as tabs"],
  };

  /* Notes */
  const SHARED = `<details><summary class="k">Same in every variant</summary><ul>
    <li><b>Basic:</b> genres, format, released, finished only. <b>Advanced:</b> tags, country, main theme, list and adaptation rules.</li>
    <li>Apply stays, since every run costs AniList requests. It's grey until something changes, then lights up next to “Unapplied changes”.</li>
    <li>The Advanced button shows a count of advanced filters that are on, so a closed section never hides what's shaping the picks.</li>
    <li>“Excluded from this search” stays in the basic block: one click to undo.</li>
    <li>The <code>filtersOpen</code> setting becomes “advanced open”, closed by default. The tour's Filters step points at the basic block.</li></ul></details>`;
  const SHARED_R = `<details><summary class="k">Changed from A, in all three</summary><ul>
    <li><b>Main theme</b> moved into the Genres dropdown, since it mostly decides genres. Tags get a <b>minimum tag percentage</b> slider in Advanced instead of the fixed 70+: 0 means off, anything above sends AniList's <code>minimumTagRank</code>. The engine's <code>mainTheme</code> would then only cover genres, plus a new number for tags.</li>
    <li><b>Kept and excluded labels look alike:</b> either neither has a group label (excluded chips are red and start with “not”) or both do.</li>
    <li><b>No Reset button</b> in the row: “Clear all” ends the chips.</li>
    <li>Same as before: Apply is grey until something changes, and the Advanced count shows advanced filters that are on.</li></ul></details>`;
  const NOTES = {
    a1: `<h4>A1 · Packed row</h4><p>Apply sits right after Advanced, so there's no gap in the middle; any spare room falls at the end of the row, where it reads as natural. Kept and excluded labels share one line of chips without a label.</p>
      <div class="k">Good</div><ul><li>Smallest change from A</li><li>Values readable at a glance in the triggers</li></ul>
      <div class="k">Watch</div><ul><li>Values show twice: in the trigger and as chips</li><li>Spare width at the end on wide screens</li></ul>`,
    a2: `<h4>A2 · Full-width fields</h4><p>AniList Browse style: labelled fields stretch to fill the row at any width, so there's never empty space. Finished only becomes a Status field so every control has the same shape. Below, <b>Including</b> and <b>Excluding</b> are labelled the same way.</p>
      <div class="k">Good</div><ul><li>The most structured and the most AniList-like</li><li>No gaps at any width</li><li>Room for another field later</li></ul>
      <div class="k">Watch</div><ul><li>Tallest of the three: two-line fields</li><li>Values show twice, in the fields and as chips</li></ul>`,
    a3: `<h4>A3 · Single row</h4><p>Triggers show only a name and a count, and the values appear once, as chips in the same row. Excluded labels sit in the same run, red and starting with “not”.</p>
      <p><b>The row never grows.</b> Once the chips outgrow their space they scroll sideways: the edges fade, an arrow shows “+N” hidden, the mouse wheel scrolls them, and a newly added chip scrolls into view.</p>
      <p><b>Status</b> is a list like Format (Finished, Releasing, Not yet released, On hiatus, Cancelled). None picked means any status, so there's no “any” option. The engine's <code>finishedOnly</code> would become a list of statuses, which AniList's search takes as <code>status_in</code>. The mock covers are all finished titles.</p>
      <div class="k">Good</div><ul><li>Always one row, the shortest block</li><li>Nothing said twice</li></ul>
      <div class="k">Watch</div><ul><li>Chips past the edge are out of sight until you scroll; the +N count says how many</li><li>You read the chips, not the triggers, to see what's chosen</li></ul>`,
    today: `<h4>Today</h4><p>Every filter on show at once. On a laptop the picks start below the fold. It's open by default because the minimised bar was easy to miss.</p><p>Try <b>Minimise</b> to see the bar it collapses to.</p>`,
    a: `<h4>A · Dropdown bar</h4><p>One row of dropdowns, like AniList's own Browse page, so the people using this already know it. Every active filter, advanced ones too, shows as a removable chip under the row.</p>
      <div class="k">Good</div><ul><li>Shortest version that still labels every basic filter</li><li>Familiar from AniList</li><li>New filters are just another dropdown</li></ul>
      <div class="k">Watch</div><ul><li>Picking genres takes two clicks (open, pick)</li><li>Values sit behind triggers; the chips make up for it</li></ul>`,
    b: `<h4>B · Genre strip</h4><p>Genres stay as one-click pills, ordered by Your taste, on one scrolling line (<b>Show all</b> wraps them). Format, years and finished only fit on a compact second row.</p>
      <div class="k">Good</div><ul><li>Closest to today, so the least to relearn</li><li>The most-used filter stays visible</li></ul>
      <div class="k">Watch</div><ul><li>Tallest of the four: two rows</li><li>Genres past the edge are hidden until you scroll</li><li>Less room for future basic filters</li></ul>`,
    c: `<h4>C · Smart search</h4><p>One field takes genres, tags, formats, countries, years (type “2016”) and options, and each pick becomes a chip inside it. Suggestions come from Your taste. Advanced becomes <b>Browse all</b>, a click-only panel for people who'd rather not type.</p>
      <div class="k">Good</div><ul><li>The most compact</li><li>Best for tags: there are hundreds, and they're already a search today</li><li>Genres and tags merge, and users treat them as the same thing anyway</li></ul>
      <div class="k">Watch</div><ul><li>Hidden affordance: you need to know what you can type</li><li>Worse for browsing</li><li>Needs good matching (“sci fi” should find Sci-Fi)</li></ul>`,
    d: `<h4>D · Sentence</h4><p>The basic filters read as a sentence, and each underlined part is a dropdown. Advanced opens as tabs (Tags · Country · My list · Excluded), so even the open state stays short.</p>
      <div class="k">Good</div><ul><li>The friendliest, and it explains itself: “Action & Drama” shows that genres must all match</li><li>The tabs keep the open state at about half of today's height</li></ul>
      <div class="k">Watch</div><ul><li>Wraps awkwardly once lots of genres are picked</li><li>Harder to scan than labelled controls</li><li>Tabs hide advanced filters from each other (the counts help)</li></ul>`,
    compare: `<h4>Compare all</h4><p>Today, the first dropdown pass and the three refinements over the same filters, each with its height. Switch to <b>Advanced</b> in the top bar to compare the open state too. Clicks in any block change all of them.</p>`,
  };

  /* Results */
  const passes = (m, x, ex) =>
    x.genres.every((g) => m.genres.includes(g)) &&
    x.tags.every((t) => m.tags.includes(t)) &&
    (!x.formats.length || x.formats.includes(m.format)) &&
    (x.yearFrom == null || m.year >= x.yearFrom) &&
    (x.yearTo == null || m.year <= x.yearTo) &&
    (!x.countries.length || x.countries.includes("JP")) &&
    (!x.statuses.length || x.statuses.includes("FINISHED")) &&
    !ex.some((k) => {
      const [kind, v] = k.split(":");
      return kind === "tag" ? m.tags.includes(v) : kind === "genre" ? m.genres.includes(v) : false;
    });
  const card = (m, i) => `<div class="card" role="button" tabindex="0">
      <div class="cv"><img src="${m.cover}" alt="" loading="lazy">
        <span class="rank ${i < 3 ? "top3" : ""}">#${i + 1}</span>
        <span class="format">${fmt(m.format)}</span>
        <button type="button" class="nope" title="Not interested">✕</button>
        <span class="score"><i style="background:${scoreColour(m.score)}"></i>${m.score}%</span>
        <span class="users">${compact(m.users)}</span>
      </div>
      <h3>${esc(m.title)}</h3>
      <div class="meta">${m.year} · Finished</div>
      <div class="main">Mainly ${esc(m.genres.slice(0, 2).join(" & "))}</div>
      <div class="tags">${m.tags.slice(0, 2).map((t) => `<span class="pill">${esc(t)}</span>`).join("")}</div>
    </div>`;
  let resultsKey = "";
  function renderResults() {
    const el = document.getElementById("results");
    const key = JSON.stringify([S.variant === "compare", S.kind, S.applied[S.kind], S.exclude[S.kind]]);
    if (key === resultsKey) return;
    resultsKey = key;
    if (S.variant === "compare") {
      el.innerHTML = "";
      return;
    }
    const list = MOCK[S.kind === "ANIME" ? "anime" : "manga"].filter((m) => passes(m, S.applied[S.kind], S.exclude[S.kind]));
    el.innerHTML = list.length
      ? `<div class="grid">${list.map(card).join("")}</div>`
      : '<div class="empty"><h2>Nothing matches</h2><p>Try fewer filters or fewer exclusions.</p></div>';
  }

  /* Render */
  function render() {
    const host = document.getElementById("filters");
    const scroll = {};
    const counts = {};
    host.querySelectorAll("[data-scroll]").forEach((s) => {
      const k = s.closest("[data-variant]").dataset.variant + s.dataset.scroll;
      scroll[k] = s.scrollLeft;
      counts[k] = Number(s.dataset.count ?? 0);
    });
    if (S.variant === "compare") {
      host.innerHTML = `<div class="compare">${COMPARE
        .map((v) => `<h2>${TITLES[v][0]} <small>${TITLES[v][1]}</small><span class="h-px" data-h="${v}"></span></h2>${RENDER[v]()}`)
        .join("")}</div>`;
    } else host.innerHTML = RENDER[S.variant]();
    host.querySelectorAll("[data-scroll]").forEach((s) => {
      const k = s.closest("[data-variant]").dataset.variant + s.dataset.scroll;
      if (scroll[k]) s.scrollLeft = scroll[k];
      // A chip was added: bring the end of the strip, where it lands, into view.
      if (k in counts && Number(s.dataset.count ?? 0) > counts[k]) s.scrollTo({ left: s.scrollWidth, behavior: "smooth" });
    });
    requestAnimationFrame(updateStrips);
    renderResults();
    document.getElementById("notes").innerHTML = `<button type="button" data-act="hide-notes" aria-label="Hide notes">✕</button>${NOTES[S.variant]}${/^a\d$/.test(S.variant) || S.variant === "compare" ? SHARED_R : SHARED}`;
    document.getElementById("sub").textContent = `${S.kind === "ANIME" ? "Anime" : "Manga"} picks from your AniList · updated 2 min ago`;
    syncBar();
    if (S.refocus) {
      const input = host.querySelector(S.refocus);
      S.refocus = null;
      if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
        if (input.matches("[data-tagsearch]")) showTagMenu(input);
      }
    }
    requestAnimationFrame(measure);
  }
  function measure() {
    const vh = window.innerHeight;
    const blocks = [...document.querySelectorAll("#filters [data-measure]")];
    for (const b of blocks) {
      const tag = document.querySelector(`[data-h="${b.dataset.variant}"]`);
      if (tag) tag.textContent = `${b.offsetHeight} px tall`;
    }
    const m = document.getElementById("r-measure");
    if (S.variant === "compare" || !blocks[0]) {
      m.style.display = "none";
      return;
    }
    m.style.display = "";
    const h = blocks[0].offsetHeight;
    const pct = Math.round((h / vh) * 100);
    m.innerHTML = `Filter block <b class="${pct > 30 ? "bad" : "good"}">${h} px</b> · ${pct}% of the window`;
  }
  function syncBar() {
    const on = (id, v) => document.querySelectorAll(`#${id} button`).forEach((b) => b.classList.toggle("on", b.dataset.v === v));
    on("r-variant", S.variant);
    on("r-earlier", S.variant);
    on("r-adv", S.adv ? "1" : "0");
    on("kind", S.kind);
    document.getElementById("r-adv").style.opacity = S.variant === "today" ? 0.35 : 1;
    if (location.hash.slice(1) !== S.variant) history.replaceState(null, "", `#${S.variant}`);
  }
  /** Fades, arrows and the "+N hidden" count for each chip strip. */
  function updateStrips() {
    document.querySelectorAll(".chip-strip").forEach((strip) => {
      const t = strip.querySelector(".chip-track");
      const over = t.scrollWidth > t.clientWidth + 1;
      const left = over && t.scrollLeft > 1;
      const right = over && t.scrollLeft + t.clientWidth < t.scrollWidth - 1;
      strip.classList.toggle("fade-l", left);
      strip.classList.toggle("fade-r", right);
      const edge = t.scrollLeft + t.clientWidth;
      const hidden = [...t.children].filter((c) => c.offsetLeft + c.offsetWidth / 2 > edge).length;
      strip.querySelector(".chip-more.r .n").textContent = hidden ? `+${hidden}` : "";
    });
  }
  function showTagMenu(input) {
    input.parentElement.querySelector(".tag-menu")?.remove();
    if (document.activeElement === input) input.insertAdjacentHTML("afterend", tagMenu());
  }
  function showOmniMenu() {
    document.querySelectorAll(".omni-slot").forEach((s) => (s.innerHTML = omniMenu()));
  }
  let toastTimer;
  function toast(text) {
    let t = document.getElementById("toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "toast";
      t.className = "toast";
      document.body.append(t);
    }
    t.textContent = text;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  }

  /* Actions */
  function act(name, arg, el) {
    const x = f();
    const scope = el?.closest("[data-variant]")?.dataset.variant;
    switch (name) {
      case "genre": x.genres = toggleIn(x.genres, arg); break;
      case "format": x.formats = toggleIn(x.formats, arg); break;
      case "tagmin-clear": x.tagMin = 0; break;
      case "status": x.statuses = toggleIn(x.statuses, arg); break;
      case "chips": {
        const track = el.closest(".chip-strip").querySelector(".chip-track");
        track.scrollBy({ left: Number(arg) * track.clientWidth * 0.8, behavior: "smooth" });
        return;
      }
      case "country": x.countries = toggleIn(x.countries, arg); break;
      case "tag-add":
        if (!x.tags.includes(arg)) x.tags.push(arg);
        S.tagQ = "";
        if (el?.closest(".tag-menu") && scope) S.refocus = `[data-variant="${scope}"] [data-tagsearch]`;
        break;
      case "tag-rm": x.tags = x.tags.filter((t) => t !== arg); break;
      case "opt": x[arg] = !x[arg]; break;
      case "set-finished": x.finishedOnly = arg === "1"; S.pop = null; break;
      case "clear": x[arg] = []; break;
      case "year-clear":
        if (arg !== "to") x.yearFrom = null;
        if (arg !== "from") x.yearTo = null;
        break;
      case "year-from": x.yearFrom = Number(arg); break;
      case "year-to": x.yearTo = Number(arg); break;
      case "year-in": x.yearFrom = x.yearTo = Number(arg); break;
      case "preset":
        Object.assign(x, {
          last5: { yearFrom: NOW - 4, yearTo: null },
          "2010s": { yearFrom: 2010, yearTo: 2019 },
          "2000s": { yearFrom: 2000, yearTo: 2009 },
          pre2000: { yearFrom: null, yearTo: 1999 },
        }[arg]);
        break;
      case "pop": S.pop = S.pop === arg ? null : arg; break;
      case "adv": S.adv = !S.adv; S.pop = null; break;
      case "more": S.more = !S.more; break;
      case "tab": S.tab = arg; break;
      case "today-toggle": S.todayOpen = !S.todayOpen; break;
      case "strip-next": el.closest(".strip").querySelector(".scroller").scrollBy({ left: 260 }); return;
      case "reset": S.draft[S.kind] = blank(); break;
      case "clear-all":
        S.draft[S.kind] = blank();
        S.exclude[S.kind] = [];
        break;
      case "apply": {
        S.applied[S.kind] = clone(x);
        const req = new Set([...x.genres.map((g) => `genre:${g}`), ...x.tags.map((t) => `tag:${t}`)]);
        S.exclude[S.kind] = S.exclude[S.kind].filter((k) => !req.has(k));
        S.pop = null;
        toast("Picks updated");
        break;
      }
      case "unexclude":
        S.exclude[S.kind] = S.exclude[S.kind].filter((k) => k !== arg);
        toast(`${arg.split(":")[1]} is back in this search`);
        break;
      case "hide-notes": document.body.classList.add("no-notes"); syncNotes(); return;
      case "noop": return;
    }
    if (el?.closest(".omni") && name !== "pop") {
      S.omniQ = "";
      S.omniHi = 0;
      S.refocus = "[data-omni]";
    }
    render();
  }

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (S.pop && !e.target.closest(".dd")) {
      S.pop = null;
      if (!el) render();
    }
    if (!el || el.disabled) return;
    const [name, ...rest] = el.dataset.act.split(":");
    act(name, rest.join(":"), el);
  });
  // Keep focus in the search fields while picking from their menus.
  document.addEventListener("mousedown", (e) => {
    if (e.target.closest(".tag-menu, .omni-menu")) e.preventDefault();
  });
  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t.matches("[data-omni]")) {
      S.omniQ = t.value;
      S.omniHi = 0;
      showOmniMenu();
    } else if (t.matches("[data-tagsearch]")) {
      S.tagQ = t.value;
      showTagMenu(t);
    } else if (t.matches("[data-tagmin]")) {
      // Update in place while dragging; a full render would drop the drag.
      f().tagMin = Number(t.value);
      t.style.setProperty("--p", `${t.value}%`);
      const box = t.closest(".tagmin");
      box.classList.toggle("on", f().tagMin > 0);
      box.querySelector("[data-tagmin-val]").textContent = tagMinText(f().tagMin);
    } else if (t.matches("[data-year]")) {
      const v = t.value.trim();
      f()[t.dataset.year === "from" ? "yearFrom" : "yearTo"] = /^\d{4}$/.test(v) ? Number(v) : null;
    }
  });
  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.matches("[data-opt]")) {
      f()[t.dataset.opt] = t.checked;
      render();
    } else if (t.matches("[data-year]")) setTimeout(render, 120);
    else if (t.matches("[data-tagmin]")) render();
  });
  document.addEventListener("focusin", (e) => {
    if (e.target.matches("[data-omni]")) {
      S.omniFocus = true;
      showOmniMenu();
    } else if (e.target.matches("[data-tagsearch]")) showTagMenu(e.target);
  });
  document.addEventListener("focusout", (e) => {
    const t = e.target;
    if (t.matches("[data-omni]"))
      setTimeout(() => {
        if (!document.activeElement?.matches("[data-omni]")) {
          S.omniFocus = false;
          showOmniMenu();
        }
      }, 120);
    else if (t.matches("[data-tagsearch]")) setTimeout(() => showTagMenu(t), 120);
  });
  document.addEventListener("keydown", (e) => {
    const t = e.target;
    if (e.key === "Escape" && S.pop) {
      S.pop = null;
      render();
      return;
    }
    if (t.matches("[data-tagsearch]") && e.key === "Enter") {
      const first = t.parentElement.querySelector(".tag-menu button");
      if (first) {
        e.preventDefault();
        act("tag-add", first.dataset.act.slice(8), first);
      }
    }
    if (!t.matches("[data-omni]")) return;
    const items = [...t.closest(".omni").querySelectorAll("[data-omni-item]")].filter((b) => b.dataset.act !== "noop");
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      S.omniHi = (S.omniHi + (e.key === "ArrowDown" ? 1 : -1) + items.length) % Math.max(items.length, 1);
      showOmniMenu();
    } else if (e.key === "Enter" && items[S.omniHi]) {
      e.preventDefault();
      const [name, ...rest] = items[S.omniHi].dataset.act.split(":");
      act(name, rest.join(":"), items[S.omniHi]);
    } else if (e.key === "Backspace" && !t.value) {
      const last = [...t.closest(".omni-box").querySelectorAll(".pill")].at(-1);
      if (last) {
        const [name, ...rest] = last.dataset.act.split(":");
        act(name, rest.join(":"), last);
      }
    } else if (e.key === "Escape") t.blur();
  });

  /* Review bar */
  const bar = (id, fn) =>
    document.getElementById(id).addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (b) fn(b.dataset.v);
    });
  const pickVariant = (v) => {
    S.variant = v;
    S.pop = null;
    render();
    window.scrollTo({ top: 0 });
  };
  bar("r-variant", pickVariant);
  bar("r-earlier", pickVariant);
  bar("r-adv", (v) => {
    S.adv = v === "1";
    render();
  });
  bar("kind", (v) => {
    S.kind = v;
    S.pop = null;
    S.tagQ = "";
    render();
  });
  bar("r-theme", (v) => {
    document.documentElement.dataset.theme = v;
    document.querySelectorAll("#r-theme button").forEach((b) => b.classList.toggle("on", b.dataset.v === v));
  });
  function syncNotes() {
    const shown = !document.body.classList.contains("no-notes");
    document.querySelectorAll("#r-notes button").forEach((b) => b.classList.toggle("on", (b.dataset.v === "1") === shown));
  }
  bar("r-notes", (v) => {
    document.body.classList.toggle("no-notes", v === "0");
    syncNotes();
  });
  window.addEventListener("hashchange", () => {
    const v = location.hash.slice(1);
    if (VARIANTS.includes(v) && v !== S.variant) {
      S.variant = v;
      render();
    }
  });
  window.addEventListener("resize", () => requestAnimationFrame(() => {
    measure();
    updateStrips();
  }));
  document.addEventListener("scroll", (e) => e.target.matches?.(".chip-track") && updateStrips(), true);
  // A mouse wheel scrolls the chip strip sideways, so mouse users needn't hold Shift.
  document.addEventListener("wheel", (e) => {
    const t = e.target.closest?.(".chip-track");
    if (!t || t.scrollWidth <= t.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    t.scrollLeft += e.deltaY;
    e.preventDefault();
  }, { passive: false });
  render();
})();
