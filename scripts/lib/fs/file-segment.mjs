/**
 * Windows-safe file name segments.
 *
 * NTFS cannot represent < > : " / \ | ? * or control characters inside a file
 * name. A colon is worse than merely rejected: `session:eval-001.json` is
 * parsed as an NTFS alternate data stream, so the create appears to succeed and
 * the following rename fails with EINVAL — a failure that never reproduces on
 * POSIX. Any artifact name derived from an entity id must go through here.
 *
 * The character class matches the convention already used by the memo storage
 * layer (`sanitizeSpace`, `sanitizeWorkspaceMemorySpaceForSessionId`). Those
 * normalizers additionally lowercase, collapse whitespace and trim dashes, so
 * they are not reusable for opaque ids — this helper only removes characters a
 * file name cannot contain and leaves the value otherwise intact.
 */
const ILLEGAL_FILE_NAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;

export function sanitizeFileSegment(segment) {
  return String(segment ?? '').replace(ILLEGAL_FILE_NAME_CHARS, '-');
}
