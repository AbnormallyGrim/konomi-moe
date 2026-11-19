import { fetchMedia, type Media } from "@konomi/engine";
import type { Session } from "@konomi/ui/session";
import type { Action } from "./channel.ts";

export async function titleById(session: Session, id: number): Promise<Media> {
  if (session.client) await fetchMedia(session.client, session.store, [id]);
  const media = (await session.media([id])).get(id);
  if (!media) throw new Error("AniList has no title with that ID");
  return media;
}

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
