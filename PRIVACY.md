# Privacy policy

*Last updated: 19 November 2026*

This policy covers the Konomi.moe browser extension (Chrome, Edge, Brave, Opera, Vivaldi and Firefox) and the Konomi.moe Seanime plugin.

## The short version

Konomi.moe runs entirely on your device. It has no server of its own, collects no analytics, and never sends your data to the developer or anyone else. It talks to AniList to read your list and look up titles, and to YouTube only when you play a trailer.

## What it reads from AniList

When you sign in with AniList, you approve Konomi.moe on AniList's own page. AniList then gives the extension an access token, which lets it:

- read your AniList name and profile picture;
- read your anime and manga lists, including private and custom lists: status, score, progress, rewatches and when you last updated each entry;
- add a title to your planning list, **only** when you click "Add to planning".

It never changes or deletes anything else on your AniList account.

## What is stored, and where

Everything is kept in your browser's own storage for the extension, on your device:

- your AniList token, name, user ID and profile picture address;
- a copy of your lists and the AniList title details needed to rank them (titles, genres, tags, studios, scores);
- your picks, settings, filters, exclusions and "not interested" choices;
- the extension's switches (AniList badge, new-picks count, daily sync) and which picks you've already seen.

None of it leaves your device, except for the AniList requests described here. The Seanime plugin keeps the same kind of data in Seanime's plugin storage on your computer, and uses the AniList account you're signed in to in Seanime.

## Which sites it contacts

| Site | Why | When |
|---|---|---|
| graphql.anilist.co | Reads your lists and title details; adds titles to your planning list | Syncing, ranking, opening a title, adding to planning |
| anilist.co | Sign-in approval page; the optional badge on title pages | When you sign in; on AniList title pages if the badge is on |
| s4.anilist.co | Covers, character pictures and your profile picture | When they're shown |
| i.ytimg.com | Trailer thumbnails | When a title with a trailer is opened |
| www.youtube-nocookie.com | YouTube's privacy-enhanced trailer player | Only when you press play on a trailer |

Opening a title on AniList, YouTube or Dailymotion opens that site in a new tab, under that site's own privacy policy. So do AniList and YouTube when they're contacted as above.

When a trailer plays, the extension tells YouTube that the player is embedded by this project (`https://github.com/AbnormallyGrim/konomi-moe`), because YouTube refuses players that don't say where they're embedded. No other information is added.

## Permissions

- **Access to anilist.co** is asked for when you sign in (so the extension can catch AniList's answer in the tab it opened) and is used by the optional badge on AniList title pages. The badge reads only the title's ID from the page address, plus the page's background colour so it can match AniList's light or dark theme. It reads nothing else on the page. You can refuse this access and still sign in by pasting the code AniList shows.
- **Access to youtube-nocookie.com** is used only to add the embedding note above to trailer players the extension opens.
- **Current tab (activeTab)** lets the toolbar popup see which AniList title you're on, only at the moment you open the popup.

## Your choices

- **Sign out:** Settings → Account → Sign out removes the token.
- **Delete everything:** Settings → Data → Clear removes all stored data. Uninstalling the extension removes it too.
- **Revoke access on AniList:** AniList's settings, under Apps, let you withdraw Konomi.moe's access at any time.
- **Badge and background sync:** both can be switched off in the toolbar popup's settings, and you can remove the anilist.co access in your browser's extension settings.

## Children

Konomi.moe isn't directed at children and collects no data from anyone, so it holds no children's data.

## Changes

If this policy changes, the new version will be published here with a new date. The project's history on GitHub shows every earlier version.

## Contact

Questions or concerns: open an issue at https://github.com/AbnormallyGrim/konomi-moe/issues
