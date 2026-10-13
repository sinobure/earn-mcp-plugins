import { XMLParser, XMLValidator } from "fast-xml-parser";

export interface FeedArticle {
  title: string;
  link: string;
  pubDate: string;
  /** Plain-text summary, at most SUMMARY_MAX characters. */
  summary: string;
  /** Plain-text full content (content:encoded / content / description), at most CONTENT_MAX characters. */
  content: string;
  contentTruncated: boolean;
}

export interface ParsedFeed {
  feedTitle: string;
  feedType: "rss" | "atom" | "rdf";
  articles: FeedArticle[];
  /** Number of items present in the feed (articles holds at most MAX_ARTICLES). */
  totalItems: number;
}

export const MAX_ARTICLES = 50;
export const SUMMARY_MAX = 500;
export const CONTENT_MAX = 20_000;

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  hellip: "…", mdash: "—", ndash: "–", laquo: "«", raquo: "»", copy: "©",
};

/** Single-pass entity decode, so "&amp;lt;" becomes "&lt;" and not "<". */
export function decodeEntities(str: string): string {
  return str.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, body: string) => {
    if (body[0] === "#") {
      const cp = body[1].toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(cp) || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff) || cp === 0) return m;
      return String.fromCodePoint(cp);
    }
    return NAMED[body.toLowerCase()] ?? m;
  });
}

/** Convert an HTML fragment to readable plain text. */
export function htmlToText(html: string): string {
  const stripped = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr)\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "");
  return decodeEntities(stripped)
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type Node = unknown;

function text(v: Node): string {
  if (v == null) return "";
  if (Array.isArray(v)) return text(v[0]);
  if (typeof v === "object") return text((v as Record<string, Node>)["#text"]);
  return String(v);
}

function pick(obj: Record<string, Node>, ...keys: string[]): string {
  for (const k of keys) {
    const t = text(obj[k]).trim();
    if (t) return t;
  }
  return "";
}

function atomLink(links: Node): string {
  const arr = (Array.isArray(links) ? links : links ? [links] : []) as Array<Record<string, Node> | string>;
  const withHref = arr.filter((l): l is Record<string, Node> => typeof l === "object" && l !== null && !!l["@_href"]);
  const best =
    withHref.find((l) => l["@_rel"] === "alternate") ??
    withHref.find((l) => !l["@_rel"]) ??
    withHref[0];
  return best ? String(best["@_href"]).trim() : "";
}

function makeArticle(item: Record<string, Node>, atom: boolean): FeedArticle {
  const title = htmlToText(pick(item, "title")) || "(no title)";
  let link = atom ? atomLink(item["link"]) : pick(item, "link");
  if (!link && !atom) {
    const guid = pick(item, "guid");
    if (/^https?:\/\//i.test(guid)) link = guid;
  }
  if (!link && atom) link = pick(item, "link");
  const pubDate = pick(item, "pubDate", "published", "updated", "dc:date");
  const summaryRaw = pick(item, "description", "summary");
  const contentRaw = pick(item, "content:encoded", "content") || summaryRaw;
  const summary = htmlToText(summaryRaw || contentRaw);
  const content = htmlToText(contentRaw);
  return {
    title,
    link,
    pubDate,
    summary: summary.slice(0, SUMMARY_MAX),
    content: content.slice(0, CONTENT_MAX),
    contentTruncated: content.length > CONTENT_MAX,
  };
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
  isArray: (name) => name === "item" || name === "entry" || name === "link",
});

export function parseFeed(xml: string): ParsedFeed {
  if (/<!ENTITY/i.test(xml)) {
    throw new Error("Rejected: XML containing <!ENTITY> declarations is not supported (entity expansion is disabled for safety).");
  }
  const valid = XMLValidator.validate(xml);
  if (valid !== true) {
    throw new Error(`Invalid XML (line ${valid.err.line}): ${valid.err.msg}. The URL may not point to an RSS/Atom feed (e.g. it returned an HTML page).`);
  }
  const doc = parser.parse(xml) as Record<string, Record<string, Node>>;

  let feedType: ParsedFeed["feedType"];
  let items: Array<Record<string, Node>>;
  let feedTitle: string;

  if (doc["rss"] && typeof doc["rss"] === "object") {
    feedType = "rss";
    const channel = (doc["rss"]["channel"] ?? {}) as Record<string, Node>;
    feedTitle = pick(channel, "title");
    items = (channel["item"] ?? []) as Array<Record<string, Node>>;
  } else if (doc["feed"] && typeof doc["feed"] === "object") {
    feedType = "atom";
    feedTitle = pick(doc["feed"], "title");
    items = (doc["feed"]["entry"] ?? []) as Array<Record<string, Node>>;
  } else if (doc["rdf:RDF"] && typeof doc["rdf:RDF"] === "object") {
    feedType = "rdf";
    const channel = (doc["rdf:RDF"]["channel"] ?? {}) as Record<string, Node>;
    feedTitle = pick(channel, "title");
    items = (doc["rdf:RDF"]["item"] ?? []) as Array<Record<string, Node>>;
  } else {
    throw new Error(
      "The response is valid XML but not an RSS 2.0, Atom 1.0 or RSS 1.0 (RDF) feed. Check that the URL points to the feed itself, not an HTML page."
    );
  }
  items = items.filter((i) => i && typeof i === "object");
  const articles = items.slice(0, MAX_ARTICLES).map((i) => makeArticle(i, feedType === "atom"));
  return {
    feedTitle: htmlToText(feedTitle) || "Untitled Feed",
    feedType,
    articles,
    totalItems: items.length,
  };
}
