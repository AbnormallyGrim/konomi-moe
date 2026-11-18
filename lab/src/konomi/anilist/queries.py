"""GraphQL queries sent to AniList."""

MEDIA_FIELDS = """
fragment MediaFields on Media {
  id
  type
  format
  status
  isAdult
  siteUrl
  title { romaji english native }
  countryOfOrigin
  coverImage { large }
  episodes
  chapters
  startDate { year }
  averageScore
  meanScore
  popularity
  favourites
  stats { scoreDistribution { score amount } }
  genres
  tags { name rank isMediaSpoiler }
  studios(isMain: true) { nodes { name } }
  relations { edges { relationType node { id type } } }
}
"""

USER_LIST = (
    """
query ($userName: String, $type: MediaType, $chunk: Int, $perChunk: Int) {
  MediaListCollection(userName: $userName, type: $type, chunk: $chunk, perChunk: $perChunk) {
    hasNextChunk
    lists {
      name
      isCustomList
      entries {
        status
        score(format: POINT_100)
        progress
        repeat
        updatedAt
        media {
          ...MediaFields
          recommendations(perPage: 10, sort: RATING_DESC) {
            nodes { rating mediaRecommendation { id } }
          }
        }
      }
    }
  }
}
"""
    + MEDIA_FIELDS
)

MEDIA_BY_IDS = (
    """
query ($ids: [Int], $page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { hasNextPage }
    media(id_in: $ids) { ...MediaFields }
  }
}
"""
    + MEDIA_FIELDS
)

# Like MEDIA_BY_IDS, plus top recommendations: for hosts that supply the list entries themselves.
MEDIA_WITH_RECS_BY_IDS = (
    """
query ($ids: [Int], $page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { hasNextPage }
    media(id_in: $ids) {
      ...MediaFields
      recommendations(perPage: 10, sort: RATING_DESC) {
        nodes { rating mediaRecommendation { id } }
      }
    }
  }
}
"""
    + MEDIA_FIELDS
)

DISCOVER = (
    """
query (
  $type: MediaType
  $page: Int
  $perPage: Int
  $genreIn: [String]
  $tagIn: [String]
  $minimumTagRank: Int
  $tagNotIn: [String]
  $genreNotIn: [String]
  $idNotIn: [Int]
  $formatIn: [MediaFormat]
  $startGreater: FuzzyDateInt
  $startLesser: FuzzyDateInt
  $statusIn: [MediaStatus]
  $countryOfOrigin: CountryCode
) {
  Page(page: $page, perPage: $perPage) {
    media(
      type: $type
      genre_in: $genreIn
      tag_in: $tagIn
      minimumTagRank: $minimumTagRank
      tag_not_in: $tagNotIn
      genre_not_in: $genreNotIn
      id_not_in: $idNotIn
      format_in: $formatIn
      startDate_greater: $startGreater
      startDate_lesser: $startLesser
      status_in: $statusIn
      countryOfOrigin: $countryOfOrigin
      isAdult: false
      sort: SCORE_DESC
    ) { ...MediaFields }
  }
}
"""
    + MEDIA_FIELDS
)

VIEWER = "query { Viewer { id name } }"

MEDIA_DESCRIPTION = "query ($id: Int) { Media(id: $id) { description(asHtml: false) } }"

# What a title's details dialog shows: synopsis, main cast first with their Japanese voice
# actors, and staff (the app keeps the key roles). One request when a card is opened.
MEDIA_DETAILS = """
query ($id: Int) {
  Media(id: $id) {
    description(asHtml: false)
    characters(sort: [ROLE, RELEVANCE, ID], perPage: 12) {
      edges {
        role
        node { id name { full } image { medium } }
        voiceActors(language: JAPANESE, sort: [RELEVANCE, ID]) { id name { full } image { medium } }
      }
    }
    staff(sort: [RELEVANCE, ID], perPage: 25) {
      edges { role node { id name { full } image { medium } } }
    }
  }
}
"""

SAVE_ENTRY = """
mutation ($mediaId: Int, $status: MediaListStatus) {
  SaveMediaListEntry(mediaId: $mediaId, status: $status) { id status }
}
"""
