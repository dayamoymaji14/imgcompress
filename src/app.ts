import { compressFile, resolveSupportedMimeType } from "./compressor";
import { downloadBlob, downloadZip } from "./downloader";
import type {
  BannerMessage,
  FileEntry,
  FileState,
  SummaryStats,
  ThemeMode
} from "./types";
import { createUi } from "./ui";

const MAX_FILES = 20;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const QUALITY_DEBOUNCE_MS = 280;
const THEME_STORAGE_KEY = "imgcompress-theme";

const state: FileState = new Map();

let quality = 80;
let theme = loadTheme();
let isProcessing = false;
let isPreparingZip = false;
let activeRunId = 0;
let banner: BannerMessage | null = null;
let qualityDebounceHandle: number | undefined;

const ui = createUi({
  onFilesSelected: handleFilesSelected,
  onQualityChange: handleQualityChange,
  onDownloadFile: handleDownloadFile,
  onRetryFile: handleRetryFile,
  onRemoveFile: handleRemoveFile,
  onDownloadAll: handleDownloadAll,
  onClearAll: handleClearAll,
  onThemeToggle: handleThemeToggle
});

render();

window.addEventListener("pagehide", () => {
  for (const entry of state.values()) {
    URL.revokeObjectURL(entry.previewUrl);
  }
});

function handleFilesSelected(files: File[]): void {
  if (files.length === 0) {
    return;
  }

  const messages: string[] = [];
  let acceptedCount = 0;

  for (const file of files) {
    if (state.size >= MAX_FILES) {
      messages.push(`Only ${MAX_FILES} files are allowed at once.`);
      break;
    }

    const supportedType = resolveSupportedMimeType(file);

    if (!supportedType) {
      messages.push(`"${file.name}" is not a supported PNG, JPEG, or WebP image.`);
      continue;
    }

    if (file.size > MAX_FILE_SIZE) {
      messages.push(`"${file.name}" exceeds the 10 MB size limit.`);
      continue;
    }

    const entry: FileEntry = {
      id: createEntryId(),
      file,
      supportedType,
      previewUrl: URL.createObjectURL(file),
      originalSize: file.size,
      status: "pending"
    };

    state.set(entry.id, entry);
    acceptedCount += 1;
  }

  banner = buildBanner(messages, acceptedCount);
  render();

  if (acceptedCount > 0) {
    scheduleProcessing(false);
  }
}

function handleQualityChange(value: number): void {
  quality = value;

  window.clearTimeout(qualityDebounceHandle);
  qualityDebounceHandle = window.setTimeout(() => {
    for (const entry of state.values()) {
      resetCompressionState(entry);
    }

    banner = null;
    render();
    scheduleProcessing(true);
  }, QUALITY_DEBOUNCE_MS);

  render();
}

function handleDownloadFile(id: string): void {
  const entry = state.get(id);

  if (!entry?.compressedBlob) {
    return;
  }

  downloadBlob(entry.compressedBlob, entry.file.name);
}

function handleRetryFile(id: string): void {
  const entry = state.get(id);

  if (!entry) {
    return;
  }

  resetCompressionState(entry);
  banner = null;
  render();
  scheduleProcessing(true);
}

function handleRemoveFile(id: string): void {
  const entry = state.get(id);

  if (!entry) {
    return;
  }

  revokePreview(entry);
  state.delete(id);

  if (state.size === 0) {
    banner = null;
  }

  render();
}

async function handleDownloadAll(): Promise<void> {
  if (isPreparingZip) {
    return;
  }

  const readyEntries = Array.from(state.values()).filter((entry) => entry.compressedBlob);

  if (readyEntries.length === 0) {
    return;
  }

  isPreparingZip = true;
  render();

  try {
    await downloadZip(readyEntries);
  } catch (error) {
    banner = {
      tone: "error",
      text: getErrorMessage(error)
    };
  } finally {
    isPreparingZip = false;
    render();
  }
}

function handleClearAll(): void {
  activeRunId += 1;
  window.clearTimeout(qualityDebounceHandle);

  for (const entry of state.values()) {
    revokePreview(entry);
  }

  state.clear();
  banner = null;
  isPreparingZip = false;
  render();
}

function handleThemeToggle(): void {
  theme = theme === "dark" ? "light" : "dark";

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage write failures and keep the in-memory theme.
  }

  render();
}

function scheduleProcessing(restartCurrentRun: boolean): void {
  if (restartCurrentRun || !isProcessing) {
    activeRunId += 1;
  }

  render();

  if (isProcessing) {
    return;
  }

  void processQueue(activeRunId);
}

