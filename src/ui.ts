import type {
  BannerMessage,
  FileEntry,
  SummaryStats,
  UiActions,
  UiController,
  UiRenderState
} from "./types";

interface FileCardRefs {
  root: HTMLElement;
  image: HTMLImageElement;
  title: HTMLElement;
  meta: HTMLElement;
  badge: HTMLElement;
  original: HTMLElement;
  compressed: HTMLElement;
  reduction: HTMLElement;
  note: HTMLElement;
  downloadButton: HTMLButtonElement;
  retryButton: HTMLButtonElement;
  removeButton: HTMLButtonElement;
}

export function createUi(actions: UiActions): UiController {
  const dropzone = requireElement<HTMLElement>("dropzone");
  const fileInput = requireElement<HTMLInputElement>("file-input");
  const browseButton = requireElement<HTMLButtonElement>("browse-button");
  const viewQueueButton = requireElement<HTMLButtonElement>("view-queue");
  const overviewStatus = requireElement<HTMLElement>("overview-status");
  const uploadStatus = requireElement<HTMLElement>("upload-status");
  const uploadFeedback = requireElement<HTMLElement>("upload-feedback");
  const uploadFeedbackCount = requireElement<HTMLElement>("upload-feedback-count");
  const uploadPreviewStrip = requireElement<HTMLElement>("upload-preview-strip");
  const qualitySlider = requireElement<HTMLInputElement>("quality-slider");
  const qualityValue = requireElement<HTMLOutputElement>("quality-value");
  const downloadAllButton = requireElement<HTMLButtonElement>("download-all");
  const clearAllButton = requireElement<HTMLButtonElement>("clear-all");
  const progressText = requireElement<HTMLElement>("progress-text");
  const progressPercentValue = requireElement<HTMLElement>("progress-percent");
  const progressBar = requireElement<HTMLElement>("progress-bar");
  const progressFill = requireElement<HTMLElement>("progress-fill");
  const resultsGrid = requireElement<HTMLElement>("results-grid");
  const emptyState = requireElement<HTMLElement>("empty-state");
  const summaryCount = requireElement<HTMLElement>("summary-count");
  const summaryQueued = requireElement<HTMLElement>("summary-queued");
  const summaryReady = requireElement<HTMLElement>("summary-ready");
  const summaryIssues = requireElement<HTMLElement>("summary-issues");
  const summarySaved = requireElement<HTMLElement>("summary-saved");
  const summaryHint = requireElement<HTMLElement>("summary-hint");
  const processingNote = requireElement<HTMLElement>("processing-note");
  const messageRegion = requireElement<HTMLElement>("message-region");
  const themeToggle = requireElement<HTMLButtonElement>("theme-toggle");
  const resultsTitle = requireElement<HTMLElement>("results-title");
  const bannerNode = document.createElement("div");
  const cardsById = new Map<string, FileCardRefs>();
  const cardSignatures = new Map<string, string>();
  let previousEntryCount = 0;
  let pulseTimeout: number | undefined;

  bannerNode.className = "message-banner";

  const openFilePicker = (): void => {
    fileInput.click();
  };

  browseButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openFilePicker();
  });

  viewQueueButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    resultsTitle.scrollIntoView({ behavior: "smooth", block: "start" });
    resultsTitle.focus({ preventScroll: true });
  });

  dropzone.addEventListener("click", (event) => {
    const target = event.target;

    if (target instanceof HTMLElement && target.closest("button, input, a")) {
      return;
    }

    openFilePicker();
  });

  dropzone.addEventListener("keydown", (event) => {
    if (event.target !== dropzone) {
      return;
    }

    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    openFilePicker();
  });

  dropzone.addEventListener("dragenter", (event) => {
    event.preventDefault();
    dropzone.classList.add("is-over");
  });

  dropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropzone.classList.add("is-over");
  });

  dropzone.addEventListener("dragleave", (event) => {
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && dropzone.contains(relatedTarget)) {
      return;
    }

    dropzone.classList.remove("is-over");
  });

  dropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropzone.classList.remove("is-over");

    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length > 0) {
      actions.onFilesSelected(files);
    }
  });

  fileInput.addEventListener("change", () => {
    const files = Array.from(fileInput.files ?? []);
    fileInput.value = "";

    if (files.length > 0) {
      actions.onFilesSelected(files);
    }
  });

  qualitySlider.addEventListener("input", () => {
    const value = Number(qualitySlider.value);
    qualityValue.textContent = String(value);
    actions.onQualityChange(value);
  });

  themeToggle.addEventListener("click", () => {
    actions.onThemeToggle();
  });

  downloadAllButton.addEventListener("click", () => {
    actions.onDownloadAll();
  });

  clearAllButton.addEventListener("click", () => {
    actions.onClearAll();
  });

  resultsGrid.addEventListener("click", (event) => {
    const target = event.target;

    if (!(target instanceof HTMLElement)) {
      return;
    }

    const trigger = target.closest<HTMLButtonElement>("[data-file-action]");
    if (!trigger) {
      return;
    }

    const fileId = trigger.dataset.fileId;
    const action = trigger.dataset.fileAction;

    if (!fileId || !action) {
      return;
    }

    switch (action) {
      case "download":
        actions.onDownloadFile(fileId);
        break;
      case "retry":
        actions.onRetryFile(fileId);
        break;
      case "remove":
        actions.onRemoveFile(fileId);
        break;
      default:
        break;
    }
  });

  return {
    render(state: UiRenderState) {
      const progressValue = getProgressPercent(state.summary);
      const progressLabel = buildProgressText(state.summary, state.isPreparingZip);
      const hasEntries = state.entries.length > 0;
      const queuedCount = state.summary.pendingCount + state.summary.processingCount;

      document.documentElement.dataset.theme = state.theme;
      qualitySlider.value = String(state.quality);
      qualityValue.textContent = String(state.quality);
      qualitySlider.setAttribute("aria-valuetext", `${state.quality}% quality`);
      themeToggle.setAttribute("aria-pressed", String(state.theme === "dark"));
      themeToggle.setAttribute(
        "aria-label",
        state.theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
      );

      overviewStatus.textContent = buildOverviewStatusText(
        state.summary,
        state.isProcessing,
        state.isPreparingZip
      );
      summaryCount.textContent = String(state.summary.totalCount);
      summaryQueued.textContent = String(queuedCount);
      summaryReady.textContent = String(state.summary.readyCount);
      summaryIssues.textContent = String(state.summary.errorCount);
      summarySaved.textContent = formatBytes(state.summary.savedBytes);
      summaryHint.textContent = buildSummaryHint(state.summary, state.isProcessing, state.isPreparingZip);
      processingNote.textContent = buildProcessingCopy(
        state.summary,
        state.isProcessing,
        state.isPreparingZip
      );
      dropzone.classList.toggle("has-files", hasEntries);
      uploadStatus.textContent = buildUploadStatusText(
        state.summary,
        state.isProcessing,
        state.isPreparingZip
      );
      uploadFeedback.hidden = !hasEntries;
      viewQueueButton.hidden = !hasEntries;
      viewQueueButton.textContent = hasEntries
        ? `View Queue (${state.summary.totalCount})`
        : "View Queue";
      uploadFeedbackCount.textContent = buildUploadFeedbackCount(state.summary.totalCount);
      renderUploadPreview(uploadPreviewStrip, state.entries);

      progressText.textContent = progressLabel;
      progressPercentValue.textContent = `${progressValue}%`;
      progressBar.setAttribute("aria-valuenow", String(progressValue));
      progressBar.setAttribute("aria-valuetext", progressLabel);
      progressFill.style.width = `${progressValue}%`;

      resultsGrid.setAttribute("aria-busy", String(state.isProcessing || state.isPreparingZip));
      downloadAllButton.disabled = !state.canDownloadAll || state.isPreparingZip;
      downloadAllButton.textContent = state.isPreparingZip ? "Preparing ZIP..." : "Download ZIP";
      clearAllButton.disabled = state.entries.length === 0;

      renderBanner(messageRegion, bannerNode, state.banner);
      emptyState.classList.toggle("is-hidden", state.entries.length > 0);
      reconcileCards(resultsGrid, cardsById, cardSignatures, state.entries);

      if (state.entries.length > previousEntryCount) {
        dropzone.classList.add("has-new-files");
        globalThis.clearTimeout(pulseTimeout);
        pulseTimeout = globalThis.setTimeout(() => {
          dropzone.classList.remove("has-new-files");
        }, 1600);
      }

      if (!hasEntries) {
        dropzone.classList.remove("has-new-files");
      }

      previousEntryCount = state.entries.length;
    }
  };
}

