/** The popup's and the AniList badge's changes, run against a session (the app tab's or the background's). */

import { fetchMedia, type Media } from "@konomi/engine";
import type { Session } from "@konomi/ui/session";
import type { Action } from "./channel.ts";

/** A title by ID: from the store, or fetched from AniList into it. */
export async function titleById(session: Session, id: number): Promise<Media> {
  if (session.client) await fetchMedia(session.client, session.store, [id]);
  const media = (await session.media([id])).get(id);
  if (!media) throw new Error("AniList has no title with that ID");
  return media;
}

/** Carries out an action and saves; resolves with a confirmation to show. */
export async function runAction(session: Session, action: Action): Promise<string> {
  const media = await titleById(session, action.id);
  let done: string;
  if (action.kind === "addToPlanning") {
    await session.addToPlanning(media);
    await session.dropPicks((m) => m.id === media.id);
    done = "Added to your planning list";
  } else {
    await session.notInterested(media);
    done = "Hidden. You'll see fewer like it";
  }
  await session.save(true);
  return done;
}
