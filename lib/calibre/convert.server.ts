import { execFile } from "child_process";
import { existsSync } from "fs";
import { platform } from "os";
import { join } from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const CALIBRE_ROOT = join(process.cwd(), "lib/calibre");

function getEbookConvertPath(): string {
  const plat = platform();

  if (plat === "darwin") {
    return join(CALIBRE_ROOT, "bin/Contents/MacOS/ebook-convert");
  }
  if (plat === "linux") {
    return join(CALIBRE_ROOT, "bin/calibre/ebook-convert");
  }

  throw new Error(`Hệ điều hành ${plat} chưa được hỗ trợ`);
}

export async function convertFileToEpub(
  inputPath: string,
  outputPath: string,
): Promise<string> {
  const binary = getEbookConvertPath();

  if (!existsSync(binary)) {
    throw new Error(
      "Calibre chưa được cài. Chạy: pnpm install (hoặc node scripts/install-calibre.js)",
    );
  }

  await execFileAsync(binary, [inputPath, outputPath], {
    env: {
      ...process.env,
      LANG: "C.UTF-8",
      LC_ALL: "C.UTF-8",
      LC_CTYPE: "C.UTF-8",
    },
  });
  return outputPath;
}
