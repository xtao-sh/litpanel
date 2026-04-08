import { gql } from "@apollo/client";

export const PAPER_LIST_FIELDS = gql`
  fragment PaperListFields on Paper {
    paperId
    title
    authors
    year
    fields
    averageScore
    hasCard
    triageDecision
  }
`;

export const NETWORK_GRAPH_FIELDS = gql`
  fragment NetworkGraphFields on NetworkGraph {
    nodes {
      id
      label
      type
      size
      year
      fields
      theme
      paperCount
      isSeed
    }
    edges {
      source
      target
      relation
      weight
    }
    mode
    sourcePaperCount
    seedCount
    totalPaperNodes
    truncated
  }
`;

export const GET_PAPERS = gql`
  query GetPapers($filter: PaperFilter, $sort: PaperSort, $limit: Int, $offset: Int) {
    papers(filter: $filter, sort: $sort, limit: $limit, offset: $offset) {
      items {
        paperId
        title
        authors
        year
        fields
        triageDecision
        averageScore
        hasCard
        abstract
        nberUrl
        tldr
      }
      total
    }
  }
`;

export const GET_PAPER = gql`
  query GetPaper($id: String!) {
    paper(id: $id) {
      paperId
      title
      authors
      year
      fields
      jel
      triageDecision
      averageScore
      hasCard
      abstract
      nberUrl
      tldr
      ideaCount
      isBookmarked
      readingStatus
      userNote
      scores {
        dimension
        score
      }
      sections {
        section
        content
      }
      atoms {
        slug
        type
        title
        paperCount
      }
      debates {
        title
        context
        paperStance
        otherPapers
      }
      relatedPapers(limit: 10) {
        paperId
        title
        year
        averageScore
        fields
        sharedAtomCount
        sharedAtoms
      }
      similarPapers(limit: 10) {
        paperId
        title
        year
        averageScore
        fields
        similarityScore
      }
      backlinkNotes {
        entityType
        entityId
        notePreview
      }
    }
  }
`;

export const GET_ATOMS = gql`
  query GetAtoms($filter: AtomFilter, $limit: Int, $offset: Int) {
    atoms(filter: $filter, limit: $limit, offset: $offset) {
      items {
        slug
        type
        title
        description
        evidenceStrength
        paperCount
        theme
      }
      total
    }
  }
`;

export const GET_ATOM = gql`
  query GetAtom($slug: String!) {
    atom(slug: $slug) {
      slug
      type
      title
      description
      evidenceStrength
      whenToUse
      access
      url
      paperCount
      papers {
        paperId
        title
        year
        averageScore
        fields
      }
      similarAtoms(limit: 10) {
        slug
        type
        title
        description
        similarityScore
      }
      cooccurringAtoms(limit: 10) {
        slug
        type
        title
        description
        coCount
      }
      backlinkNotes {
        entityType
        entityId
        notePreview
      }
    }
  }
`;

export const SEARCH = gql`
  query Search($query: String!, $entityType: String, $limit: Int) {
    search(query: $query, entityType: $entityType, limit: $limit) {
      hits {
        entityType
        entityId
        title
        snippet
        rank
      }
      total
    }
  }
`;

export const GET_STATS = gql`
  query GetStats {
    stats {
      totalPapers
      totalCards
      totalAtoms
      totalMechanisms
      totalMethods
      totalDatasets
      totalPuzzles
      totalIdeas
    }
  }
`;

export const GET_WHATS_NEW = gql`
  ${PAPER_LIST_FIELDS}
  query GetWhatsNew($limit: Int) {
    whatsNew(limit: $limit) {
      latestPapers {
        ...PaperListFields
      }
      latestPapersCount
      recentIdeasCount
      totalPapers
    }
  }
`;

export const GET_FIELD_OVERVIEW = gql`
  query GetFieldOverview {
    fieldOverview {
      field
      paperCount
      atomCount
      avgScore
    }
  }
`;

