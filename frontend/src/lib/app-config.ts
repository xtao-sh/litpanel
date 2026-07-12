export const appConfig = {
  appName:
    process.env.NEXT_PUBLIC_APP_NAME ?? "Lit Panel",
  appShortName: process.env.NEXT_PUBLIC_APP_SHORT_NAME ?? "Lit Panel",
  appDescription:
    process.env.NEXT_PUBLIC_APP_DESCRIPTION ??
    "Explore papers, methods, datasets, and research ideas in your local literature workspace.",
  corpusLabel: process.env.NEXT_PUBLIC_CORPUS_LABEL ?? "local corpus",
  sourceName: process.env.NEXT_PUBLIC_SOURCE_NAME ?? "Local Library",
  sourcePaperLabel:
    process.env.NEXT_PUBLIC_SOURCE_PAPER_LABEL ?? "working papers",
  externalPaperLabel:
    process.env.NEXT_PUBLIC_EXTERNAL_PAPER_LABEL ?? "View at source",
  remoteDiscoveryLabel:
    process.env.NEXT_PUBLIC_REMOTE_DISCOVERY_LABEL ??
    (process.env.NEXT_PUBLIC_SOURCE_NAME ?? "Local Library"),
  supportsRemoteDiscovery:
    (process.env.NEXT_PUBLIC_SUPPORTS_REMOTE_DISCOVERY ?? "false") === "true",
};
