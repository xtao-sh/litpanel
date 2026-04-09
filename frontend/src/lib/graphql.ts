import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";

const client = new ApolloClient({
  link: new HttpLink({
    uri: process.env.NEXT_PUBLIC_GRAPHQL_URL || "http://localhost:8001/graphql",
  }),
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