export const GET_YEAR_DISTRIBUTION = gql`
  query GetYearDistribution {
    yearDistribution {
      year
      count
    }
  }
`;

export const GET_PAPER_NETWORK = gql`
  ${NETWORK_GRAPH_FIELDS}
  query GetPaperNetwork($paperId: String!, $depth: Int) {
    paperNetwork(paperId: $paperId, depth: $depth) {
      ...NetworkGraphFields
    }
  }
`;

export const GET_IDEAS = gql`
  query GetIdeas($status: String) {
    ideas(status: $status) {
      id
      title
      status
      generatedDate
      heuristic
      sourcePapers
      content
      novelty
      feasibility
      impact
      composite
      evaluation {
        ideaId
        verdict
        noveltyScore
        identificationScore
        dataScore
        contributionScore
        feasibilityScore
        overallScore
        keyRisk
        nextSteps
        deathReason
        evaluationText
      }
    }
  }
`;

export const GET_PAPER_DETAIL = gql`
  query GetPaperDetail($id: String!) {
    paper(id: $id) {
      paperId
      title
      authors
      year
      fields
      jel
      triageDecision
      averageScore
      hasCard
      abstract
      nberUrl
      scores {
        dimension
        score
      }
      sections {
        section
        content
      }
    }
  }
`;

export const GET_ATOM_DETAIL = gql`
  query GetAtomDetail($slug: String!) {
    atom(slug: $slug) {
      slug
      type
      title
      description
      evidenceStrength
      whenToUse
      access
      url
      paperCount
      papers {
        paperId
        title
        year
        averageScore
        fields
      }
    }
  }
`;

export const GET_ATOM_NEIGHBORHOOD = gql`
  ${NETWORK_GRAPH_FIELDS}
  query GetAtomNeighborhood($slug: String!, $depth: Int) {
    atomNeighborhood(slug: $slug, depth: $depth) {
      ...NetworkGraphFields
    }
  }
`;

export const GET_PAPER_SET_NETWORK = gql`
  ${NETWORK_GRAPH_FIELDS}
  query GetPaperSetNetwork($paperIds: [String!]!, $depth: Int) {
    paperSetNetwork(paperIds: $paperIds, depth: $depth) {
      ...NetworkGraphFields
    }
  }
`;

export const GET_GAP_ANALYSIS = gql`
  query GetGapAnalysis($limit: Int) {
    gapAnalysis(limit: $limit) {
      bridgeAtoms {
        slug
        title
        type
        connectedFields
        fieldCount
        paperCount
      }
      weakConnections {
        fieldA
        fieldB
        sharedAtomCount
      }
      totalOrphanAtoms
    }
  }
`;

export const GET_FIELD_MAPS = gql`
  query GetFieldMaps {
    fieldMaps {
      slug
      title
    }
  }
`;

export const GET_FIELD_MAP = gql`
  query GetFieldMap($slug: String!) {
    fieldMap(slug: $slug) {
      slug
      title
      content
    }
  }
`;

export const GET_TRENDING_TOPICS = gql`
  query GetTrendingTopics($window: Int, $limit: Int) {
    trendingTopics(window: $window, limit: $limit) {
      name
      category
      recentCount
      historicalAvg
      growthRate
      trend
    }
  }
`;

export const GET_METHOD_FIELD_MATRIX = gql`
  query GetMethodFieldMatrix($topMethods: Int, $topFields: Int) {
    methodFieldMatrix(topMethods: $topMethods, topFields: $topFields) {
      methods
      fields
      matrix
    }
  }
`;

// ---------------------------------------------------------------------------
// Digests
// ---------------------------------------------------------------------------

export const GET_DIGESTS = gql`
  query GetDigests($limit: Int) {
    digests(limit: $limit) {
      date
      content
    }
  }
`;

export const GET_DIGEST = gql`
  query GetDigest($date: String!) {
    digest(date: $date) {
      date
      content
    }
  }
`;

// ---------------------------------------------------------------------------
// User personalization mutations
// ---------------------------------------------------------------------------