function reconcileCards(
  resultsGrid: HTMLElement,
  cardsById: Map<string, FileCardRefs>,
  cardSignatures: Map<string, string>,
  entries: FileEntry[]
): void {
  const nextIds = new Set(entries.map((entry) => entry.id));

  for (const [id, refs] of cardsById) {
    if (nextIds.has(id)) {
      continue;
    }

    refs.root.remove();
    cardsById.delete(id);
    cardSignatures.delete(id);
  }

  entries.forEach((entry, index) => {
    const signature = createCardSignature(entry);
    let refs = cardsById.get(entry.id);

    if (!refs) {
      refs = createFileCard();
      cardsById.set(entry.id, refs);
      cardSignatures.set(entry.id, "");
    }

    if (cardSignatures.get(entry.id) !== signature) {
      updateFileCard(refs, entry);
      cardSignatures.set(entry.id, signature);
    }

    const referenceNode = resultsGrid.children.item(index);
    if (referenceNode !== refs.root) {
      resultsGrid.insertBefore(refs.root, referenceNode ?? null);
    }
  });
}

function createFileCard(): FileCardRefs {
  const root = document.createElement("article");
  root.className = "queue-item";
  root.setAttribute("role", "listitem");

  const media = document.createElement("div");
  media.className = "queue-item__thumb";
  const image = document.createElement("img");
  image.loading = "lazy";
  image.decoding = "async";
  media.append(image);

  const content = document.createElement("div");
  content.className = "queue-item__content";

  const header = document.createElement("div");
  header.className = "queue-item__header";

  const titleGroup = document.createElement("div");
  titleGroup.className = "queue-item__identity";
  const title = document.createElement("h3");
  title.className = "queue-item__title";
  const meta = document.createElement("p");
  meta.className = "queue-item__meta";
  titleGroup.append(title, meta);

  const badge = document.createElement("span");
  badge.className = "status-badge";

  header.append(titleGroup, badge);

  const stats = document.createElement("dl");
  stats.className = "queue-item__stats";

  const original = createStatBlock("Original");
  const compressed = createStatBlock("Compressed");
  const reduction = createStatBlock("Reduction");
  stats.append(original.container, compressed.container, reduction.container);

  const note = document.createElement("p");
  note.className = "queue-item__note";

  const actions = document.createElement("div");
  actions.className = "queue-item__actions";

  const downloadButton = createActionButton("Download", "button--secondary", "download");
  const retryButton = createActionButton("Retry", "button--ghost", "retry");
  const removeButton = createActionButton("Remove", "button--ghost button--danger", "remove");

  actions.append(downloadButton, retryButton, removeButton);
  content.append(header, stats, note);
  root.append(media, content, actions);

  return {
    root,
    image,
    title,
    meta,
    badge,
    original: original.value,
    compressed: compressed.value,
    reduction: reduction.value,
    note,
    downloadButton,
    retryButton,
    removeButton
  };
}

