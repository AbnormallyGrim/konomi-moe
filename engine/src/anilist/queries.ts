// Generated from lab/src/konomi/anilist/queries.py; keep the two identical.

/** A user's list for one media type, in chunks, with each title's details and top recommendations. */
export const USER_LIST =
  "\nquery ($userName: String, $type: MediaType, $chunk: Int, $perChunk: Int) {\n  MediaListCollection(userName: $userName, type: $type, chunk: $chunk, perChunk: $perChunk) {\n    hasNextChunk\n    lists {\n      name\n      isCustomList\n      entries {\n        status\n        score(format: POINT_100)\n        progress\n        repeat\n        updatedAt\n        media {\n          ...MediaFields\n          recommendations(perPage: 10, sort: RATING_DESC) {\n            nodes { rating mediaRecommendation { id } }\n          }\n        }\n      }\n    }\n  }\n}\n\nfragment MediaFields on Media {\n  id\n  type\n  format\n  status\n  isAdult\n  siteUrl\n  title { romaji english native }\n  countryOfOrigin\n  coverImage { large }\n  episodes\n  chapters\n  startDate { year }\n  averageScore\n  meanScore\n  popularity\n  favourites\n  stats { scoreDistribution { score amount } }\n  genres\n  tags { name rank isMediaSpoiler }\n  studios(isMain: true) { nodes { name } }\n  relations { edges { relationType node { id type } } }\n}\n";

/** Details of titles by ID, a page at a time. */
export const MEDIA_BY_IDS =
  "\nquery ($ids: [Int], $page: Int, $perPage: Int) {\n  Page(page: $page, perPage: $perPage) {\n    pageInfo { hasNextPage }\n    media(id_in: $ids) { ...MediaFields }\n  }\n}\n\nfragment MediaFields on Media {\n  id\n  type\n  format\n  status\n  isAdult\n  siteUrl\n  title { romaji english native }\n  countryOfOrigin\n  coverImage { large }\n  episodes\n  chapters\n  startDate { year }\n  averageScore\n  meanScore\n  popularity\n  favourites\n  stats { scoreDistribution { score amount } }\n  genres\n  tags { name rank isMediaSpoiler }\n  studios(isMain: true) { nodes { name } }\n  relations { edges { relationType node { id type } } }\n}\n";

/** Like MEDIA_BY_IDS, plus top recommendations: for hosts that supply the list entries themselves. */
export const MEDIA_WITH_RECS_BY_IDS =
  "\nquery ($ids: [Int], $page: Int, $perPage: Int) {\n  Page(page: $page, perPage: $perPage) {\n    pageInfo { hasNextPage }\n    media(id_in: $ids) {\n      ...MediaFields\n      recommendations(perPage: 10, sort: RATING_DESC) {\n        nodes { rating mediaRecommendation { id } }\n      }\n    }\n  }\n}\n\nfragment MediaFields on Media {\n  id\n  type\n  format\n  status\n  isAdult\n  siteUrl\n  title { romaji english native }\n  countryOfOrigin\n  coverImage { large }\n  episodes\n  chapters\n  startDate { year }\n  averageScore\n  meanScore\n  popularity\n  favourites\n  stats { scoreDistribution { score amount } }\n  genres\n  tags { name rank isMediaSpoiler }\n  studios(isMain: true) { nodes { name } }\n  relations { edges { relationType node { id type } } }\n}\n";

/** Top-scored titles matching search filters; list filters such as `tagIn` need all their values. */
export const DISCOVER =
  "\nquery (\n  $type: MediaType\n  $page: Int\n  $perPage: Int\n  $genreIn: [String]\n  $tagIn: [String]\n  $minimumTagRank: Int\n  $tagNotIn: [String]\n  $genreNotIn: [String]\n  $idNotIn: [Int]\n  $formatIn: [MediaFormat]\n  $startGreater: FuzzyDateInt\n  $startLesser: FuzzyDateInt\n  $statusIn: [MediaStatus]\n  $countryOfOrigin: CountryCode\n) {\n  Page(page: $page, perPage: $perPage) {\n    media(\n      type: $type\n      genre_in: $genreIn\n      tag_in: $tagIn\n      minimumTagRank: $minimumTagRank\n      tag_not_in: $tagNotIn\n      genre_not_in: $genreNotIn\n      id_not_in: $idNotIn\n      format_in: $formatIn\n      startDate_greater: $startGreater\n      startDate_lesser: $startLesser\n      status_in: $statusIn\n      countryOfOrigin: $countryOfOrigin\n      isAdult: false\n      sort: SCORE_DESC\n    ) { ...MediaFields }\n  }\n}\n\nfragment MediaFields on Media {\n  id\n  type\n  format\n  status\n  isAdult\n  siteUrl\n  title { romaji english native }\n  countryOfOrigin\n  coverImage { large }\n  episodes\n  chapters\n  startDate { year }\n  averageScore\n  meanScore\n  popularity\n  favourites\n  stats { scoreDistribution { score amount } }\n  genres\n  tags { name rank isMediaSpoiler }\n  studios(isMain: true) { nodes { name } }\n  relations { edges { relationType node { id type } } }\n}\n";

/** Name of the user a token belongs to. */
export const VIEWER = "query { Viewer { id name } }";

/** A title's synopsis. */
export const MEDIA_DESCRIPTION =
  "query ($id: Int) { Media(id: $id) { description(asHtml: false) } }";

/** What a title's details dialog shows: synopsis, main cast with Japanese voice actors, staff. */
export const MEDIA_DETAILS =
  "\nquery ($id: Int) {\n  Media(id: $id) {\n    description(asHtml: false)\n    characters(sort: [ROLE, RELEVANCE, ID], perPage: 12) {\n      edges {\n        role\n        node { id name { full } image { medium } }\n        voiceActors(language: JAPANESE, sort: [RELEVANCE, ID]) { id name { full } image { medium } }\n      }\n    }\n    staff(sort: [RELEVANCE, ID], perPage: 25) {\n      edges { role node { id name { full } image { medium } } }\n    }\n  }\n}\n";

/** Add or update an entry on the signed-in user's list. */
export const SAVE_ENTRY =
  "\nmutation ($mediaId: Int, $status: MediaListStatus) {\n  SaveMediaListEntry(mediaId: $mediaId, status: $status) { id status }\n}\n";

/** Every AniList tag with its category, used to judge main themes. */
export const TAG_COLLECTION = "{ MediaTagCollection { name category } }";