export const TOGGLE_BOOKMARK = gql`
  mutation ToggleBookmark($paperId: String!) {
    toggleBookmark(paperId: $paperId)
  }
`;

export const SET_READING_STATUS = gql`
  mutation SetReadingStatus($paperId: String!, $status: String!) {
    setReadingStatus(paperId: $paperId, status: $status)
  }
`;

export const SAVE_NOTE = gql`
  mutation SaveNote($entityType: String!, $entityId: String!, $note: String!) {
    saveNote(entityType: $entityType, entityId: $entityId, note: $note)
  }
`;

export const DELETE_NOTE = gql`
  mutation DeleteNote($entityType: String!, $entityId: String!) {
    deleteNote(entityType: $entityType, entityId: $entityId)
  }
`;

// ---------------------------------------------------------------------------
// User personalization queries
// ---------------------------------------------------------------------------

export const GET_BOOKMARKS = gql`
  query GetBookmarks($limit: Int, $offset: Int) {
    bookmarks(limit: $limit, offset: $offset) {
      items {
        paperId
        title
        year
        fields
        averageScore
        hasCard
        isBookmarked
        readingStatus
      }
      total
    }
  }
`;

export const GET_READING_LIST = gql`
  query GetReadingList($status: String, $limit: Int, $offset: Int) {
    readingList(status: $status, limit: $limit, offset: $offset) {
      items {
        paperId
        title
        year
        fields
        averageScore
        hasCard
        readingStatus
      }
      total
    }
  }
`;

export const GET_ALL_NOTES = gql`
  query GetAllNotes($limit: Int, $offset: Int) {
    allNotes(limit: $limit, offset: $offset) {
      items {
        entityType
        entityId
        note
        updatedAt
      }
      total
    }
  }
`;

// ---------------------------------------------------------------------------
// Research Mode
// ---------------------------------------------------------------------------

export const RESEARCH_PAPERS = gql`
  query ResearchPapers($query: String!, $filters: ResearchFilter, $sort: PaperSort, $limit: Int, $offset: Int) {
    researchPapers(query: $query, filters: $filters, sort: $sort, limit: $limit, offset: $offset) {
      papers {
        total
        items {
          paperId
          title
          authors
          year
          fields
          averageScore
          hasCard
          tldr
        }
      }
      allPaperIds
    }
  }
`;

export const RESEARCH_LANDSCAPE = gql`
  query ResearchLandscape($paperIds: [String!]!) {
    researchLandscape(paperIds: $paperIds) {
      methods { slug title type description evidenceStrength paperCount paperIds theme }
      datasets { slug title type description evidenceStrength access paperCount paperIds theme }
      mechanisms { slug title type description paperCount paperIds theme }
      puzzles { slug title type description paperCount paperIds theme }
      chinaApplicability {
        highCount
        moderateCount
        lowCount
        highlights { paperId paperTitle applicabilityLevel summary }
      }
      fieldDistribution { field count }
      yearDistribution { year count }
      gaps {
        limitations { text paperId paperTitle }
        unusedMethods { slug title description paperCount paperIds }
        unusedDatasets { slug title description access paperCount paperIds }
        openQuestions { text paperId paperTitle }
      }
    }
  }
`;

export const TOPIC_SATURATION = gql`
  query GetTopicSaturation($query: String!, $paperIds: [String!]) {
    topicSaturation(query: $query, paperIds: $paperIds) {
      topic
      totalPapers
      growthPhase
      annualGrowthRate
      methodDiversity
      recommendation
      yearTrend {
        year
        count
      }
      keyIndicators {
        indicator
        value
        interpretation
      }
    }
  }
`;

export const RESEARCH_SUGGESTED_QUESTIONS = gql`
  query ResearchSuggestedQuestions($query: String!, $paperIds: [String!]!) {
    researchSuggestedQuestions(query: $query, paperIds: $paperIds)
  }
`;