function createActionButton(
  label: string,
  variantClassName: string,
  action: string
): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = `button ${variantClassName}`;
  button.type = "button";
  button.dataset.fileAction = action;
  button.textContent = label;
  return button;
}

function createStatBlock(label: string): {
  container: HTMLElement;
  value: HTMLElement;
} {
  const container = document.createElement("div");
  container.className = "queue-item__stat";
  const term = document.createElement("dt");
  term.textContent = label;
  const value = document.createElement("dd");
  container.append(term, value);

  return {
    container,
    value
  };
}

function updateFileCard(refs: FileCardRefs, entry: FileEntry): void {
  const badgeLabel = formatStatusLabel(entry);
  const note = entry.errorMessage ?? entry.note ?? statusCopy(entry.status);
  const titleId = `file-title-${entry.id}`;
  const noteId = `file-note-${entry.id}`;
  const canDownload = Boolean(entry.compressedBlob);
  const showRetry = entry.status === "error";

  refs.root.dataset.status = entry.status;
  refs.root.setAttribute("aria-labelledby", titleId);
  refs.root.setAttribute("aria-describedby", noteId);

  if (refs.image.src !== entry.previewUrl) {
    refs.image.src = entry.previewUrl;
  }

  refs.image.alt = `Preview of ${entry.file.name}`;
  refs.title.id = titleId;
  refs.title.textContent = entry.file.name;
  refs.title.title = entry.file.name;
  refs.meta.textContent = formatTypeLabel(entry.supportedType);
  refs.badge.dataset.status = entry.status;
  refs.badge.textContent = badgeLabel;
  refs.original.textContent = formatBytes(entry.originalSize);
  refs.compressed.textContent =
    typeof entry.compressedSize === "number" ? formatBytes(entry.compressedSize) : "—";
  refs.reduction.textContent =
    typeof entry.reductionPercent === "number" ? `${entry.reductionPercent.toFixed(1)}%` : "—";
  refs.note.id = noteId;
  refs.note.textContent = note;

  refs.downloadButton.dataset.fileId = entry.id;
  refs.downloadButton.disabled = !canDownload;
  refs.downloadButton.setAttribute(
    "aria-label",
    `Download compressed ${entry.file.name}`
  );

  refs.retryButton.dataset.fileId = entry.id;
  refs.retryButton.hidden = !showRetry;
  refs.retryButton.setAttribute("aria-label", `Retry compression for ${entry.file.name}`);

  refs.removeButton.dataset.fileId = entry.id;
  refs.removeButton.setAttribute("aria-label", `Remove ${entry.file.name} from the queue`);
}

