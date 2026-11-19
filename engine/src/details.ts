/** A title's details for its dialog: synopsis, trailer, characters with voice actors, and key staff. */

/** A person or character with a picture. */
export interface Person {
  id: number;
  name: string;
  image: string | null;
}

export interface Character extends Person {
  /** MAIN, SUPPORTING or BACKGROUND. */
  role: string;
  /** Japanese voice actor (anime only). */
  voiceActor: Person | null;
}

export interface StaffMember extends Person {
  /** Their key roles on this title, such as ["Director", "Series Composition"]. */
  roles: string[];
}

/**
 * A title's trailer. Seanime's sandboxed page can only link to it; the browser extension's
 * pages can embed it (`embedUrl`).
 */
export interface Trailer {
  site: "youtube" | "dailymotion";
  /** The video's page, such as https://www.youtube.com/watch?v=… */
  url: string;
  embedUrl: string;
  /** A preview image (YouTube's is 4:3 with bars; crop it to 16:9). */
  thumbnail: string | null;
}

export interface TitleDetails {
  description: string;
  /** `null` when AniList has none, or it's on a site we can't link to. */
  trailer: Trailer | null;
  characters: Character[];
  staff: StaffMember[];
}

/**
 * Staff roles worth showing (and, in the lab's experiment, worth learning from). AniList names
 * a film's "Script Composition" what a series calls "Series Composition".
 */
export const KEY_STAFF_ROLES: ReadonlySet<string> = new Set([
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
  "Music",
]);

type Maybe<T> = T | null | undefined;
interface PersonNode {
  id: number;
  name?: Maybe<{ full?: Maybe<string> }>;
  image?: Maybe<{ medium?: Maybe<string> }>;
}

/** The `Media` part of a `queries.MEDIA_DETAILS` reply. */
export interface DetailsNode {
  description?: Maybe<string>;
  trailer?: Maybe<{ id?: Maybe<string>; site?: Maybe<string>; thumbnail?: Maybe<string> }>;
  characters?: Maybe<{
    edges?: Maybe<
      Maybe<{ role?: Maybe<string>; node?: Maybe<PersonNode>; voiceActors?: Maybe<PersonNode[]> }>[]
    >;
  }>;
  staff?: Maybe<{ edges?: Maybe<Maybe<{ role?: Maybe<string>; node?: Maybe<PersonNode> }>[]> }>;
}

function person(n: PersonNode): Person {
  return { id: n.id, name: n.name?.full ?? "", image: n.image?.medium ?? null };
}

/** Video IDs are letters, digits, `-` and `_`; anything else is refused rather than linked. */
const VIDEO_ID = /^[\w-]{1,32}$/;

/** AniList's trailer as a link, for the two sites AniList stores. */
export function parseTrailer(node: DetailsNode["trailer"]): Trailer | null {
  const id = node?.id ?? "";
  if (!VIDEO_ID.test(id)) return null;
  const thumbnail = node?.thumbnail?.startsWith("https://") ? node.thumbnail : null;
  if (node?.site === "youtube")
    return {
      site: "youtube",
      url: `https://www.youtube.com/watch?v=${id}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
      thumbnail: thumbnail ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    };
  if (node?.site === "dailymotion")
    return {
      site: "dailymotion",
      url: `https://www.dailymotion.com/video/${id}`,
      embedUrl: `https://geo.dailymotion.com/player.html?video=${id}`,
      thumbnail,
    };
  return null;
}

/** "Director (eps 1-12)" → "Director". */
function baseRole(role: string): string {
  return role.split(" (")[0]?.trim() ?? role;
}

/** Parse a details reply: key staff only, each person once with all their key roles. */
export function parseDetails(node: DetailsNode): TitleDetails {
  const characters = (node.characters?.edges ?? []).flatMap((e): Character[] => {
    if (!e?.node) return [];
    const va = e.voiceActors?.[0];
    return [{ ...person(e.node), role: e.role ?? "", voiceActor: va ? person(va) : null }];
  });
  const staff = new Map<number, StaffMember>();
  for (const e of node.staff?.edges ?? []) {
    if (!e?.node || !e.role) continue;
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
    description: node.description ?? "",
    trailer: parseTrailer(node.trailer),
    characters,
    staff: [...staff.values()],
  };
}