export const ADVISE_METHODS = gql`
  query AdviseMethods($description: String!, $limit: Int) {
    adviseMethods(description: $description, limit: $limit) {
      slug
      title
      description
      whenToUse
      evidenceStrength
      paperCount
      relevanceScore
    }
  }
`;

export const CLUSTER_PAPERS = gql`
  ${PAPER_LIST_FIELDS}
  query ClusterPapers($paperIds: [String!]!, $nClusters: Int) {
    clusterPapers(paperIds: $paperIds, nClusters: $nClusters) {
      clusterId
      label
      paperCount
      papers {
        ...PaperListFields
      }
      topAtoms {
        slug
        title
        type
        paperCount
      }
    }
  }
`;

// ---------------------------------------------------------------------------
// Author & Method lookups
// ---------------------------------------------------------------------------

export const GET_AUTHOR_SUGGESTIONS = gql`
  query GetAuthorSuggestions($query: String!, $limit: Int) {
    authorSuggestions(query: $query, limit: $limit)
  }
`;

export const GET_AVAILABLE_METHODS = gql`
  query GetAvailableMethods {
    availableMethods
  }
`;

// ---------------------------------------------------------------------------
// Author profiles
// ---------------------------------------------------------------------------

export const GET_AUTHOR = gql`
  query GetAuthor($name: String!) {
    author(name: $name) {
      name
      paperCount
      avgScore
      papers {
        paperId
        title
        year
        averageScore
        fields
        hasCard
      }
      coauthors {
        name
        sharedPapers
      }
      fields {
        field
        count
      }
      methods {
        field
        count
      }
    }
  }
`;

export const GET_TOP_AUTHORS = gql`
  query GetTopAuthors($limit: Int) {
    topAuthors(limit: $limit) {
      name
      paperCount
    }
  }
`;

// ---------------------------------------------------------------------------
// Personalized feed
// ---------------------------------------------------------------------------

export const GET_PERSONALIZED_FEED = gql`
  query GetPersonalizedFeed($limit: Int) {
    personalizedFeed(limit: $limit) {
      paperId
      title
      year
      averageScore
      fields
      relevanceScore
      hasCard
    }
  }
`;

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

export const GET_COLLECTIONS = gql`
  query GetCollections {
    collections {
      id
      name
      description
      paperCount
      createdAt
    }
  }
`;

export const GET_PROJECTS = gql`
  query GetProjects {
    projects {
      slug
      title
      description
      status
      scopeType
      selectionRule
      paperCount
      paperIds
      updatedAt
      originType
      originQuery
      originFiltersSummary
      sourcePaperCount
    }
  }
`;

export const GET_PROJECT = gql`
  query GetProject($slug: String!) {
    project(slug: $slug) {
      slug
      title
      description
      status
      scopeType
      selectionRule
      paperCount
      paperIds
      updatedAt
      overviewContent
      originType
      originQuery
      originFiltersSummary
      sourcePaperCount
      landscape {
        methods { slug title type description evidenceStrength paperCount paperIds theme }
        datasets { slug title type description evidenceStrength access paperCount paperIds theme }
        mechanisms { slug title type description paperCount paperIds theme }
        puzzles { slug title type description paperCount paperIds theme }
        chinaApplicability {
          highCount
          moderateCount
          lowCount
          highlights { paperId paperTitle applicabilityLevel summary }
        }
        fieldDistribution { field count }
        yearDistribution { year count }
        gaps {
          limitations { text paperId paperTitle }
          unusedMethods { slug title description paperCount paperIds }
          unusedDatasets { slug title description access paperCount paperIds }
          openQuestions { text paperId paperTitle }
        }
      }
      papers {
        paperId
        title
        authors
        year
        fields
        averageScore
        hasCard
        tldr
      }
    }
  }
`;

export const GET_COLLECTION_PAPERS = gql`
  query GetCollectionPapers($collectionId: Int!, $limit: Int, $offset: Int) {
    collectionPapers(collectionId: $collectionId, limit: $limit, offset: $offset) {
      items {
        paperId
        title
        year
        fields
        averageScore
        hasCard
        readingStatus
      }
      total
    }
  }
`;