function renderBanner(
  messageRegion: HTMLElement,
  bannerNode: HTMLElement,
  banner: BannerMessage | null
): void {
  if (!banner) {
    messageRegion.classList.remove("is-visible");
    messageRegion.replaceChildren();
    return;
  }

  bannerNode.dataset.tone = banner.tone;
  bannerNode.setAttribute("role", banner.tone === "info" ? "status" : "alert");
  bannerNode.setAttribute("aria-live", banner.tone === "info" ? "polite" : "assertive");
  bannerNode.textContent = banner.text;
  messageRegion.classList.add("is-visible");
  messageRegion.replaceChildren(bannerNode);
}

function createCardSignature(entry: FileEntry): string {
  return [
    entry.status,
    entry.file.name,
    entry.supportedType,
    entry.originalSize,
    entry.compressedSize ?? "",
    entry.reductionPercent?.toFixed(2) ?? "",
    entry.note ?? "",
    entry.errorMessage ?? "",
    entry.lastProcessedQuality ?? "",
    entry.compressedBlob ? "ready" : "missing"
  ].join("|");
}

function renderUploadPreview(container: HTMLElement, entries: FileEntry[]): void {
  const previewEntries = entries.slice(-4).reverse();
  const extraCount = Math.max(entries.length - previewEntries.length, 0);
  const fragment = document.createDocumentFragment();

  for (const entry of previewEntries) {
    const preview = document.createElement("div");
    preview.className = "upload-preview";
    preview.title = entry.file.name;

    const image = document.createElement("img");
    image.src = entry.previewUrl;
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
    preview.append(image);
    fragment.append(preview);
  }

  if (extraCount > 0) {
    const more = document.createElement("div");
    more.className = "upload-preview upload-preview--count";
    more.textContent = `+${extraCount}`;
    fragment.append(more);
  }

  container.replaceChildren(fragment);
}

function buildProcessingCopy(
  summary: SummaryStats,
  isProcessing: boolean,
  isPreparingZip: boolean
): string {
  if (summary.totalCount === 0) {
    return "Waiting for uploads";
  }

  if (isPreparingZip) {
    return "Preparing ZIP download...";
  }

  if (isProcessing) {
    return `Processing ${summary.processedCount + summary.processingCount} of ${summary.totalCount} files`;
  }

  if (summary.errorCount > 0) {
    return `${summary.errorCount} file${summary.errorCount === 1 ? "" : "s"} need attention`;
  }

  if (summary.readyCount === summary.totalCount) {
    return "All files ready";
  }

  return `${summary.readyCount} ready`;
}

function buildUploadStatusText(
  summary: SummaryStats,
  isProcessing: boolean,
  isPreparingZip: boolean
): string {
  if (summary.totalCount === 0) {
    return "No images queued yet. Add up to 20 PNG, JPEG, or WebP files.";
  }

  if (isPreparingZip) {
    return `${summary.readyCount} ready for download. Packaging ZIP archive now.`;
  }

  if (isProcessing) {
    if (summary.processedCount === 0 && summary.processingCount > 0) {
      return `${summary.totalCount} file${
        summary.totalCount === 1 ? "" : "s"
      } added. Compression started immediately.`;
    }

    return `${summary.processedCount} processed, ${summary.processingCount} compressing, ${summary.pendingCount} waiting.`;
  }

  if (summary.errorCount > 0) {
    return `${summary.readyCount} ready and ${summary.errorCount} need attention. Use Retry or Remove on any failed file.`;
  }

  if (summary.readyCount === summary.totalCount) {
    return `All ${summary.totalCount} file${
      summary.totalCount === 1 ? "" : "s"
    } are ready. Review the queue or download the ZIP.`;
  }

  return `${summary.readyCount} of ${summary.totalCount} ready. Drag more images here or browse to add more.`;
}

