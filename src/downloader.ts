import JSZip from "jszip";

import type { FileEntry } from "./types";

export function downloadBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 0);
}

export async function downloadZip(entries: FileEntry[]): Promise<void> {
  const zip = new JSZip();
  const usedNames = new Set<string>();

  for (const entry of entries) {
    if (!entry.compressedBlob) {
      continue;
    }

    const filename = getUniqueFilename(usedNames, entry.file.name);
    zip.file(filename, entry.compressedBlob);
  }

  const zipBlob = await zip.generateAsync({
    type: "blob",
    compression: "STORE"
  });

  downloadBlob(zipBlob, `imgcompress-${Date.now()}.zip`);
}

function getUniqueFilename(usedNames: Set<string>, filename: string): string {
  if (!usedNames.has(filename)) {
    usedNames.add(filename);
    return filename;
  }

  const extensionIndex = filename.lastIndexOf(".");
  const hasExtension = extensionIndex > 0;
  const baseName = hasExtension ? filename.slice(0, extensionIndex) : filename;
  const extension = hasExtension ? filename.slice(extensionIndex) : "";

  let counter = 2;
  let candidate = `${baseName} (${counter})${extension}`;

  while (usedNames.has(candidate)) {
    counter += 1;
    candidate = `${baseName} (${counter})${extension}`;
  }

  usedNames.add(candidate);
  return candidate;
}
