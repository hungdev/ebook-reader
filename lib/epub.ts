import JSZip from "jszip";
import type { Chapter } from "./types";

function parseXML(text: string): Document {
  return new DOMParser().parseFromString(text, "application/xml");
}

function getTextContent(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const body = doc.body;
  if (!body) return "";

  body
    .querySelectorAll("script, style, nav, aside")
    .forEach((el) => el.remove());

  return body.innerText.replace(/\n{3,}/g, "\n\n").trim();
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

  const chapters: Chapter[] = [];

  for (const id of spineIds) {
    const href = manifest.get(id);
    if (!href) continue;

    const zipEntry = findZipFile(zip, href);
    const html = await zipEntry?.async("text");
    if (!html) continue;

    const text = getTextContent(html);
    if (!text) continue;

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const chapterTitle = titleMatch?.[1]?.trim() || `Chương ${chapters.length + 1}`;

    chapters.push({
      id,
      title: chapterTitle,
      content: text,
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

  return {
    title,
    chapters: [
      {
        id: "main",
        title: "Nội dung",
        content: text,
      },
    ],
  };
}
