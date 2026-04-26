"use client";

export function collectErrorMessages(
  errors: Array<{ message?: string } | undefined | null>
): string {
  const unique = Array.from(
    new Set(
      errors
        .map((error) => (error?.message ?? "").trim())
        .filter(Boolean)
    )
  );
  return unique.join(" ");
}

interface QueryErrorBannerProps {
  error: { message?: string } | undefined;
  message?: string;
}

export function QueryErrorBanner({ error, message }: QueryErrorBannerProps) {
  if (!error) return null;

  const displayMessage = message || "Failed to load data. Please try refreshing the page.";

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950 p-4 text-sm text-red-800 dark:text-red-200">
      <p className="font-medium">{displayMessage}</p>
      {error.message && (
        <p className="mt-1 text-red-600 dark:text-red-400 text-xs">{error.message}</p>
      )}
    </div>
  );
}
