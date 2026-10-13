import { describe, it, expect } from "vitest";
import { parseFeed, decodeEntities, htmlToText } from "./parser.js";

const RSS = `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>RSS &amp; Test</title>
<item><title><![CDATA[Hello <b>World</b>]]></title><link>http://x/1</link><pubDate>Mon, 01 Jan 2025 00:00:00 GMT</pubDate>
<description>short &lt;p&gt;desc&lt;/p&gt;</description><content:encoded><![CDATA[<p>Full <em>body</em> &amp; more</p>]]></content:encoded></item>
<item><title>Two</title><guid>https://x/2</guid></item></channel></rss>`;
const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title type="html">Atom &amp;amp; T</title>
<entry><title>A1</title><link rel="self" href="http://self"/><link rel="alternate" href="http://a/1"/><published>2025-01-01T00:00:00Z</published><summary>sum1</summary></entry>
<entry><title>A2</title><link href="http://a/2"/><updated>2025-01-02</updated><content type="html">&lt;p&gt;c&lt;/p&gt;</content></entry></feed>`;
const RDF = `<?xml version="1.0"?><rdf:RDF xmlns="http://purl.org/rss/1.0/" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel rdf:about="x"><title>RDF T</title><link>http://r</link></channel>
<item rdf:about="http://r/1"><title>R1</title><link>http://r/1</link><dc:date>2025-01-03</dc:date><description>rd1</description></item></rdf:RDF>`;

describe("parseFeed", () => {
  it("parses RSS 2.0 (CDATA, content:encoded, guid fallback, title decode)", () => {
    const f = parseFeed(RSS);
    expect(f.feedType).toBe("rss");
    expect(f.feedTitle).toBe("RSS & Test");
    expect(f.articles[0]).toMatchObject({ title: "Hello World", link: "http://x/1", summary: "short desc", content: "Full body & more" });
    expect(f.articles[1].link).toBe("https://x/2");
  });
  it("parses Atom (alternate link, updated, content, double-escaped title)", () => {
    const f = parseFeed(ATOM);
    expect(f.feedType).toBe("atom");
    expect(f.feedTitle).toBe("Atom & T"); // type="html" title: XML-decoded once, HTML-decoded once
    expect(f.articles[0]).toMatchObject({ link: "http://a/1", pubDate: "2025-01-01T00:00:00Z", summary: "sum1" });
    expect(f.articles[1]).toMatchObject({ link: "http://a/2", pubDate: "2025-01-02", content: "c" });
  });
  it("parses RSS 1.0 / RDF", () => {
    const f = parseFeed(RDF);
    expect(f.feedType).toBe("rdf");
    expect(f.feedTitle).toBe("RDF T");
    expect(f.articles[0]).toMatchObject({ title: "R1", pubDate: "2025-01-03", summary: "rd1" });
  });
  it("caps at 50 articles but reports the real total", () => {
    const items = Array.from({ length: 120 }, (_, i) => `<item><title>T${i}</title><link>l${i}</link></item>`).join("");
    const f = parseFeed(`<rss><channel><title>m</title>${items}</channel></rss>`);
    expect(f.articles).toHaveLength(50);
    expect(f.totalItems).toBe(120);
  });
  it("returns zero articles for an empty channel", () => {
    expect(parseFeed("<rss><channel><title>e</title></channel></rss>").articles).toEqual([]);
  });
  it("rejects malformed XML, non-feed XML and HTML", () => {
    expect(() => parseFeed("<rss><channel><title>x</title><item><title>broken")).toThrow(/Invalid XML/);
    expect(() => parseFeed("<html><body>hi</body></html>")).toThrow(/not an RSS/);
    expect(() => parseFeed("<!DOCTYPE html><html><body><br></body></html>")).toThrow(/Invalid XML|not an RSS/);
    expect(() => parseFeed("")).toThrow();
  });
  it("rejects entity declarations (XXE / billion laughs)", () => {
    const xxe = `<?xml version="1.0"?><!DOCTYPE r [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss><channel><title>&x;</title></channel></rss>`;
    expect(() => parseFeed(xxe)).toThrow(/ENTITY/);
  });
});

describe("entity decoding", () => {
  it("decodes once (no double decode)", () => {
    expect(decodeEntities("&amp;lt;")).toBe("&lt;");
    expect(decodeEntities("&lt;b&gt;")).toBe("<b>");
  });
  it("handles astral code points and invalid references", () => {
    expect(decodeEntities("&#128512; &#x1F600;")).toBe("😀 😀");
    expect(decodeEntities("&#99999999; &#xD800; &unknown;")).toBe("&#99999999; &#xD800; &unknown;");
  });
  it("htmlToText strips tags and scripts", () => {
    expect(htmlToText("<p>a</p><script>x()</script><p>b&nbsp;c</p>")).toBe("a\nb c");
  });
});
