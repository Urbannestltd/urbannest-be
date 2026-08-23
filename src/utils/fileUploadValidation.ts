import { BadRequestError } from "./apiError";

// Allow-list, not deny-list: only extensions explicitly listed here are
// accepted. An unrecognized or executable/script extension (.php, .exe,
// .sh, .js, ...) is rejected by omission — nothing needs to enumerate
// every dangerous extension for this to hold.
const ALLOWED_EXTENSIONS = new Set([
  // images
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "heic",
  "heif",
  // documents
  "pdf",
  "doc",
  "docx",
  // video (maintenance evidence)
  "mp4",
  "mov",
  "webm",
]);

const MAX_FILENAME_LENGTH = 255;

/**
 * Validates a client-supplied filename before it's used to build a storage
 * path: rejects path-traversal/null-byte tricks and enforces the extension
 * allow-list above. Returns the filename unchanged (not sanitized further)
 * since callers still namespace it under `{folder}/{userId}/{timestamp}_...`.
 */
export function validateUploadFilename(filename: string): void {
  if (!filename || filename.length > MAX_FILENAME_LENGTH) {
    throw new BadRequestError("Invalid filename.");
  }
  if (filename.includes("/") || filename.includes("\\") || filename.includes("\0")) {
    throw new BadRequestError("Filename must not contain path separators.");
  }
  if (filename === "." || filename === "..") {
    throw new BadRequestError("Invalid filename.");
  }

  const match = /\.([a-zA-Z0-9]+)$/.exec(filename);
  const extension = match?.[1]?.toLowerCase();
  if (!extension || !ALLOWED_EXTENSIONS.has(extension)) {
    throw new BadRequestError(
      `File type not allowed. Accepted types: ${[...ALLOWED_EXTENSIONS].join(", ")}.`,
    );
  }
}

/**
 * Validates the client-supplied storage folder segment — must be a plain
 * path component, not an absolute path or a traversal attempt.
 */
export function validateUploadFolder(folder: string): void {
  if (!folder || folder.includes("..") || folder.startsWith("/") || folder.includes("\0")) {
    throw new BadRequestError("Invalid folder.");
  }
}
