/** How strongly a title is about each genre, and whether a genre is its main theme. Mirrors themes.py. */

import type { Media } from "./models.ts";

/** AniList's genres, Hentai aside. */
// biome-ignore format: one genre list, kept compact
export const GENRES = [
  "Action", "Adventure", "Comedy", "Drama", "Ecchi", "Fantasy", "Horror", "Mahou Shoujo",
  "Mecha", "Music", "Mystery", "Psychological", "Romance", "Sci-Fi", "Slice of Life",
  "Sports", "Supernatural", "Thriller",
] as const;

/** AniList tag categories that evidence each genre… */
export const GENRE_CATEGORIES: Readonly<Record<string, readonly string[]>> = {
  Action: ["Theme-Action", "Theme-Other-Organisations"],
  Comedy: ["Theme-Comedy"],
  Drama: ["Theme-Drama"],
  Fantasy: ["Theme-Fantasy"],
  Mecha: ["Theme-Sci-Fi-Mecha"],
  Music: ["Theme-Arts-Music"],
  Romance: ["Theme-Romance"],
  "Sci-Fi": ["Theme-Sci-Fi", "Theme-Sci-Fi-Mecha"],
  "Slice of Life": ["Theme-Slice of Life"],
  Sports: ["Theme-Game-Sport"],
};

/** …plus single tags, mostly for genres without a category of their own. */
export const GENRE_TAGS: Readonly<Record<string, readonly string[]>> = {
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
  Thriller: ["Conspiracy", "Crime", "Death Game"],
};

/**
 * Genres that drive a plot and so compete for "main theme". Comedy, Drama, Slice of Life and
 * the like sit alongside a main theme (a romcom is still a romance) and never compete.
 */
// biome-ignore format: kept compact
/**
 * Tags in a genre's category that say nothing about how central the genre is: "Heterosexual"
 * only says relationships exist (Re:Zero's light novel ranks it 80, which made Romance its
 * main theme), so it's never evidence.
 */
export const NOT_EVIDENCE: ReadonlySet<string> = new Set(["Heterosexual"]);

export const RIVALS: ReadonlySet<string> = new Set([
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
  "Thriller",
]);

/** A main theme needs evidence ranked at least this high. */
export const MAIN_MIN = 60;
/** Strength of a listed genre with no ranked tag behind it. */
export const GENRE_ONLY = 50;
/** A tag counts as a main theme from this rank. */
export const TAG_MAIN_MIN = 70;

/** A genre's strength (0-100) in a title, and whether it's the main theme. */
export interface Theme {
  genre: string;
  strength: number;
  main: boolean;
}

/** Judges themes from genres and ranked tags, given AniList's tag → category map. */
export class Themes {
  private readonly tags: Map<string, Set<string>>;

  constructor(tagCategories: Readonly<Record<string, string>>) {
    this.tags = new Map(
      GENRES.map((g) => {
        const categories = GENRE_CATEGORIES[g] ?? [];
        const names = Object.entries(tagCategories)
          .filter(([, c]) => categories.includes(c))
          .map(([n]) => n);
        return [
          g,
          new Set([...names, ...(GENRE_TAGS[g] ?? [])].filter((n) => !NOT_EVIDENCE.has(n))),
        ];
      }),
    );
  }

  /** Rank of the strongest tag evidencing `genre`; a listed genre is at least 50. */
  strength(media: Media, genre: string): number {
    const evidence = this.tags.get(genre);
    const best = Math.max(0, ...media.tags.filter((t) => evidence?.has(t.name)).map((t) => t.rank));
    return media.genres.includes(genre) ? Math.max(best, GENRE_ONLY) : best;
  }

  /**
   * Listed, and either the only plot-driving genre listed, or ranked at least 60 and at least
   * as strong as every rival genre listed.
   */
  isMain(media: Media, genre: string): boolean {
    if (!media.genres.includes(genre)) return false;
    const own = this.strength(media, genre);
    const rivals = media.genres
      .filter((g) => g !== genre && RIVALS.has(g))
      .map((g) => this.strength(media, g));
    return rivals.length === 0 || (own >= MAIN_MIN && rivals.every((r) => r <= own));
  }

  /** The title's genres, strongest first. */
  summary(media: Media): Theme[] {
    return media.genres
      .map((g) => ({ genre: g, strength: this.strength(media, g), main: this.isMain(media, g) }))
      .sort((a, b) => b.strength - a.strength);
  }
}
