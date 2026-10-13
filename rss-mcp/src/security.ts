import { BlockList, isIP } from "node:net";

/** Error for requests refused by the SSRF policy. */
export class BlockedAddressError extends Error {}

const blocked = new BlockList();

// IPv4: loopback, private, link-local (cloud metadata), CGNAT, reserved, multicast
const V4: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];
for (const [net, prefix] of V4) blocked.addSubnet(net, prefix, "ipv4");

// IPv6: unspecified, loopback, ULA, link-local, multicast, NAT64, 6to4, documentation
const V6: Array<[string, number]> = [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
  ["64:ff9b::", 96],
  ["2002::", 16],
  ["2001:db8::", 32],
];
for (const [net, prefix] of V6) blocked.addSubnet(net, prefix, "ipv6");

/** Expand an IPv4-mapped IPv6 address (::ffff:a.b.c.d / ::ffff:7f00:1) to dotted IPv4. */
function unmapV4(ip: string): string | null {
  const lower = ip.toLowerCase();
  const dotted = lower.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted) return dotted[1];
  const hex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  return null;
}

/** True when the IP literal is loopback / private / link-local / reserved. Unparseable input counts as blocked. */
export function isBlockedIp(ip: string): boolean {
  const bare = ip.replace(/^\[|\]$/g, "").split("%")[0];
  const family = isIP(bare);
  if (family === 4) return blocked.check(bare, "ipv4");
  if (family === 6) {
    const mapped = unmapV4(bare);
    if (mapped) return blocked.check(mapped, "ipv4");
    return blocked.check(bare, "ipv6");
  }
  return true;
}

const BLOCKED_NAME_SUFFIXES = [".localhost", ".local", ".internal", ".localdomain", ".home.arpa"];

/**
 * Static URL checks (no DNS): protocol, credentials, well-known internal names, IP literals.
 * Hostnames are additionally checked after DNS resolution at connect time.
 */
export function assertSafeUrl(
  raw: string,
  ipBlocked: (ip: string) => boolean = isBlockedIp
): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid URL: "${raw}". Provide an absolute http(s) URL such as https://example.com/feed.xml`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Unsupported protocol "${url.protocol}". Only http and https are allowed.`);
  }
  if (url.username || url.password) {
    throw new Error("URLs containing credentials (user:pass@host) are not allowed.");
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (host === "localhost" || BLOCKED_NAME_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new BlockedAddressError(`Access to internal host "${host}" is not permitted.`);
  }
  if (isIP(host.replace(/^\[|\]$/g, "")) && ipBlocked(host)) {
    throw new BlockedAddressError(`Access to private/loopback/link-local address "${host}" is not permitted.`);
  }
  return url;
}