function buildProgressText(summary: SummaryStats, isPreparingZip: boolean): string {
  if (summary.totalCount === 0) {
    return "No files in queue yet.";
  }

  if (isPreparingZip) {
    return `Preparing ZIP for ${summary.readyCount} file${summary.readyCount === 1 ? "" : "s"}.`;
  }

  if (summary.readyCount === summary.totalCount && summary.totalCount > 0) {
    return "All files processed. Review the queue or download the ZIP.";
  }

  return `${summary.processedCount} of ${summary.totalCount} processed`;
}

function getProgressPercent(summary: SummaryStats): number {
  if (summary.totalCount === 0) {
    return 0;
  }

  return Math.round((summary.processedCount / summary.totalCount) * 100);
}

function statusCopy(status: FileEntry["status"]): string {
  switch (status) {
    case "pending":
      return "Queued and waiting to be compressed.";
    case "compressing":
      return "Compression in progress.";
    case "done":
      return "Ready to download.";
    case "error":
      return "Compression failed.";
  }
}

function buildOverviewStatusText(
  summary: SummaryStats,
  isProcessing: boolean,
  isPreparingZip: boolean
): string {
  const queuedCount = summary.pendingCount + summary.processingCount;

  if (summary.totalCount === 0) {
    return "Add up to 20 images to begin. Files are processed locally in your browser.";
  }

  if (isPreparingZip) {
    return `Packaging ${summary.readyCount} ready file${
      summary.readyCount === 1 ? "" : "s"
    } into a ZIP archive.`;
  }

  if (isProcessing) {
    return `Compressing ${summary.processedCount + summary.processingCount} of ${
      summary.totalCount
    } files. You can keep adding more while the queue runs.`;
  }

  if (summary.errorCount > 0 && summary.readyCount > 0) {
    if (queuedCount > 0) {
      return `${summary.readyCount} ready, ${summary.errorCount} need attention, and ${queuedCount} still in queue.`;
    }

    return `${summary.readyCount} ready, but ${summary.errorCount} still need attention before the batch is fully complete.`;
  }

  if (summary.errorCount > 0) {
    return `${summary.errorCount} file${
      summary.errorCount === 1 ? "" : "s"
    } need attention. Retry or remove them from the queue.`;
  }

  if (summary.readyCount === summary.totalCount) {
    return `All ${summary.totalCount} file${
      summary.totalCount === 1 ? "" : "s"
    } are ready. Download individual files or export the full ZIP.`;
  }

  return `${summary.readyCount} ready and ${queuedCount} still in queue. Review progress in the results panel.`;
}

function buildSummaryHint(
  summary: SummaryStats,
  isProcessing: boolean,
  isPreparingZip: boolean
): string {
  if (summary.totalCount === 0) {
    return "Upload images to unlock live results and download actions here.";
  }

  if (isPreparingZip) {
    return "ZIP packaging runs in the browser. Your ready files stay available while it completes.";
  }

  if (summary.errorCount > 0) {
    return "Failed files stay in the queue until you retry or remove them.";
  }

  if (isProcessing) {
    return "Ready files can be downloaded immediately while the rest of the queue continues.";
  }

  if (summary.readyCount === summary.totalCount) {
    return "Everything is ready. Download one file at a time or export the full ZIP.";
  }

  return "Results update as soon as each image finishes processing.";
}

function buildUploadFeedbackCount(totalCount: number): string {
  if (totalCount === 0) {
    return "No files";
  }

  return `${totalCount} queued`;
}

function formatStatusLabel(entry: FileEntry): string {
  if (entry.status === "done" && entry.note === "Already optimized") {
    return "optimized";
  }

  switch (entry.status) {
    case "pending":
      return "queued";
    case "compressing":
      return "working";
    case "done":
      return "ready";
    case "error":
      return "error";
  }
}

function formatTypeLabel(type: FileEntry["supportedType"]): string {
  switch (type) {
    case "image/png":
      return "PNG";
    case "image/jpeg":
      return "JPEG";
    case "image/webp":
      return "WebP";
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);

  if (!element) {
    throw new Error(`Missing required element: ${id}`);
  }

  return element as T;
}
