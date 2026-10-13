import { describe, it, expect } from "vitest";
import { isBlockedIp, assertSafeUrl } from "./security.js";

describe("isBlockedIp", () => {
  it.each([
    "127.0.0.1", "127.0.0.2", "127.255.255.254", "0.0.0.0", "10.1.2.3", "172.16.0.1", "172.17.0.1",
    "172.20.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "224.0.0.1",
    "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "ff02::1",
    "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:10.0.0.1", "::ffff:a9fe:a9fe", "64:ff9b::7f00:1",
  ])("blocks %s", (ip) => expect(isBlockedIp(ip)).toBe(true));

  it.each(["8.8.8.8", "1.1.1.1", "172.15.0.1", "172.32.0.1", "93.184.216.34", "2606:4700:4700::1111", "::ffff:8.8.8.8"])(
    "allows %s",
    (ip) => expect(isBlockedIp(ip)).toBe(false)
  );

  it("treats unparseable input as blocked", () => expect(isBlockedIp("not-an-ip")).toBe(true));
});

describe("assertSafeUrl", () => {
  it.each([
    "http://127.0.0.1/", "http://127.0.0.2/feed", "http://localhost/", "http://foo.localhost/", "http://printer.local/",
    "http://metadata.internal/", "http://[::1]/", "http://[::ffff:127.0.0.1]/", "http://169.254.169.254/latest/meta-data/",
    "http://172.20.0.1/", "http://0x7f.1/", "http://2130706433/", "http://127.1/", "http://10.0.0.1:8080/", "http://localhost./",
  ])("rejects %s", (u) => expect(() => assertSafeUrl(u)).toThrow(/not permitted/));

  it("rejects non-http protocols, credentials and garbage", () => {
    expect(() => assertSafeUrl("file:///etc/passwd")).toThrow(/Unsupported protocol/);
    expect(() => assertSafeUrl("ftp://example.com/")).toThrow(/Unsupported protocol/);
    expect(() => assertSafeUrl("http://user:pw@example.com/")).toThrow(/credentials/);
    expect(() => assertSafeUrl("nope")).toThrow(/Invalid URL/);
  });

  it("accepts public URLs", () => {
    expect(assertSafeUrl("https://example.com/feed.xml").hostname).toBe("example.com");
    expect(assertSafeUrl("http://8.8.8.8/x").hostname).toBe("8.8.8.8");
  });
});
