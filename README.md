# Konomi.moe

Anime and manga recommendations that learn your taste from your own AniList list.

Konomi.moe looks at what you've scored, finished, rewatched and dropped, works out what you tend to enjoy, and suggests titles you haven't seen yet. Each pick comes with a short reason, like the genres, tags or studio that make it a good fit for you.

## What you can do

- **Get personal picks** for anime or manga, ranked for you rather than by overall popularity.
- **Filter** by genre, tag, format, year or finished series, and ask for titles where a genre is the main focus (a romance first, not an action show with a romance subplot).
- **Exclude** a title (along with its sequels), or any tag, genre or studio you don't want to see.
- **Rank your backlog**: include titles already on your planning list to see which to start next.
- **Skip other versions** of stories you already know, such as the manga of an anime you've watched.
- **Add picks to your planning list** on AniList in one click.
- **Hide community scores** if you'd rather judge picks without the crowd's opinion.

## Where it runs

- **Seanime plugin:** adds a **For you** page to [Seanime](https://seanime.app)'s side menu. It uses the AniList account you're already signed in to, so there's nothing to set up.
- **Browser extension** *(in testing)*: for Chrome, Edge, Brave, Opera, Vivaldi and Firefox. The full app opens in its own tab. A toolbar popup shows your top picks, and an optional badge on AniList title pages says how well a title fits you. Trailers play right in the app.

## Install in Seanime

Needs Seanime 3.10.4 or later.

1. In Seanime, open **Extensions → Add extensions → Install from URL**.
2. Paste this link:
   ```
   https://raw.githubusercontent.com/AbnormallyGrim/konomi-moe/refs/heads/main/seanime/release/konomi-moe.json
   ```
3. Allow the permissions it asks for (storage, and your AniList list).

Open **For you** in the side menu. Seanime keeps the plugin up to date on its own.

## Try the browser extension

It isn't in the stores yet. To try it, build it (Node 22+):

```
npm install
npm run build -w extension
```

- **Chrome, Edge, Brave, Opera, Vivaldi:** open `chrome://extensions`, turn on Developer mode, choose **Load unpacked** and pick `extension/dist/chrome`.
- **Firefox:** open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on** and pick `extension/dist/firefox/manifest.json`.

The app opens in a tab. Choose **Sign in with AniList** and approve Konomi.moe on AniList, the way MAL-Sync connects. Your browser first asks to let the extension read anilist.co, so it can catch AniList's answer. If you say no, paste the code AniList shows instead.

Sign-in needs an AniList API client, registered once at [anilist.co/settings/developer](https://anilist.co/settings/developer) with the redirect URL `https://anilist.co/api/v2/oauth/pin`. Put its ID in `ANILIST_CLIENT_ID` in `extension/scripts/build.ts`, or build with `ANILIST_CLIENT_ID=<id>`. One client serves every browser.

## Privacy

Everything runs on your own computer. Your list and your taste profile stay with you. The only site contacted is AniList, to read your list and look up titles. In the browser extension, a trailer you choose to play loads from YouTube's privacy-enhanced player (youtube-nocookie.com).

## License

MIT
