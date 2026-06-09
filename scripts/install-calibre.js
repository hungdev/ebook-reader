const { existsSync, cpSync, mkdirSync } = require("fs");
const { join } = require("path");
const download = require("download");

const ROOT = join(__dirname, "..");
const BIN_DIR = join(ROOT, "lib/calibre/bin");
const EXTERNAL_BIN = join(ROOT, "../calibre-helper/bin");

function ebookConvertPath() {
  switch (process.platform) {
    case "darwin":
      return join(BIN_DIR, "Contents/MacOS/ebook-convert");
    case "linux":
      return join(BIN_DIR, "calibre/ebook-convert");
    default:
      return null;
  }
}

function externalEbookConvertPath() {
  switch (process.platform) {
    case "darwin":
      return join(EXTERNAL_BIN, "Contents/MacOS/ebook-convert");
    case "linux":
      return join(EXTERNAL_BIN, "calibre/ebook-convert");
    default:
      return null;
  }
}

function binaryUrl() {
  switch (process.platform) {
    case "darwin":
      return "https://dl.dropboxusercontent.com/s/xs42wrgyl5snzqq/Contents.zip?dl=0";
    case "linux":
      return "https://dl.dropboxusercontent.com/s/mkwju3sse01x44l/calibre.zip?dl=0";
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
}

async function main() {
  const target = ebookConvertPath();
  if (!target) {
    console.log(`[calibre] Bỏ qua — platform ${process.platform} chưa hỗ trợ`);
    return;
  }

  if (existsSync(target)) {
    console.log("[calibre] Binary đã có sẵn");
    return;
  }

  const externalTarget = externalEbookConvertPath();
  if (externalTarget && existsSync(externalTarget)) {
    mkdirSync(join(ROOT, "lib/calibre"), { recursive: true });
    cpSync(EXTERNAL_BIN, BIN_DIR, { recursive: true });
    console.log("[calibre] Đã copy từ ../calibre-helper/bin");
    return;
  }

  console.log("[calibre] Đang tải binary...");
  await download(binaryUrl(), BIN_DIR, { extract: true });
  console.log("[calibre] Tải xong");
}

main().catch((err) => {
  console.error("[calibre] Lỗi:", err.message);
  process.exit(1);
});
