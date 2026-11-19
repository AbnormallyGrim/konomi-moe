import {
  judge,
  type MediaType,
  makeRunOptions,
  NoSyncedList,
  NotEnoughHistory,
  type Profile,
  run,
  type Verdict,
} from "@konomi/engine";
import { displayTitle, type Session } from "@konomi/ui/session";
import { titleById } from "./actions.ts";

export const VERDICT_POOL = 1000;

export type TitleVerdict =
  | {
      state: "ready";
      verdict: Verdict;
      title: string;
      coverUrl: string | null;
      canPlan: boolean;
    }
  | { state: "setup"; reason: string };

interface Ranking {
  profile: Profile | null;
  scores: { id: number; score: number }[];
}

const rankings = new WeakMap<Session, Map<MediaType, Promise<Ranking | null>>>();

function ranking(session: Session, type: MediaType): Promise<Ranking | null> {
  let byType = rankings.get(session);
  if (!byType) {
    byType = new Map();
    rankings.set(session, byType);
  }
  let known = byType.get(type);
  if (!known) {
    known = (async () => {
      const s = await session.settings();
      try {
        const result = await run(
          session.store,
          null,
          session.user,
          type,
          makeRunOptions({ limit: VERDICT_POOL, discover: false, includeAdult: s.includeAdult }),
        );
        return {
          profile: result.profile,
          scores: result.recommendations.map((r) => ({ id: r.media.id, score: r.score })),
        };
      } catch (e) {
        if (e instanceof NoSyncedList) return null;
        if (e instanceof NotEnoughHistory) return { profile: null, scores: [] };
        throw e;
      }
    })();
    byType.set(type, known);
    known.catch(() => byType.delete(type));
  }
  return known;
}

export async function verdictFor(session: Session, id: number): Promise<TitleVerdict> {
  const media = await titleById(session, id);
  const ranked = await ranking(session, media.type);
  if (!ranked)
    return {
      state: "setup",
      reason: `Open Konomi.moe to sync your ${media.type === "MANGA" ? "manga" : "anime"} list`,
    };
  const entry = (await session.store.getList(session.user, media.type)).find(
    (e) => e.mediaId === id,
  );
  const pool = ranked.scores.filter((s) => s.id !== id).map((s) => s.score);
  const verdict = judge(ranked.profile, media, pool, entry ?? null);
  const { titleLanguage } = await session.settings();
  return {
    state: "ready",
    verdict,
    title: displayTitle(media, titleLanguage),
    coverUrl: media.coverUrl,
    canPlan: Boolean(session.host.addToPlanning) && !entry,
  };
}
