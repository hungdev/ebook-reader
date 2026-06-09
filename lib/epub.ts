import JSZip from "jszip";
import type { Chapter } from "./types";

interface TocEntry {
  label: string;
  href: string;
  level: number;
}

function parseXML(text: string): Document {
  return new DOMParser().parseFromString(text, "application/xml");
}

function basename(path: string): string {
  const clean = path.split("#")[0].split("?")[0];
  return clean.split("/").pop() ?? clean;
}

function normalizeHref(href: string): string {
  return href.split("#")[0].split("?")[0].toLowerCase();
}

function resolvePath(opfPath: string, relative: string): string {
  if (relative.startsWith("/")) {
    return relative.slice(1);
  }
  const baseParts = opfPath.includes("/")
    ? opfPath.split("/").slice(0, -1)
    : [];
  const relParts = relative.split("/");
  for (const part of relParts) {
    if (part === "..") baseParts.pop();
    else if (part !== ".") baseParts.push(part);
  }
  return baseParts.join("/");
}

function getMetadataText(doc: Document, tag: string): string | undefined {
  const el =
    doc.querySelector(`metadata > ${tag}`) ??
    doc.querySelector(`metadata > dc\\:${tag}`) ??
    doc.querySelector(`metadata [local-name()="${tag}"]`);
  return el?.textContent?.trim() || undefined;
}

function findZipFile(zip: JSZip, path: string): JSZip.JSZipObject | null {
  const direct = zip.file(path);
  if (direct) return direct;

  const lower = path.toLowerCase();
  const match = Object.keys(zip.files).find(
    (name) => name.toLowerCase() === lower,
  );
  return match ? zip.file(match) : null;
}

function cleanText(text: string): string {
  return text.replace(/[ \t\r\n]+/g, " ").trim();
}

function htmlToParagraphs(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const body = doc.body;
  if (!body) return [];

  body
    .querySelectorAll("script, style, nav, aside, svg, img")
    .forEach((el) => el.remove());

  let paragraphs: string[] = [];

  const pTags = [...body.querySelectorAll("p")];
  if (pTags.length > 0) {
    for (const p of pTags) {
      const text = cleanText(p.textContent ?? "");
      if (text) paragraphs.push(text);
    }
    return paragraphs;
  }

  const fromTags = (selector: string) =>
    [...body.querySelectorAll(selector)]
      .map((el) => cleanText(el.textContent ?? ""))
      .filter(Boolean);

  paragraphs = fromTags("div, section, article, blockquote, li");
  if (paragraphs.length > 0) return paragraphs;

  paragraphs = fromTags("h1, h2, h3, h4, h5, h6");
  if (paragraphs.length > 0) return paragraphs;

  const fallback = cleanText(body.textContent ?? "");
  return fallback ? [fallback] : [];
}

function extractHeading(html: string): string | undefined {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const heading = doc.querySelector("h1, h2, h3, h4");
  const text = cleanText(heading?.textContent ?? "");
  return text || undefined;
}

function parseNavList(ol: Element, basePath: string, level: number, out: TocEntry[]): void {
  for (const li of ol.querySelectorAll(":scope > li")) {
    const link = li.querySelector(":scope > a, :scope > span > a");
    const label = cleanText(link?.textContent ?? "");
    const rawHref = link?.getAttribute("href");
    if (label && rawHref) {
      out.push({
        label,
        href: resolvePath(basePath, rawHref.split("#")[0]),
        level,
      });
    }
    const nested = li.querySelector(":scope > ol");
    if (nested) {
      parseNavList(nested, basePath, level + 1, out);
    }
  }
}

