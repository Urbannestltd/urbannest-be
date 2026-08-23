import { NotFoundError } from "./apiError";

/**
 * Throws 404 unless `resource` exists and `isOwned` holds for it.
 *
 * Always 404, never 403/400 — a caller who doesn't own the resource gets the
 * same response as one requesting an ID that doesn't exist at all, so a
 * guessed/enumerated ID can't be used to confirm another tenant's resource
 * exists. Narrows `resource` to non-null on the caller's side (TS assertion
 * function), so the fetch-then-check pattern doesn't also need a `!`.
 */
export function assertOwned<T>(
  resource: T | null | undefined,
  isOwned: (resource: T) => boolean,
  notFoundMessage: string,
): asserts resource is T {
  if (!resource || !isOwned(resource)) {
    throw new NotFoundError(notFoundMessage);
  }
}