export const GET_PAPER_COLLECTIONS = gql`
  query GetPaperCollections($paperId: String!) {
    paperCollections(paperId: $paperId) {
      id
      name
      description
      paperCount
      createdAt
    }
  }
`;

export const CREATE_COLLECTION = gql`
  mutation CreateCollection($name: String!, $description: String) {
    createCollection(name: $name, description: $description) {
      id
      name
      description
      paperCount
      createdAt
    }
  }
`;

export const DELETE_COLLECTION = gql`
  mutation DeleteCollection($id: Int!) {
    deleteCollection(id: $id)
  }
`;

export const RENAME_COLLECTION = gql`
  mutation RenameCollection($id: Int!, $name: String!) {
    renameCollection(id: $id, name: $name)
  }
`;

export const ADD_TO_COLLECTION = gql`
  mutation AddToCollection($collectionId: Int!, $paperId: String!) {
    addToCollection(collectionId: $collectionId, paperId: $paperId)
  }
`;

export const REMOVE_FROM_COLLECTION = gql`
  mutation RemoveFromCollection($collectionId: Int!, $paperId: String!) {
    removeFromCollection(collectionId: $collectionId, paperId: $paperId)
  }
`;

// ---------------------------------------------------------------------------
// Related Papers by Axis (More Like This)
// ---------------------------------------------------------------------------

export const GET_RELATED_BY_AXIS = gql`
  query GetRelatedByAxis($id: String!, $axis: String!, $limit: Int) {
    paper(id: $id) {
      relatedByAxis(axis: $axis, limit: $limit) {
        paperId
        title
        year
        averageScore
        fields
        sharedAtomCount
        sharedAtoms
        similarityScore
      }
    }
  }
`;

// ---------------------------------------------------------------------------
// China Dashboard
// ---------------------------------------------------------------------------

export const GET_CHINA_DASHBOARD = gql`
  query GetChinaDashboard {
    chinaDashboard {
      totalHigh
      totalModerate
      totalLow
      highPapers {
        paperId
        title
        year
        fields
        averageScore
        applicabilityLevel
        applicabilitySummary
      }
      moderatePapers {
        paperId
        title
        year
        fields
        averageScore
        applicabilityLevel
        applicabilitySummary
      }
      lowPapers {
        paperId
        title
        year
        fields
        averageScore
        applicabilityLevel
        applicabilitySummary
      }
      fieldDistribution {
        field
        highCount
        moderateCount
      }
      dataMentions {
        field
        count
        paperIds
        paperTitles {
          paperId
          title
        }
      }
    }
  }
`;

// ---------------------------------------------------------------------------
// User Ideas
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// System Idea mutations
// ---------------------------------------------------------------------------

export const SET_IDEA_STATUS = gql`
  mutation SetIdeaStatus($ideaId: String!, $status: String!) {
    setIdeaStatus(ideaId: $ideaId, status: $status)
  }
`;

export const GET_USER_IDEAS = gql`
  query GetUserIdeas($status: String) {
    userIdeas(status: $status) {
      id
      title
      description
      status
      researchQuestion
      proposedMethod
      dataNeeded
      notes
      relatedPaperIds
      relatedIdeaIds
      createdAt
      updatedAt
    }
  }
`;

export const GET_USER_IDEA = gql`
  query GetUserIdea($id: Int!) {
    userIdea(id: $id) {
      id
      title
      description
      status
      researchQuestion
      proposedMethod
      dataNeeded
      notes
      relatedPaperIds
      relatedIdeaIds
      createdAt
      updatedAt
    }
  }
`;

export const CREATE_USER_IDEA = gql`
  mutation CreateUserIdea($title: String!, $description: String) {
    createUserIdea(title: $title, description: $description) {
      id
      title
      description
      status
      createdAt
      updatedAt
      researchQuestion
      proposedMethod
      dataNeeded
      notes
      relatedPaperIds
      relatedIdeaIds
    }
  }
`;

