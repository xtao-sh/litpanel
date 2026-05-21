"use client";
import React, { useEffect } from "react";
import { ApolloProvider } from "@apollo/client/react";
import client from "./graphql";
import { subscribeToActiveLibrary } from "@/lib/libraries";

export function ApolloWrapper({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    return subscribeToActiveLibrary(() => {
      void client.resetStore();
    });
  }, []);

  return <ApolloProvider client={client}>{children}</ApolloProvider>;
}
