import { ApolloClient, InMemoryCache, HttpLink, ApolloLink } from "@apollo/client";
import { setContext } from "@apollo/client/link/context";
import { getStoredActiveLibraryId } from "@/lib/libraries";
import { getGraphqlUrl } from "@/lib/api";

const httpLink = new HttpLink({
  uri: getGraphqlUrl(),
});

const libraryHeaderLink = setContext((_, { headers }) => {
  const libraryId = getStoredActiveLibraryId();
  return {
    headers: {
      ...headers,
      ...(libraryId ? { "X-Library-Id": String(libraryId) } : {}),
    },
  };
});

const client = new ApolloClient({
  link: ApolloLink.from([libraryHeaderLink, httpLink]),
  cache: new InMemoryCache({
    typePolicies: {
      Paper: { keyFields: ["paperId"] },
      Atom: { keyFields: ["slug"] },
      Collection: { keyFields: ["id"] },
      UserIdea: { keyFields: ["id"] },
      Idea: { keyFields: ["id"] },
      Digest: { keyFields: ["date"] },
      SearchHit: { keyFields: ["entityType", "entityId"] },
      GraphNode: { keyFields: ["id"] },
    },
  }),
});

export default client;