async function processQueue(runId: number): Promise<void> {
  if (isProcessing) {
    return;
  }

  isProcessing = true;
  render();

  try {
    for (const entry of state.values()) {
      if (runId !== activeRunId) {
        break;
      }

      if (!isCurrentEntry(entry)) {
        continue;
      }

      if (!needsCompression(entry)) {
        continue;
      }

      entry.status = "compressing";
      entry.note = undefined;
      entry.errorMessage = undefined;
      render();

      await yieldToBrowser();

      const qualityForRun = quality;

      try {
        const result = await compressFile(entry.file, {
          quality: qualityForRun,
          mimeType: entry.supportedType
        });

        if (!isCurrentEntry(entry)) {
          continue;
        }

        if (runId !== activeRunId || qualityForRun !== quality) {
          entry.status = "pending";
          continue;
        }

        entry.status = "done";
        entry.compressedBlob = result.blob;
        entry.compressedSize = result.compressedSize;
        entry.reductionPercent = result.reductionPercent;
        entry.note = result.note ?? "Ready to download.";
        entry.errorMessage = undefined;
        entry.lastProcessedQuality = qualityForRun;
      } catch (error) {
        if (!isCurrentEntry(entry)) {
          continue;
        }

        if (runId !== activeRunId || qualityForRun !== quality) {
          entry.status = "pending";
          continue;
        }

        entry.status = "error";
        clearCompressionResult(entry);
        entry.note = undefined;
        entry.errorMessage = getErrorMessage(error);
        entry.lastProcessedQuality = qualityForRun;
      }

      render();
      await yieldToBrowser();
    }
  } finally {
    isProcessing = false;
    render();

    if (runId !== activeRunId || hasQueuedWork()) {
      void processQueue(activeRunId);
    }
  }
}

function needsCompression(entry: FileEntry): boolean {
  return entry.lastProcessedQuality !== quality || entry.status === "pending";
}

function hasQueuedWork(): boolean {
  for (const entry of state.values()) {
    if (needsCompression(entry) && entry.status !== "compressing") {
      return true;
    }
  }

  return false;
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(
        () => {
          resolve();
        },
        { timeout: 64 }
      );
      return;
    }

    globalThis.setTimeout(resolve, 0);
  });
}

function buildBanner(messages: string[], acceptedCount: number): BannerMessage | null {
  if (messages.length === 0) {
    return acceptedCount > 0
      ? {
          tone: "info",
          text: `${acceptedCount} file${acceptedCount === 1 ? "" : "s"} added to the queue.`
        }
      : null;
  }

  const tone = acceptedCount > 0 ? "warning" : "error";
  return {
    tone,
    text: messages.join(" ")
  };
}

function buildSummary(entries: FileEntry[]): SummaryStats {
  let readyCount = 0;
  let processedCount = 0;
  let processingCount = 0;
  let pendingCount = 0;
  let errorCount = 0;
  let savedBytes = 0;

  for (const entry of entries) {
    switch (entry.status) {
      case "done":
        readyCount += 1;
        processedCount += 1;
        break;
      case "compressing":
        processingCount += 1;
        break;
      case "pending":
        pendingCount += 1;
        break;
      case "error":
        errorCount += 1;
        processedCount += 1;
        break;
    }

    if (entry.compressedBlob && typeof entry.compressedSize === "number") {
      savedBytes += Math.max(entry.originalSize - entry.compressedSize, 0);
    }
  }

  return {
    totalCount: entries.length,
    readyCount,
    processedCount,
    processingCount,
    pendingCount,
    errorCount,
    savedBytes
  };
}

function render(): void {
  const entries = Array.from(state.values());
  const summary = buildSummary(entries);

  ui.render({
    entries,
    quality,
    theme,
    summary,
    isProcessing,
    isPreparingZip,
    banner,
    canDownloadAll: summary.readyCount > 0
  });
}

function loadTheme(): ThemeMode {
  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return storedTheme === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function createEntryId(): string {
  if ("randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `file-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Compression failed for this file.";
}

function resetCompressionState(entry: FileEntry): void {
  entry.status = "pending";
  entry.lastProcessedQuality = undefined;
  entry.note = undefined;
  entry.errorMessage = undefined;
  clearCompressionResult(entry);
}

function clearCompressionResult(entry: FileEntry): void {
  entry.compressedBlob = undefined;
  entry.compressedSize = undefined;
  entry.reductionPercent = undefined;
}

function revokePreview(entry: FileEntry): void {
  URL.revokeObjectURL(entry.previewUrl);
}

function isCurrentEntry(entry: FileEntry): boolean {
  return state.get(entry.id) === entry;
}
