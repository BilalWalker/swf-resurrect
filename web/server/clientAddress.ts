// The client's address for per-client limits. Pure.
//
// X-Forwarded-For is written by the client as much as by proxies, so it is only read when the
// operator says how many reverse proxies stand in front of the server (TRUST_PROXY=<hops>).
// Each trusted proxy appends the address it received the request from, so the client is the
// entry `hops` places from the right; anything further left was sent by the client and is
// ignored.
import { isIP } from 'node:net';

/** Strips IPv6 brackets, an IPv4 port and the IPv4-mapped IPv6 prefix; null when not an IP. */
export function normaliseAddress(raw: string): string | null {
  let a = raw.trim();
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(a);
  if (bracketed !== null) a = bracketed[1];
  else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(a)) a = a.slice(0, a.lastIndexOf(':'));
  if (/^::ffff:\d{1,3}(?:\.\d{1,3}){3}$/i.test(a)) a = a.slice(7);
  return isIP(a) === 0 ? null : a.toLowerCase();
}

/**
 * The address limits are keyed on. With trustedHops 0 it is the socket's peer; otherwise the
 * X-Forwarded-For entry written by the outermost trusted proxy (falling back to the socket's
 * peer when the header is missing or that entry is not an IP address).
 */
export function clientAddress(socketAddress: string | undefined, forwardedFor: string | string[] | undefined, trustedHops: number): string {
  const peer = (socketAddress === undefined ? null : normaliseAddress(socketAddress)) ?? 'unknown';
  if (trustedHops <= 0 || forwardedFor === undefined) return peer;
  const entries = (Array.isArray(forwardedFor) ? forwardedFor.join(',') : forwardedFor)
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
  if (entries.length === 0) return peer;
  const picked = entries[Math.max(0, entries.length - trustedHops)];
  return normaliseAddress(picked) ?? peer;
}
