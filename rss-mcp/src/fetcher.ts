import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import zlib from "node:zlib";
import { assertSafeUrl, BlockedAddressError, isBlockedIp } from "./security.js";

export const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
export const TIMEOUT_MS = 10_000;
export const MAX_REDIRECTS = 5;

export interface FetchOptions {
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  userAgent?: string;
  /** Override the address policy (tests only). Defaults to the SSRF blocklist. */
  ipBlocked?: (ip: string) => boolean;
}

function describeNetError(err: unknown, host: string): string {
  const e = err as NodeJS.ErrnoException & { cause?: NodeJS.ErrnoException };
  const code = e?.code ?? e?.cause?.code;
  const detail = e?.cause?.message ?? e?.message ?? String(err);
  switch (code) {
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return `DNS lookup failed for "${host}" (${code}). Check the host name.`;
    case "ECONNREFUSED":
      return `Connection refused by "${host}" (ECONNREFUSED).`;
    case "ECONNRESET":
      return `Connection to "${host}" was reset (ECONNRESET).`;
    case "ETIMEDOUT":
      return `Connection to "${host}" timed out (ETIMEDOUT).`;
    default:
      return code ? `Network error for "${host}" (${code}): ${detail}` : `Network error for "${host}": ${detail}`;
  }
}

function decodeBody(buf: Buffer, contentType: string | undefined): string {
  let charset = contentType?.match(/charset=["']?([\w-]+)/i)?.[1];
  if (!charset) {
    charset = buf.subarray(0, 256).toString("latin1").match(/<\?xml[^>]*encoding=["']([\w-]+)["']/i)?.[1];
  }
  try {
    return new TextDecoder(charset ?? "utf-8").decode(buf);
  } catch {
    return buf.toString("utf8");
  }
}

function requestOnce(
  url: URL,
  opts: Required<Omit<FetchOptions, "maxRedirects">>,
  deadline: number
): Promise<{ status: number; location?: string; body?: string }> {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === "https:" ? https : http;
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const remaining = Math.max(1, deadline - Date.now());
    const timer = setTimeout(() => {
      req.destroy();
      done(() =>
        reject(new Error(`Timed out after ${Math.round(opts.timeoutMs / 1000)}s while fetching ${url.origin}${url.pathname}`))
      );
    }, remaining);

    // Validate every resolved address at connect time (also pins the connection to the checked IP).
    const lookup = ((hostname: string, options: dns.LookupOptions, cb: (...a: unknown[]) => void) => {
      dns.lookup(hostname, { ...options, all: true }, (err, addrs) => {
        if (err) return cb(err);
        const list = addrs as dns.LookupAddress[];
        const bad = list.find((a) => opts.ipBlocked(a.address));
        if (bad) {
          return cb(new BlockedAddressError(`Host "${hostname}" resolves to a private/loopback/link-local address (${bad.address}); access is not permitted.`));
        }
        if (options.all) return cb(null, list);
        cb(null, list[0].address, list[0].family);
      });
    }) as unknown as net_lookup;

    const req = lib.request(
      url,
      {
        method: "GET",
        lookup,
        headers: {
          "User-Agent": opts.userAgent,
          Accept: "application/rss+xml, application/atom+xml, application/rdf+xml, application/xml, text/xml;q=0.9, */*;q=0.5",
          "Accept-Encoding": "gzip, deflate, br",
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return done(() => resolve({ status, location: res.headers.location }));
        }
        if (status < 200 || status >= 300) {
          res.resume();
          return done(() => resolve({ status }));
        }
        const declared = Number(res.headers["content-length"]);
        if (Number.isFinite(declared) && declared > opts.maxBytes && !res.headers["content-encoding"]) {
          req.destroy();
          return done(() => reject(new Error(`Response too large: ${declared} bytes exceeds the ${opts.maxBytes} byte limit.`)));
        }
        const enc = String(res.headers["content-encoding"] ?? "").toLowerCase();
        let stream: NodeJS.ReadableStream = res;
        if (enc === "gzip" || enc === "x-gzip") stream = res.pipe(zlib.createGunzip());
        else if (enc === "deflate") stream = res.pipe(zlib.createInflate());
        else if (enc === "br") stream = res.pipe(zlib.createBrotliDecompress());
        const chunks: Buffer[] = [];
        let total = 0;
        stream.on("data", (c: Buffer) => {
          total += c.length;
          if (total > opts.maxBytes) {
            req.destroy();
            return done(() => reject(new Error(`Response too large: exceeded the ${opts.maxBytes} byte (${(opts.maxBytes / 1048576).toFixed(0)}MB) limit.`)));
          }
          chunks.push(c);
        });
        stream.on("end", () =>
          done(() => resolve({ status, body: decodeBody(Buffer.concat(chunks), res.headers["content-type"]) }))
        );
        stream.on("error", (e) => done(() => reject(new Error(`Failed to read response: ${(e as Error).message}`))));
      }
    );
    req.on("error", (e) => {
      if (e instanceof BlockedAddressError || (e as { cause?: unknown }).cause instanceof BlockedAddressError) {
        return done(() => reject(e));
      }
      done(() => reject(new Error(describeNetError(e, url.hostname))));
    });
    req.end();
  });
}
type net_lookup = typeof dns.lookup;

/** GET a feed as text. Follows redirects manually and re-validates every hop. */
export async function fetchText(rawUrl: string, options: FetchOptions = {}): Promise<{ text: string; finalUrl: string }> {
  const opts = {
    maxBytes: options.maxBytes ?? MAX_BYTES,
    timeoutMs: options.timeoutMs ?? TIMEOUT_MS,
    userAgent: options.userAgent ?? "kw-rss-mcp (MCP RSS Reader)",
    ipBlocked: options.ipBlocked ?? isBlockedIp,
  };
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS;
  const deadline = Date.now() + opts.timeoutMs;
  let current = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const url = assertSafeUrl(current, opts.ipBlocked);
    const res = await requestOnce(url, opts, deadline);
    if (res.location) {
      try {
        current = new URL(res.location, url).toString();
      } catch {
        throw new Error(`Invalid redirect Location "${res.location}" from ${url.origin}`);
      }
      continue;
    }
    if (res.body === undefined) {
      throw new Error(`HTTP ${res.status} when fetching feed: ${url.origin}${url.pathname}`);
    }
    return { text: res.body, finalUrl: url.toString() };
  }
  throw new Error(`Too many redirects (more than ${maxRedirects}) while fetching ${rawUrl}`);
}