export const UPDATE_USER_IDEA = gql`
  mutation UpdateUserIdea(
    $id: Int!
    $title: String
    $description: String
    $status: String
    $researchQuestion: String
    $proposedMethod: String
    $dataNeeded: String
    $notes: String
  ) {
    updateUserIdea(
      id: $id
      title: $title
      description: $description
      status: $status
      researchQuestion: $researchQuestion
      proposedMethod: $proposedMethod
      dataNeeded: $dataNeeded
      notes: $notes
    )
  }
`;

export const DELETE_USER_IDEA = gql`
  mutation DeleteUserIdea($id: Int!) {
    deleteUserIdea(id: $id)
  }
`;

export const ADD_PAPER_TO_IDEA = gql`
  mutation AddPaperToIdea($ideaId: Int!, $paperId: String!) {
    addPaperToIdea(ideaId: $ideaId, paperId: $paperId)
  }
`;

export const REMOVE_PAPER_FROM_IDEA = gql`
  mutation RemovePaperFromIdea($ideaId: Int!, $paperId: String!) {
    removePaperFromIdea(ideaId: $ideaId, paperId: $paperId)
  }
`;

export const LINK_IDEAS = gql`
  mutation LinkIdeas($ideaId: Int!, $linkedIdeaId: Int!) {
    linkIdeas(ideaId: $ideaId, linkedIdeaId: $linkedIdeaId)
  }
`;

export const UNLINK_IDEAS = gql`
  mutation UnlinkIdeas($ideaId: Int!, $linkedIdeaId: Int!) {
    unlinkIdeas(ideaId: $ideaId, linkedIdeaId: $linkedIdeaId)
  }
`;

export const CHECK_NOVELTY = gql`
  query CheckNovelty($text: String!) {
    checkNovelty(text: $text) {
      similarPapers {
        paperId
        title
        year
        averageScore
        fields
        similarityScore
      }
      similarIdeas {
        id
        title
        status
        content
        composite
      }
      isNovel
    }
  }
`;

export const SUGGEST_METHODS = gql`
  query SuggestMethods($text: String!, $limit: Int) {
    suggestMethods(text: $text, limit: $limit) {
      slug
      title
      description
      whenToUse
      relevanceScore
    }
  }
`;

export const SUGGEST_DATA = gql`
  query SuggestData($text: String!, $limit: Int) {
    suggestData(text: $text, limit: $limit) {
      slug
      title
      description
      access
      relevanceScore
    }
  }
`;

// ---------------------------------------------------------------------------
// Research Sessions
// ---------------------------------------------------------------------------

export const GET_RESEARCH_SESSIONS = gql`
  query GetResearchSessions {
    researchSessions {
      id
      title
      query
      filters
      sort
      paperIds
      notes
      createdAt
      updatedAt
    }
  }
`;

export const GET_RESEARCH_SESSION = gql`
  query GetResearchSession($id: Int!) {
    researchSession(id: $id) {
      id
      title
      query
      filters
      sort
      paperIds
      notes
      createdAt
      updatedAt
    }
  }
`;

export const SAVE_RESEARCH_SESSION = gql`
  mutation SaveResearchSession(
    $title: String!
    $query: String!
    $filters: String
    $sort: String
    $paperIds: [String!]
    $notes: String
  ) {
    saveResearchSession(
      title: $title
      query: $query
      filters: $filters
      sort: $sort
      paperIds: $paperIds
      notes: $notes
    ) {
      id
      title
      query
      filters
      sort
      paperIds
      notes
      createdAt
      updatedAt
    }
  }
`;

export const DELETE_RESEARCH_SESSION = gql`
  mutation DeleteResearchSession($id: Int!) {
    deleteResearchSession(id: $id)
  }
`;

