import type { Library } from "@/lib/types";

const ACTIVE_LIBRARY_KEY = "active_library_id";
const ACTIVE_LIBRARY_EVENT = "active-library-changed";

export function getStoredActiveLibraryId(): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(ACTIVE_LIBRARY_KEY);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function setStoredActiveLibraryId(libraryId: number | null) {
  if (typeof window === "undefined") return;
  if (libraryId && libraryId > 0) {
    window.localStorage.setItem(ACTIVE_LIBRARY_KEY, String(libraryId));
  } else {
    window.localStorage.removeItem(ACTIVE_LIBRARY_KEY);
  }
  window.dispatchEvent(new CustomEvent(ACTIVE_LIBRARY_EVENT, { detail: libraryId }));
}

export function subscribeToActiveLibrary(callback: (libraryId: number | null) => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const onChange = (event: Event) => {
    const detail = (event as CustomEvent<number | null>).detail;
    callback(typeof detail === "number" ? detail : getStoredActiveLibraryId());
  };

  window.addEventListener(ACTIVE_LIBRARY_EVENT, onChange);
  window.addEventListener("storage", onChange);

  return () => {
    window.removeEventListener(ACTIVE_LIBRARY_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function resolveInitialLibraryId(libraries: Library[]): number | null {
  const stored = getStoredActiveLibraryId();
  if (stored && libraries.some((library) => library.id === stored)) {
    return stored;
  }
  return libraries[0]?.id ?? null;
}
