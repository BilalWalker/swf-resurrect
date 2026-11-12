import { MAX_DETAIL_CHARS } from './constants';

// Windows drive paths (C:\dir\file, C:/dir/file).
const WINDOWS_PATH = /(?<![A-Za-z0-9])[A-Za-z]:[\\/][^\s"'<>|*?]*/g;
// POSIX absolute paths, only where a path can start (not inside words or URLs).
const POSIX_PATH = /(?<=^|[\s"'(\[=,])\/[^\s"'<>)\]]+/g;

/**
 * Make an error message safe for a report: first line only, absolute paths
 * replaced by `<path>`, at most MAX_DETAIL_CHARS characters (Requirement 9.4).
 */
export function sanitizeDetail(text: string): string {
  const firstLine = text.split(/\r\n|\r|\n/, 1)[0] ?? '';
  const cleaned = firstLine.replace(WINDOWS_PATH, '<path>').replace(POSIX_PATH, '<path>');
  return cleaned.length > MAX_DETAIL_CHARS ? cleaned.slice(0, MAX_DETAIL_CHARS) : cleaned;
}
