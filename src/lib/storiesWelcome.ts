/**
 * Whether this visitor has already answered the stories invitation. Kept apart
 * from the stories themselves so the page can decide to show the one-line
 * invitation without loading them (StoryCard.ts and its data are fetched only
 * once a story is asked for).
 */
const WELCOME_KEY = "roamingeye:stories-welcome";

export function storiesWelcomed(): boolean {
  try {
    return localStorage.getItem(WELCOME_KEY) === "done";
  } catch {
    return false;
  }
}

/** Retire the invitation for good: a story was played, or closed. */
export function markStoriesWelcomed(): void {
  try {
    localStorage.setItem(WELCOME_KEY, "done");
  } catch {
    /* private mode: the invitation just returns next visit */
  }
}
