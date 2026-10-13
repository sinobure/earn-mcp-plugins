import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import zlib from "node:zlib";
import type { AddressInfo } from "node:net";
import { fetchText } from "./fetcher.js";

const allowAll = { ipBlocked: () => false };
let srv: http.Server;
let base: string;

beforeAll(async () => {
  srv = http.createServer((q, s) => {
    const p = q.url ?? "";
    if (p === "/ok") return void s.end("<rss/>");
    if (p === "/gz") {
      s.setHeader("Content-Encoding", "gzip");
      return void s.end(zlib.gzipSync("zipped"));
    }
    if (p === "/sjis") {
      s.setHeader("Content-Type", "text/xml; charset=Shift_JIS");
      return void s.end(Buffer.from([0x93, 0xfa, 0x96, 0x7b]));
    }
    if (p === "/hang") return;
    if (p === "/big") {
      s.write("x");
      const iv = setInterval(() => {
        if (s.destroyed) return clearInterval(iv);
        s.write("A".repeat(1 << 16));
      }, 1);
      s.on("close", () => clearInterval(iv));
      return;
    }
    if (p === "/loop") {
      s.writeHead(302, { Location: "/loop" });
      return void s.end();
    }
    if (p === "/to-metadata") {
      s.writeHead(302, { Location: "http://169.254.169.254/latest/meta-data/" });
      return void s.end();
    }
    if (p === "/to-ok") {
      s.writeHead(301, { Location: "/ok" });
      return void s.end();
    }
    s.statusCode = 404;
    s.end("no");
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
});
afterAll(() => {
  srv.closeAllConnections();
  srv.close();
});

describe("fetchText", () => {
  it("blocks loopback by default (SSRF)", async () => {
    await expect(fetchText(`${base}/ok`)).rejects.toThrow(/not permitted/);
  });
  it("blocks hostnames that resolve to loopback (DNS check)", async () => {
    const port = new URL(base).port;
    await expect(fetchText(`http://localtest.me:${port}/ok`)).rejects.toThrow(); // blocked or DNS failure, never a response
    await expect(fetchText(`http://localhost:${port}/ok`)).rejects.toThrow(/not permitted/);
  });
  it("fetches, follows relative redirects and decodes gzip", async () => {
    expect((await fetchText(`${base}/ok`, allowAll)).text).toBe("<rss/>");
    expect((await fetchText(`${base}/to-ok`, allowAll)).finalUrl).toBe(`${base}/ok`);
    expect((await fetchText(`${base}/gz`, allowAll)).text).toBe("zipped");
  });
  it("decodes non-UTF-8 charsets from Content-Type", async () => {
    expect((await fetchText(`${base}/sjis`, allowAll)).text).toBe("日本");
  });
  it("re-validates each redirect hop", async () => {
    // Only the metadata range is blocked, so the first hop (127.0.0.1) is allowed and the redirect target is refused.
    const onlyMetadata = { ipBlocked: (ip: string) => ip.startsWith("169.254.") };
    await expect(fetchText(`${base}/to-metadata`, onlyMetadata)).rejects.toThrow(/not permitted/);
  });
  it("stops redirect loops", async () => {
    await expect(fetchText(`${base}/loop`, { ...allowAll, maxRedirects: 3 })).rejects.toThrow(/Too many redirects/);
  });
  it("enforces the response size limit while streaming", async () => {
    await expect(fetchText(`${base}/big`, { ...allowAll, maxBytes: 100_000 })).rejects.toThrow(/too large/);
  });
  it("times out with a clear message", async () => {
    await expect(fetchText(`${base}/hang`, { ...allowAll, timeoutMs: 200 })).rejects.toThrow(/Timed out after/);
  });
  it("reports HTTP errors and connection failures clearly", async () => {
    await expect(fetchText(`${base}/missing`, allowAll)).rejects.toThrow(/HTTP 404/);
    await expect(fetchText("http://127.0.0.1:1/x", allowAll)).rejects.toThrow(/Connection refused.*ECONNREFUSED/);
  });
});