export const UPDATE_RESEARCH_SESSION_NOTES = gql`
  mutation UpdateResearchSessionNotes($id: Int!, $notes: String!) {
    updateResearchSessionNotes(id: $id, notes: $notes)
  }
`;

// ---------------------------------------------------------------------------
// Topic Timeline
// ---------------------------------------------------------------------------

export const TOPIC_TIMELINE = gql`
  ${PAPER_LIST_FIELDS}
  query TopicTimeline($query: String!, $limitPerYear: Int) {
    topicTimeline(query: $query, limitPerYear: $limitPerYear) {
      years {
        year
        count
        papers {
          ...PaperListFields
        }
      }
    }
  }
`;

// ---------------------------------------------------------------------------
// Field Taxonomy & Detail
// ---------------------------------------------------------------------------

export const GET_FIELD_TAXONOMY = gql`
  query GetFieldTaxonomy {
    fieldTaxonomy {
      field
      paperCount
      topMethods {
        slug
        title
        type
        paperCount
      }
      topMechanisms {
        slug
        title
        type
        paperCount
      }
      topDatasets {
        slug
        title
        type
        paperCount
      }
    }
  }
`;

export const GET_FIELD_DETAIL = gql`
  query GetFieldDetail($field: String!, $limit: Int, $offset: Int, $sort: PaperSort, $jelFilter: String) {
    fieldDetail(field: $field, limit: $limit, offset: $offset, sort: $sort, jelFilter: $jelFilter) {
      field
      paperCount
      papers {
        items {
          paperId
          title
          authors
          year
          fields
          averageScore
          hasCard
          abstract
          nberUrl
          tldr
        }
        total
      }
      methods {
        slug
        title
        type
        paperCount
        theme
      }
      mechanisms {
        slug
        title
        type
        paperCount
        theme
      }
      datasets {
        slug
        title
        type
        paperCount
        theme
      }
      puzzles {
        slug
        title
        type
        paperCount
        theme
      }
      yearDistribution {
        year
        count
      }
      jelCodes {
        code
        count
      }
    }
  }
`;

export const GET_AVAILABLE_FIELDS = gql`
  query GetAvailableFields {
    availableFields
  }
`;

export const GET_ATOM_THEME_HIERARCHY = gql`
  query GetAtomThemeHierarchy {
    atomThemeHierarchy {
      metaTheme
      themes {
        theme
        atoms {
          slug
          type
          title
          description
          evidenceStrength
          paperCount
        }
        atomCount
        paperCount
      }
      totalAtoms
      totalPapers
    }
  }
`;

export const GET_AVAILABLE_THEMES = gql`
  query GetAvailableThemes($atomType: String) {
    availableThemes(atomType: $atomType)
  }
`;

export const GET_ATOM_THEMES = gql`
  query GetAtomThemes($atomType: String) {
    atomThemes(atomType: $atomType) {
      theme
      atomType
      count
      topAtoms {
        slug
        title
        type
        description
        paperCount
        theme
      }
    }
  }
`;

// ---------------------------------------------------------------------------
// JEL Code Browser
// ---------------------------------------------------------------------------

export const GET_JEL_TAXONOMY = gql`
  query GetJelTaxonomy {
    jelTaxonomy {
      code
      label
      count
      subcodes {
        code
        count
      }
    }
  }
`;

export const GET_PAPERS_BY_JEL = gql`
  query GetPapersByJel($code: String!, $limit: Int, $offset: Int) {
    papersByJel(code: $code, limit: $limit, offset: $offset) {
      items {
        paperId
        title
        authors
        year
        fields
        averageScore
        hasCard
        tldr
      }
      total
    }
  }
`;

// ---------------------------------------------------------------------------
// Frontier Gaps
// ---------------------------------------------------------------------------

export const GET_FRONTIER_GAPS = gql`
  query GetFrontierGaps {
    frontierGaps {
      title
      description
      whyItMatters
      whatIsNeeded
      closestPaperIds
      closestPaperTitles {
        paperId
        title
      }
      feasibility
    }
  }
`;