async function loadEpub3Nav(
  zip: JSZip,
  opfDoc: Document,
  opfPath: string,
): Promise<TocEntry[]> {
  let navPath: string | null = null;

  for (const item of opfDoc.querySelectorAll("manifest item, manifest > item")) {
    const properties = item.getAttribute("properties") ?? "";
    if (properties.split(/\s+/).includes("nav")) {
      const href = item.getAttribute("href");
      if (href) navPath = resolvePath(opfPath, href);
    }
  }

  if (!navPath) return [];

  const zipEntry = findZipFile(zip, navPath);
  const html = await zipEntry?.async("text");
  if (!html) return [];

  const doc = new DOMParser().parseFromString(html, "text/html");
  const entries: TocEntry[] = [];
  const navBase = navPath.includes("/")
    ? navPath.split("/").slice(0, -1).join("/")
    : "";

  for (const nav of doc.querySelectorAll("nav")) {
    const type =
      nav.getAttribute("epub:type") ??
      nav.getAttributeNS("http://www.idpf.org/2007/ops", "type");
    if (type !== "toc") continue;
    const ol = nav.querySelector("ol");
    if (ol) parseNavList(ol, navBase, 0, entries);
  }

  return entries;
}

function isTag(el: Element, name: string): boolean {
  return el.localName === name || el.tagName === name;
}

function walkNcxPoints(navPoint: Element, out: TocEntry[], level: number): void {
  let label = "";
  let src: string | null = null;

  for (const child of Array.from(navPoint.children)) {
    if (isTag(child, "navLabel")) {
      label = cleanText(child.textContent ?? "");
    } else if (isTag(child, "content")) {
      src = child.getAttribute("src");
    }
  }

  if (label && src) {
    out.push({
      label,
      href: src.split("#")[0],
      level,
    });
  }

  for (const child of Array.from(navPoint.children)) {
    if (isTag(child, "navPoint")) {
      walkNcxPoints(child, out, level + 1);
    }
  }
}

async function loadNcxToc(
  zip: JSZip,
  opfDoc: Document,
  opfPath: string,
): Promise<TocEntry[]> {
  let ncxPath: string | null = null;

  for (const item of opfDoc.querySelectorAll("manifest item, manifest > item")) {
    if (item.getAttribute("media-type") === "application/x-dtbncx+xml") {
      const href = item.getAttribute("href");
      if (href) ncxPath = resolvePath(opfPath, href);
    }
  }

  if (!ncxPath) {
    const spineToc = opfDoc.querySelector("spine")?.getAttribute("toc");
    if (spineToc) {
      const item = opfDoc.querySelector(`manifest item[id="${spineToc}"]`);
      const href = item?.getAttribute("href");
      if (href) ncxPath = resolvePath(opfPath, href);
    }
  }

  if (!ncxPath) return [];

  const zipEntry = findZipFile(zip, ncxPath);
  const xml = await zipEntry?.async("text");
  if (!xml) return [];

  const doc = parseXML(xml);
  const entries: TocEntry[] = [];
  const ncxBase = ncxPath.includes("/")
    ? ncxPath.split("/").slice(0, -1).join("/")
    : "";

  for (const navPoint of doc.querySelectorAll("navMap > navPoint")) {
    walkNcxPoints(navPoint, entries, 0);
  }

  return entries.map((entry) => ({
    ...entry,
    href: resolvePath(ncxBase, entry.href),
  }));
}

function matchTocEntry(
  spineHref: string,
  toc: TocEntry[],
  usedIndices: Set<number>,
): TocEntry | undefined {
  const spineNorm = normalizeHref(spineHref);
  const spineBase = basename(spineHref);

  for (let i = 0; i < toc.length; i++) {
    if (usedIndices.has(i)) continue;
    const entry = toc[i];
    const entryNorm = normalizeHref(entry.href);
    const entryBase = basename(entry.href);
    if (
      spineNorm === entryNorm ||
      spineBase === entryBase ||
      spineNorm.endsWith(entryNorm) ||
      entryNorm.endsWith(spineNorm)
    ) {
      usedIndices.add(i);
      return entry;
    }
  }

  return undefined;
}

function resolveChapterTitle(
  html: string,
  spineHref: string,
  index: number,
  bookTitle: string,
  toc: TocEntry[],
  usedTocIndices: Set<number>,
): { title: string; tocLevel: number } {
  const tocEntry = matchTocEntry(spineHref, toc, usedTocIndices);
  if (tocEntry) {
    return { title: tocEntry.label, tocLevel: tocEntry.level };
  }

  const heading = extractHeading(html);
  if (heading && heading !== bookTitle) {
    return { title: heading, tocLevel: 0 };
  }

  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const htmlTitle = titleMatch?.[1] ? cleanText(titleMatch[1]) : undefined;
  if (htmlTitle && htmlTitle !== bookTitle) {
    return { title: htmlTitle, tocLevel: 0 };
  }

  return { title: `Chương ${index + 1}`, tocLevel: 0 };
}

