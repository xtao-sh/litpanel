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
    <div className="rounded-[var(--r)] border border-[#da9a80] bg-[#f4dfd5] p-4 text-sm text-[#742b14]">
      <p className="font-medium">{displayMessage}</p>
      {error.message && (
        <p className="mt-1 text-xs text-[#8a3318]">{error.message}</p>
      )}
    </div>
  );
}
