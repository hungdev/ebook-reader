export const DIRECT_PARSE_EXTENSIONS = ["epub", "txt", "text"] as const;

export const CONVERT_EXTENSIONS = [
  "mobi",
  "azw",
  "azw3",
  "azw4",
  "prc",
  "pdf",
] as const;

export const UPLOAD_EXTENSIONS = [
  ...DIRECT_PARSE_EXTENSIONS,
  ...CONVERT_EXTENSIONS,
] as const;

export type DirectParseExtension = (typeof DIRECT_PARSE_EXTENSIONS)[number];
export type ConvertExtension = (typeof CONVERT_EXTENSIONS)[number];
export type UploadExtension = (typeof UPLOAD_EXTENSIONS)[number];

const UPLOAD_ACCEPT = UPLOAD_EXTENSIONS.map((ext) => `.${ext}`).join(",");

export function getFileExtension(fileName: string): string | null {
  const ext = fileName.split(".").pop()?.toLowerCase();
  return ext || null;
}

export function isUploadExtension(ext: string): ext is UploadExtension {
  return (UPLOAD_EXTENSIONS as readonly string[]).includes(ext);
}

export function needsConversion(ext: string): ext is ConvertExtension {
  return (CONVERT_EXTENSIONS as readonly string[]).includes(ext);
}

export function getUploadAccept(): string {
  return UPLOAD_ACCEPT;
}