export function formatChapterLabel(
  chapter: Chapter,
  index: number,
  bookTitle: string,
): string {
  if (chapter.tocLevel === 0 && chapter.title && chapter.title !== bookTitle) {
    const isPart = /^(phần|part|book)\s/i.test(chapter.title);
    if (isPart) return chapter.title;
  }

  if (!chapter.title || chapter.title === bookTitle) {
    return `${index + 1}`;
  }

  if (/^\d+$/.test(chapter.title)) {
    return chapter.title;
  }

  return chapter.title;
}

export async function parseEpub(
  file: ArrayBuffer,
): Promise<{ title: string; author?: string; chapters: Chapter[] }> {
  const zip = await JSZip.loadAsync(file);

  const containerXml = await zip
    .file("META-INF/container.xml")
    ?.async("text");
  if (!containerXml) throw new Error("Không tìm thấy container.xml");

  const containerDoc = parseXML(containerXml);
  const rootfile = containerDoc.querySelector("rootfile");
  const opfPath = rootfile?.getAttribute("full-path");
  if (!opfPath) throw new Error("Không tìm thấy file OPF");

  const opfContent = await zip.file(opfPath)?.async("text");
  if (!opfContent) throw new Error("Không đọc được file OPF");

  const opfDoc = parseXML(opfContent);

  const title = getMetadataText(opfDoc, "title") || "Không có tiêu đề";
  const author = getMetadataText(opfDoc, "creator");

  const manifest = new Map<string, string>();
  opfDoc.querySelectorAll("manifest item, manifest > item").forEach((item) => {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    const mediaType = item.getAttribute("media-type");
    if (
      id &&
      href &&
      (mediaType?.includes("html") || mediaType?.includes("xml"))
    ) {
      manifest.set(id, resolvePath(opfPath, href));
    }
  });

  const spineIds: string[] = [];
  opfDoc.querySelectorAll("spine > itemref").forEach((item) => {
    const idref = item.getAttribute("idref");
    if (idref) spineIds.push(idref);
  });

  const navToc = await loadEpub3Nav(zip, opfDoc, opfPath);
  const ncxToc = navToc.length === 0 ? await loadNcxToc(zip, opfDoc, opfPath) : [];
  const toc = navToc.length > 0 ? navToc : ncxToc;
  const usedTocIndices = new Set<number>();

  const chapters: Chapter[] = [];

  for (const id of spineIds) {
    const href = manifest.get(id);
    if (!href) continue;

    const zipEntry = findZipFile(zip, href);
    const html = await zipEntry?.async("text");
    if (!html) continue;

    const paragraphs = htmlToParagraphs(html);
    if (paragraphs.length === 0) continue;

    const { title: chapterTitle, tocLevel } = resolveChapterTitle(
      html,
      href,
      chapters.length,
      title,
      toc,
      usedTocIndices,
    );

    chapters.push({
      id,
      title: chapterTitle,
      content: paragraphs.join("\n\n"),
      tocLevel,
    });
  }

  if (chapters.length === 0) {
    throw new Error("Không tìm thấy nội dung trong file EPUB");
  }

  return { title, author, chapters };
}

export async function parseTxt(
  file: ArrayBuffer,
  fileName: string,
): Promise<{ title: string; chapters: Chapter[] }> {
  const decoder = new TextDecoder("utf-8");
  const text = decoder.decode(file);

  const title = fileName.replace(/\.(txt|text)$/i, "") || "Văn bản";

  const paragraphs = text
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);

  return {
    title,
    chapters: [
      {
        id: "main",
        title: "Nội dung",
        content: paragraphs.length > 0 ? paragraphs.join("\n\n") : text.trim(),
      },
    ],
  };
}
