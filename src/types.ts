export type SupportedMimeType = "image/png" | "image/jpeg" | "image/webp";

export type FileStatus = "pending" | "compressing" | "done" | "error";

export type ThemeMode = "light" | "dark";

export type BannerTone = "info" | "warning" | "error";

export interface BannerMessage {
  tone: BannerTone;
  text: string;
}

export interface FileEntry {
  id: string;
  file: File;
  supportedType: SupportedMimeType;
  previewUrl: string;
  originalSize: number;
  status: FileStatus;
  compressedBlob?: Blob;
  compressedSize?: number;
  reductionPercent?: number;
  note?: string;
  errorMessage?: string;
  lastProcessedQuality?: number;
}

export type FileState = Map<string, FileEntry>;

export interface CompressionOptions {
  quality: number;
  mimeType: SupportedMimeType;
}

export interface CompressionResult {
  blob: Blob;
  compressedSize: number;
  reductionPercent: number;
  note?: string;
}

export interface SummaryStats {
  totalCount: number;
  readyCount: number;
  processedCount: number;
  processingCount: number;
  pendingCount: number;
  errorCount: number;
  savedBytes: number;
}

export interface UiActions {
  onFilesSelected: (files: File[]) => void;
  onQualityChange: (value: number) => void;
  onDownloadFile: (id: string) => void;
  onRetryFile: (id: string) => void;
  onRemoveFile: (id: string) => void;
  onDownloadAll: () => void;
  onClearAll: () => void;
  onThemeToggle: () => void;
}

export interface UiRenderState {
  entries: FileEntry[];
  quality: number;
  theme: ThemeMode;
  summary: SummaryStats;
  isProcessing: boolean;
  isPreparingZip: boolean;
  banner: BannerMessage | null;
  canDownloadAll: boolean;
}

export interface UiController {
  render: (state: UiRenderState) => void;
}
