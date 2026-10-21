import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  ArrowRight,
  AudioLines,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  CloudOff,
  FileImage,
  FilePlus2,
  FileText,
  FolderOpen,
  Github,
  HardDrive,
  Image as ImageIcon,
  Keyboard,
  Layers,
  LockKeyhole,
  LogIn,
  MoreHorizontal,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sliders,
  Sparkles,
  Trash2,
  Video,
  WandSparkles,
  X,
  Zap,
} from "lucide-react";

export type RecentItem = {
  path: string;
  name: string;
  kind: string;
  lastOpened: number;
  width?: number;
  height?: number;
  sizeBytes?: number;
  exists?: boolean;
};

export type ImageMetadata = {
  path: string;
  filename: string;
  format: string;
  width: u32;
  height: u32;
  file_size_bytes: number;
  has_alpha: boolean;
};

type u32 = number;

export type BatchItem = {
  id: string;
  path: string;
  name: string;
  extension: string;
  sizeBytes?: number;
  status: "pending" | "processing" | "success" | "failed" | "skipped";
  errorMessage?: string;
  outputSize?: number;
};

export type ProcessResult = {
  input_path: string;
  output_path: string;
  original_size_bytes: number;
  output_size_bytes: number;
  original_width: number;
  original_height: number;
  output_width: number;
  output_height: number;
  output_format: string;
  duration_ms: number;
};

const HISTORY_KEY = "zcloud-fileflow.recent.v1";
const supportedFormats = ["png", "jpg", "jpeg", "webp", "bmp"];

export function getFileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

export function getExtension(path: string): string {
  const name = getFileName(path);
  const index = name.lastIndexOf(".");
  return index > -1 ? name.slice(index + 1).toLowerCase() : "";
}

export function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null || isNaN(bytes)) return "--";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

export function loadRecent(): RecentItem[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is RecentItem =>
        item !== null &&
        typeof item === "object" &&
        typeof item.path === "string" &&
        typeof item.name === "string" &&
        typeof item.kind === "string" &&
        typeof item.lastOpened === "number",
    ).slice(0, 30);
  } catch {
    return [];
  }
}

export function prettyTime(timestamp: number): string {
  const delta = Math.max(0, Date.now() - timestamp);
  if (delta < 60_000) return "Just now";
  if (delta < 3_600_000) return Math.floor(delta / 60_000) + " min ago";
  if (delta < 86_400_000) return Math.floor(delta / 3_600_000) + " hr ago";
  return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function App() {
  const [recent, setRecent] = useState<RecentItem[]>(loadRecent);
  const [selectedPath, setSelectedPath] = useState("");
  const [format, setFormat] = useState("webp");
  const [busy, setBusy] = useState(false);
  const [activeNav, setActiveNav] = useState("Workspace");
  const [activeImageSubTab, setActiveImageSubTab] = useState<"single" | "batch">("single");
  const [toast, setToast] = useState("");
  const [showHistoryInfo, setShowHistoryInfo] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Resize & Compression State
  const [selectedMeta, setSelectedMeta] = useState<ImageMetadata | null>(null);
  const [resizeEnabled, setResizeEnabled] = useState(false);
  const [resizeWidth, setResizeWidth] = useState<string>("");
  const [resizeHeight, setResizeHeight] = useState<string>("");
  const [lockAspectRatio, setLockAspectRatio] = useState(true);
  const [resampleFilter, setResampleFilter] = useState("lanczos3");

  const [quality, setQuality] = useState(85);
  const webpLossless = true;
  const [pngCompression, setPngCompression] = useState("default");

  // Batch Mode State
  const [batchQueue, setBatchQueue] = useState<BatchItem[]>([]);
  const [batchOutputDir, setBatchOutputDir] = useState("");
  const [batchProgress, setBatchProgress] = useState<{ total: number; done: number; success: number; failed: number } | null>(null);
  const [batchCancelled, setBatchCancelled] = useState(false);
  const cancelBatchRef = useRef(false);

  // Recent History Search
  const [historySearch, setHistorySearch] = useState("");

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(recent));
    } catch {
      setToast("Recent list could not be saved. Check this app's local storage permissions.");
    }
  }, [recent]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Read metadata whenever a new single file is selected
  useEffect(() => {
    if (!selectedPath) {
      setSelectedMeta(null);
      return;
    }
    invoke<ImageMetadata>("get_image_metadata", { path: selectedPath })
      .then((meta) => {
        setSelectedMeta(meta);
        if (meta.width && meta.height) {
          setResizeWidth(meta.width.toString());
          setResizeHeight(meta.height.toString());
        }
      })
      .catch((err) => {
        console.warn("Could not read image metadata:", err);
        setSelectedMeta(null);
      });
  }, [selectedPath]);

  // Check file existence for recent items
  useEffect(() => {
    if (activeNav === "Recent projects") {
      recent.forEach((item) => {
        invoke<boolean>("check_file_exists", { path: item.path })
          .then((exists) => {
            setRecent((prev) =>
              prev.map((row) => (row.path === item.path ? { ...row, exists } : row)),
            );
          })
          .catch(() => {
            // In web testing mock, assume true
            setRecent((prev) =>
              prev.map((row) => (row.path === item.path ? { ...row, exists: true } : row)),
            );
          });
      });
    }
  }, [activeNav]);

  const selectedName = selectedPath ? getFileName(selectedPath) : "";
  const selectedExtension = selectedPath ? getExtension(selectedPath) : "";
  const recentCount = recent.length;
  const hasSelection = Boolean(selectedPath);
  const canConvert = hasSelection && supportedFormats.includes(selectedExtension);

  const currentFormatLabel = useMemo(() => format.toUpperCase(), [format]);

  function rememberPath(path: string, meta?: { width?: number; height?: number; sizeBytes?: number }) {
    const name = getFileName(path);
    const item: RecentItem = {
      path,
      name,
      kind: getExtension(path).toUpperCase() || "FILE",
      lastOpened: Date.now(),
      width: meta?.width,
      height: meta?.height,
      sizeBytes: meta?.sizeBytes,
      exists: true,
    };
    setRecent((existing) => [item, ...existing.filter((row) => row.path !== path)].slice(0, 30));
    setSelectedPath(path);
  }

  function handleResizeWidthChange(val: string) {
    setResizeWidth(val);
    const num = parseInt(val, 10);
    if (lockAspectRatio && selectedMeta && selectedMeta.width && selectedMeta.height && !isNaN(num) && num > 0) {
      const calcHeight = Math.round((selectedMeta.height / selectedMeta.width) * num);
      setResizeHeight(calcHeight.toString());
    }
  }

  function handleResizeHeightChange(val: string) {
    setResizeHeight(val);
    const num = parseInt(val, 10);
    if (lockAspectRatio && selectedMeta && selectedMeta.width && selectedMeta.height && !isNaN(num) && num > 0) {
      const calcWidth = Math.round((selectedMeta.width / selectedMeta.height) * num);
      setResizeWidth(calcWidth.toString());
    }
  }

  async function chooseFile() {
    try {
      const chosen = await open({
        multiple: false,
        directory: false,
        filters: [
          { name: "Supported images", extensions: ["png", "jpg", "jpeg", "webp", "bmp"] },
        ],
      });
      if (typeof chosen === "string") {
        rememberPath(chosen);
        setToast("File selected. Customize options or convert directly.");
      }
    } catch {
      setToast("File picker failed. Run Zcloud FileFlow as a desktop app and try again.");
    }
  }

  async function chooseBatchFiles() {
    try {
      const chosen = await open({
        multiple: true,
        directory: false,
        filters: [
          { name: "Supported images", extensions: ["png", "jpg", "jpeg", "webp", "bmp"] },
        ],
      });
      if (Array.isArray(chosen)) {
        addFilesToBatch(chosen);
      } else if (typeof chosen === "string") {
        addFilesToBatch([chosen]);
      }
    } catch {
      setToast("Batch picker failed.");
    }
  }

  async function chooseBatchOutputDir() {
    try {
      const chosen = await open({
        directory: true,
        multiple: false,
      });
      if (typeof chosen === "string") {
        setBatchOutputDir(chosen);
        setToast("Output folder set to " + chosen);
      }
    } catch {
      setToast("Folder picker failed.");
    }
  }

  function addFilesToBatch(paths: string[]) {
    const newItems: BatchItem[] = paths
      .filter((p) => supportedFormats.includes(getExtension(p)))
      .map((p) => ({
        id: Math.random().toString(36).substring(2, 9),
        path: p,
        name: getFileName(p),
        extension: getExtension(p),
        status: "pending",
      }));

    setBatchQueue((prev) => {
      const existingPaths = new Set(prev.map((i) => i.path));
      const filtered = newItems.filter((i) => !existingPaths.has(i.path));
      return [...prev, ...filtered];
    });

    setToast(`Added ${newItems.length} images to batch queue.`);
  }

  function removeBatchItem(id: string) {
    setBatchQueue((prev) => prev.filter((item) => item.id !== id));
  }

  function clearBatchQueue() {
    setBatchQueue([]);
    setBatchProgress(null);
  }

  async function convertSelected() {
    if (!selectedPath) {
      setToast("Choose an image first.");
      return;
    }
    if (!supportedFormats.includes(selectedExtension)) {
      setToast("This build converts PNG, JPG, WebP and BMP images only.");
      return;
    }

    const originalName = getFileName(selectedPath);
    const dot = originalName.lastIndexOf(".");
    const stem = dot > 0 ? originalName.slice(0, dot) : originalName;
    const targetExt = format.toLowerCase() === "jpeg" ? "jpg" : format.toLowerCase();

    try {
      const destination = await save({
        defaultPath: `${stem}.${targetExt}`,
        filters: [{ name: `${currentFormatLabel} image`, extensions: [targetExt] }],
      });
      if (!destination) return;

      let targetPath = destination;
      const currentExt = getExtension(destination).toLowerCase();
      if (currentExt !== targetExt && currentExt !== (targetExt === "jpg" ? "jpeg" : targetExt)) {
        if (!currentExt) {
          targetPath = `${destination}.${targetExt}`;
        } else {
          targetPath = `${destination.slice(0, destination.lastIndexOf("."))}.${targetExt}`;
        }
      }

      setBusy(true);

      const processOptions = {
        input_path: selectedPath,
        output_path: targetPath,
        output_format: format,
        resize: resizeEnabled
          ? {
              enabled: true,
              width: resizeWidth ? parseInt(resizeWidth, 10) : undefined,
              height: resizeHeight ? parseInt(resizeHeight, 10) : undefined,
              preserve_aspect_ratio: lockAspectRatio,
              filter: resampleFilter,
            }
          : undefined,
        compression: {
          quality,
          webp_lossless: webpLossless,
          png_compression: pngCompression,
        },
        overwrite: true,
      };

      const result = await invoke<ProcessResult>("process_image", { options: processOptions });

      const sizeDiff = result.original_size_bytes - result.output_size_bytes;
      const sizeNote =
        sizeDiff > 0
          ? ` (${((sizeDiff / result.original_size_bytes) * 100).toFixed(0)}% smaller)`
          : "";

      setToast(`Saved to ${getFileName(result.output_path)}${sizeNote}`);
      rememberPath(result.output_path, {
        width: result.output_width,
        height: result.output_height,
        sizeBytes: result.output_size_bytes,
      });
    } catch (error) {
      console.error("Image conversion failed:", error);
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : typeof (error as any)?.message === "string"
              ? (error as any).message
              : "Processing failed. Check input image and destination.";
      setToast(message);
    } finally {
      setBusy(false);
    }
  }

  async function startBatchProcessing() {
    if (batchQueue.length === 0) {
      setToast("Add images to the batch queue first.");
      return;
    }
    if (!batchOutputDir) {
      setToast("Please select an output destination folder.");
      return;
    }

    setBusy(true);
    cancelBatchRef.current = false;
    setBatchCancelled(false);
    setBatchProgress({ total: batchQueue.length, done: 0, success: 0, failed: 0 });

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < batchQueue.length; i++) {
      if (cancelBatchRef.current) {
        setBatchQueue((prev) =>
          prev.map((q, idx) =>
            idx >= i && (q.status === "pending" || q.status === "processing")
              ? { ...q, status: "skipped", errorMessage: "Batch stopped by user" }
              : q,
          ),
        );
        break;
      }

      const item = batchQueue[i];
      setBatchQueue((prev) =>
        prev.map((q, idx) => (idx === i ? { ...q, status: "processing" } : q)),
      );

      const dot = item.name.lastIndexOf(".");
      const stem = dot > 0 ? item.name.slice(0, dot) : item.name;
      const separator = batchOutputDir.includes("/") ? "/" : "\\";
      const targetExt = format.toLowerCase() === "jpeg" ? "jpg" : format.toLowerCase();
      const outPath = `${batchOutputDir}${separator}${stem}_converted.${targetExt}`;

      try {
        const processOptions = {
          input_path: item.path,
          output_path: outPath,
          output_format: format,
          resize: resizeEnabled
            ? {
                enabled: true,
                width: resizeWidth ? parseInt(resizeWidth, 10) : undefined,
                height: resizeHeight ? parseInt(resizeHeight, 10) : undefined,
                preserve_aspect_ratio: lockAspectRatio,
                filter: resampleFilter,
              }
            : undefined,
          compression: {
            quality,
            webp_lossless: webpLossless,
            png_compression: pngCompression,
          },
          overwrite: true,
        };

        const res = await invoke<ProcessResult>("process_image", { options: processOptions });
        successCount++;
        setBatchQueue((prev) =>
          prev.map((q, idx) =>
            idx === i ? { ...q, status: "success", outputSize: res.output_size_bytes } : q,
          ),
        );
      } catch (err) {
        failCount++;
        const msg =
          typeof err === "string"
            ? err
            : err instanceof Error
              ? err.message
              : typeof (err as any)?.message === "string"
                ? (err as any).message
                : "Failed to process";
        setBatchQueue((prev) =>
          prev.map((q, idx) =>
            idx === i ? { ...q, status: "failed", errorMessage: msg } : q,
          ),
        );
      }

      setBatchProgress({
        total: batchQueue.length,
        done: i + 1,
        success: successCount,
        failed: failCount,
      });
    }

    setBusy(false);
    if (cancelBatchRef.current) {
      setToast(
        `Batch stopped: ${successCount} completed, ${failCount} failed, ${batchQueue.length - (successCount + failCount)} skipped.`,
      );
    } else {
      setToast(`Batch complete: ${successCount} successful, ${failCount} failed.`);
    }
  }

  function openRecent(item: RecentItem) {
    setSelectedPath(item.path);
    setActiveNav("Image tools");
    setActiveImageSubTab("single");
    setToast("Loaded " + item.name);
  }

  function removeRecent(path: string) {
    setRecent((prev) => prev.filter((item) => item.path !== path));
    if (selectedPath === path) setSelectedPath("");
    setToast("Entry removed from local history.");
  }

  function clearHistory() {
    setRecent([]);
    setSelectedPath("");
    try {
      localStorage.removeItem(HISTORY_KEY);
      setToast("Recent history cleared from this device. Your original files were not deleted.");
    } catch {
      setToast("Could not clear recent history.");
    }
  }

  function connectGoogle() {
    setToast("Google sign-in is not configured in this first build. It needs an OAuth client ID and an internet connection; local tools will not require sign-in.");
  }

  // Drag and Drop
  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave() {
    setIsDragging(false);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    // In desktop webview, files may provide path
    const paths = files.map((f) => (f as unknown as { path?: string }).path || f.name);
    const imagePaths = paths.filter((p) => supportedFormats.includes(getExtension(p)));

    if (imagePaths.length === 1 && activeImageSubTab === "single") {
      rememberPath(imagePaths[0]);
      setToast("Loaded " + getFileName(imagePaths[0]));
    } else if (imagePaths.length > 0) {
      addFilesToBatch(imagePaths);
      setActiveNav("Image tools");
      setActiveImageSubTab("batch");
    } else {
      setToast("Unsupported file dropped. Please drop PNG, JPG, WebP, or BMP images.");
    }
  }

  const sidebarLinks = [
    { label: "Workspace", icon: HardDrive },
    { label: "Image tools", icon: ImageIcon, badge: "V1 READY" },
    { label: "PDF tools", icon: FileText, tag: "PHASE 2" },
    { label: "Audio", icon: AudioLines, tag: "PHASE 3" },
    { label: "Video", icon: Video, tag: "PHASE 3" },
  ];

  const filteredHistory = recent.filter(
    (item) =>
      item.name.toLowerCase().includes(historySearch.toLowerCase()) ||
      item.path.toLowerCase().includes(historySearch.toLowerCase()),
  );

  return (
    <div
      className="app-shell"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">
            <span>Z</span>
            <i />
          </div>
          <div className="brand-copy">
            <strong>
              Zcloud <span>FileFlow</span>
            </strong>
            <small>LOCAL FILE WORKSPACE</small>
          </div>
        </div>

        <button className="new-project-button" onClick={chooseFile} title="Open an image file (Enter)">
          <FilePlus2 size={17} strokeWidth={1.9} />
          <span>Open a file</span>
          <span className="shortcut">↵</span>
        </button>

        <div className="nav-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          {sidebarLinks.map(({ label, icon: Icon, badge, tag }) => (
            <button
              key={label}
              className={"nav-item " + (activeNav === label ? "active" : "")}
              onClick={() => {
                setActiveNav(label);
                if (label !== "Workspace" && label !== "Image tools") {
                  const name = label.endsWith("tools") ? label : label + " tools";
                  setToast(`${name} are planned for a later build. Nothing was uploaded.`);
                }
              }}
            >
              <Icon size={17} strokeWidth={1.8} />
              <span>{label}</span>
              {label === "Workspace" && <span className="nav-dot" />}
              {badge && <span className="nav-mini-tag">{badge}</span>}
              {tag && <span className="soon-tag">{tag}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-divider" />
        <div className="nav-label">YOUR SPACE</div>
        <button
          className={"nav-item " + (activeNav === "Recent projects" ? "active" : "")}
          onClick={() => setActiveNav("Recent projects")}
        >
          <Clock3 size={17} strokeWidth={1.8} />
          <span>Recent projects</span>
          <span className="nav-count">{recentCount}</span>
        </button>
        <button
          className="nav-item"
          onClick={() =>
            setToast("Global keyboard shortcuts and radial productivity menu are slated for Phase 2.")
          }
        >
          <Keyboard size={17} strokeWidth={1.8} />
          <span>Quick actions</span>
          <span className="soon-tag">SOON</span>
        </button>

        <div className="sidebar-spacer" />
        <div className="privacy-mini-card">
          <div className="privacy-icon">
            <ShieldCheck size={17} />
          </div>
          <div>
            <strong>Your files stay yours.</strong>
            <p>Local processing. No file uploads. No telemetry.</p>
          </div>
        </div>
        <button
          className={"nav-item settings-link " + (activeNav === "Settings" ? "active" : "")}
          onClick={() => setActiveNav("Settings")}
        >
          <Settings2 size={17} strokeWidth={1.8} />
          <span>Settings & Privacy</span>
        </button>
        <div className="sidebar-footer">
          <span className="version-dot" /> <span>v0.1.0 Phase 1</span>
          <a
            href="https://github.com/Shameer28tm/zcloud-fileflow"
            target="_blank"
            rel="noreferrer"
            aria-label="Open GitHub repository"
          >
            <Github size={15} />
          </a>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Workspace</span>
            <span className="crumb-slash">/</span>
            <strong>{activeNav}</strong>
          </div>
          <div className="topbar-actions">
            <div className="connection-status">
              <span className="green-dot" /> Ready offline
            </div>
            <button className="google-button" onClick={connectGoogle} title="Google OAuth status">
              <LogIn size={15} /> <span>Connect Google</span>
            </button>
            <button
              className="icon-button"
              aria-label="Help"
              onClick={() =>
                setToast(
                  "All file processing is 100% offline and runs on-device. Google sign-in is optional and not configured yet.",
                )
              }
            >
              <CircleHelp size={17} />
            </button>
          </div>
        </header>

        <div className="content-area">
          {/* TAB: WORKSPACE */}
          {activeNav === "Workspace" && (
            <>
              <section className="welcome-row">
                <div>
                  <div className="eyebrow">
                    <span className="eyebrow-line" /> YOUR DESKTOP, IN FLOW
                  </div>
                  <h1>
                    Good work starts
                    <br />
                    <span>with less friction.</span>
                  </h1>
                  <p className="welcome-description">
                    Your everyday file tools, in one quiet workspace.
                    <br />
                    Private by default. Ready when your internet isn't.
                  </p>
                </div>
                <div className="welcome-art" aria-hidden="true">
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <div className="art-core">
                    <Zap size={35} strokeWidth={1.25} />
                  </div>
                  <div className="art-float art-file">
                    <FileImage size={19} />
                    <span>PNG</span>
                  </div>
                  <div className="art-float art-lock">
                    <LockKeyhole size={17} />
                  </div>
                  <div className="art-spark spark-one" />
                  <div className="art-spark spark-two" />
                </div>
              </section>

              <section className="status-strip" aria-label="Privacy status">
                <div className="status-item">
                  <span className="status-icon">
                    <CloudOff size={16} />
                  </span>
                  <span>
                    <strong>Offline ready</strong>
                    <small>Core image conversion runs on-device</small>
                  </span>
                </div>
                <div className="status-item">
                  <span className="status-icon">
                    <LockKeyhole size={16} />
                  </span>
                  <span>
                    <strong>No file uploads</strong>
                    <small>Your image never leaves your PC</small>
                  </span>
                </div>
                <div className="status-item">
                  <span className="status-icon">
                    <HardDrive size={16} />
                  </span>
                  <span>
                    <strong>Local history</strong>
                    <small>Clear it whenever you need</small>
                  </span>
                </div>
              </section>

              <div className="section-heading">
                <div>
                  <h2>Workspace Overview</h2>
                  <p>Pick up where you left off, or start something new.</p>
                </div>
                <button className="text-button" onClick={() => setShowHistoryInfo((v) => !v)}>
                  <LockKeyhole size={14} /> Data & privacy <ArrowRight size={14} />
                </button>
              </div>

              {showHistoryInfo && (
                <div className="history-info">
                  <ShieldCheck size={18} />
                  <div>
                    <strong>What gets saved on this PC?</strong>
                    <p>
                      Recent history stores file paths, names, formats and last-opened times in this
                      app's local WebView storage. File contents are not copied into history or sent
                      to a server. Use “Clear history” to remove this list. Your original and
                      converted files remain wherever you saved them.
                    </p>
                  </div>
                  <button aria-label="Close privacy details" onClick={() => setShowHistoryInfo(false)}>
                    <X size={16} />
                  </button>
                </div>
              )}

              <section className="tool-grid">
                <article className="tool-card image-card">
                  <div className="tool-card-top">
                    <div className="tool-icon image-tool-icon">
                      <ImageIcon size={19} />
                    </div>
                    <span className="tool-chip available">
                      <span /> AVAILABLE NOW
                    </span>
                  </div>
                  <h3>Image Studio</h3>
                  <p>Convert, resize, compress, and batch process without sending data away.</p>
                  <div className="format-row">
                    <span>PNG</span>
                    <ArrowRight size={13} />
                    <span>JPG</span>
                    <ArrowRight size={13} />
                    <span>WEBP</span>
                    <ArrowRight size={13} />
                    <span>BMP</span>
                  </div>
                  <button
                    className="card-action primary-action"
                    onClick={() => {
                      setActiveNav("Image tools");
                      setActiveImageSubTab("single");
                    }}
                  >
                    Open Image Tools <ArrowRight size={15} />
                  </button>
                </article>

                <article className="tool-card muted-card">
                  <div className="tool-card-top">
                    <div className="tool-icon pdf-tool-icon">
                      <FileText size={19} />
                    </div>
                    <span className="tool-chip planned">PHASE 2</span>
                  </div>
                  <h3>PDF toolkit</h3>
                  <p>Merge, split, reorder and export pages. All local, all under your control.</p>
                  <div className="feature-pills">
                    <span>Merge</span>
                    <span>Split</span>
                    <span>Export pages</span>
                  </div>
                  <button
                    className="card-action muted-action"
                    onClick={() =>
                      setToast("PDF tools are planned for Phase 2; not implemented in this build.")
                    }
                  >
                    Coming next <ArrowRight size={15} />
                  </button>
                </article>

                <article className="tool-card muted-card">
                  <div className="tool-card-top">
                    <div className="tool-icon media-tool-icon">
                      <AudioLines size={19} />
                    </div>
                    <span className="tool-chip planned">PHASE 3</span>
                  </div>
                  <h3>Audio & video</h3>
                  <p>Convert, trim and export media with processing handled on your device.</p>
                  <div className="feature-pills">
                    <span>MP3 / WAV</span>
                    <span>MP4 / MOV</span>
                  </div>
                  <button
                    className="card-action muted-action"
                    onClick={() =>
                      setToast("Audio/video tools are planned for a later milestone.")
                    }
                  >
                    Coming next <ArrowRight size={15} />
                  </button>
                </article>
              </section>

              <section className="converter-panel">
                <div className="converter-heading">
                  <div className="converter-icon">
                    <WandSparkles size={18} />
                  </div>
                  <div>
                    <h2>Quick convert</h2>
                    <p>Choose a source image and an output format.</p>
                  </div>
                  <span className="local-badge">
                    <span /> LOCAL ENGINE
                  </span>
                </div>
                <div className="converter-controls">
                  <button
                    className={"file-select " + (hasSelection ? "has-file" : "")}
                    onClick={chooseFile}
                  >
                    <span className="file-select-icon">
                      <FolderOpen size={18} />
                    </span>
                    <span className="file-select-copy">
                      <strong>{hasSelection ? selectedName : "Choose source image"}</strong>
                      <small>
                        {hasSelection
                          ? selectedExtension.toUpperCase() + " · " + selectedPath
                          : "PNG, JPG, WebP or BMP"}
                      </small>
                    </span>
                    <MoreHorizontal size={18} className="more-icon" />
                  </button>
                  <div className="conversion-arrow">
                    <ArrowRight size={17} />
                  </div>
                  <label className="format-select">
                    <span>Convert to</span>
                    <select value={format} onChange={(event) => setFormat(event.target.value)}>
                      <option value="webp">WebP</option>
                      <option value="png">PNG</option>
                      <option value="jpg">JPG</option>
                      <option value="bmp">BMP</option>
                    </select>
                    <ChevronDown size={14} />
                  </label>
                  <button
                    className="convert-button"
                    onClick={convertSelected}
                    disabled={!canConvert || busy}
                  >
                    {busy ? <RefreshCw size={16} className="spin" /> : <Sparkles size={16} />}
                    <span>{busy ? "Converting..." : "Convert image"}</span>
                  </button>
                </div>
                <div className="converter-footnote">
                  <LockKeyhole size={12} />
                  <span>Runs locally on your PC. Output is saved only where you choose.</span>
                  <span className="footnote-separator">·</span>
                  <span>No cloud upload</span>
                </div>
              </section>

              <section className="recent-section">
                <div className="recent-heading">
                  <div>
                    <h2>
                      Recent projects <span className="count-pill">{recentCount}</span>
                    </h2>
                    <p>Stored locally on this device, never synced.</p>
                  </div>
                  <div className="recent-actions">
                    <button
                      className="subtle-icon-button"
                      title="Refresh view"
                      onClick={() => setRecent(loadRecent())}
                    >
                      <RefreshCw size={14} />
                    </button>
                    {recentCount > 0 && (
                      <button className="clear-history" onClick={clearHistory}>
                        <Trash2 size={13} /> Clear history
                      </button>
                    )}
                  </div>
                </div>
                {recent.length === 0 ? (
                  <div className="empty-recent">
                    <div className="empty-icon">
                      <Clock3 size={18} />
                    </div>
                    <div>
                      <strong>Your recent work will appear here</strong>
                      <p>
                        Choose a file to begin. Only its local path and basic details are kept for
                        your recent list.
                      </p>
                    </div>
                    <button onClick={chooseFile}>
                      Open first file <ArrowRight size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="recent-list">
                    {recent.slice(0, 5).map((item) => (
                      <div className="recent-row" key={item.path}>
                        <div className="recent-file-icon">
                          <FileImage size={17} />
                        </div>
                        <button className="recent-name" onClick={() => openRecent(item)}>
                          <strong>{item.name}</strong>
                          <small>
                            {item.kind} · {item.path}
                          </small>
                        </button>
                        <span className="recent-time">{prettyTime(item.lastOpened)}</span>
                        <button
                          className="recent-open"
                          onClick={() => openRecent(item)}
                          aria-label={"Load " + item.name}
                        >
                          <ArrowRight size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

          {/* TAB: IMAGE TOOLS */}
          {activeNav === "Image tools" && (
            <div>
              <div className="view-tabs">
                <button
                  className={"tab-button " + (activeImageSubTab === "single" ? "active" : "")}
                  onClick={() => setActiveImageSubTab("single")}
                >
                  <FileImage size={15} /> Single Image Studio
                </button>
                <button
                  className={"tab-button " + (activeImageSubTab === "batch" ? "active" : "")}
                  onClick={() => setActiveImageSubTab("batch")}
                >
                  <Layers size={15} /> Batch Processing ({batchQueue.length})
                </button>
              </div>

              {/* SINGLE IMAGE MODE */}
              {activeImageSubTab === "single" && (
                <div>
                  <div
                    className={"drop-zone " + (isDragging ? "dragging" : "")}
                    onClick={chooseFile}
                  >
                    <div className="drop-zone-icon">
                      <FolderOpen size={24} />
                    </div>
                    <h3>
                      {hasSelection ? selectedName : "Drop an image here or click to browse"}
                    </h3>
                    <p>
                      {hasSelection
                        ? `${selectedPath} (${selectedMeta?.width || "?"} × ${selectedMeta?.height || "?"}px, ${formatBytes(selectedMeta?.file_size_bytes)})`
                        : "Supports PNG, JPG, WebP, and BMP · 100% on-device processing"}
                    </p>
                  </div>

                  <div className="section-card">
                    <div className="card-header">
                      <h3>
                        <Sliders size={16} /> Target Format & Compression
                      </h3>
                      <span className="local-badge">
                        <span /> ZERO DATA LEAKAGE
                      </span>
                    </div>

                    <div className="form-grid">
                      <div className="form-field">
                        <label>Target Format</label>
                        <select
                          value={format}
                          onChange={(e) => setFormat(e.target.value)}
                        >
                          <option value="webp">WebP (Modern, high ratio)</option>
                          <option value="png">PNG (Lossless with alpha)</option>
                          <option value="jpg">JPG (Universal photos)</option>
                          <option value="bmp">BMP (Raw uncompressed)</option>
                        </select>
                      </div>

                      {format === "jpg" && (
                        <div className="form-field">
                          <label>
                            JPEG Quality: <span>{quality}%</span>
                          </label>
                          <input
                            type="range"
                            min="10"
                            max="100"
                            value={quality}
                            onChange={(e) => setQuality(parseInt(e.target.value, 10))}
                          />
                          <span className="field-hint">
                            Lower = smaller file size; Higher = crisper image
                          </span>
                        </div>
                      )}

                      {format === "webp" && (
                        <div className="form-field" style={{ justifyContent: "center" }}>
                          <span className="field-hint" style={{ color: "#8aa0bd" }}>
                            WebP Encoding: Pure Rust lossless VP8L compression (high fidelity, compact file size)
                          </span>
                        </div>
                      )}

                      {format === "png" && (
                        <div className="form-field">
                          <label>PNG Compression Strategy</label>
                          <select
                            value={pngCompression}
                            onChange={(e) => setPngCompression(e.target.value)}
                          >
                            <option value="default">Default Balance</option>
                            <option value="fast">Fast (Lower CPU)</option>
                            <option value="best">Best Compression (Smallest)</option>
                          </select>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="section-card">
                    <div className="card-header">
                      <h3>
                        <WandSparkles size={16} /> Dimension Resizing
                      </h3>
                      <label className="toggle-group">
                        <input
                          type="checkbox"
                          checked={resizeEnabled}
                          onChange={(e) => setResizeEnabled(e.target.checked)}
                        />
                        <span>Enable Resizing</span>
                      </label>
                    </div>

                    {resizeEnabled && (
                      <div className="form-grid">
                        <div className="form-field">
                          <label>Width (px)</label>
                          <input
                            type="number"
                            min="1"
                            max="16384"
                            value={resizeWidth}
                            onChange={(e) => handleResizeWidthChange(e.target.value)}
                            placeholder="e.g. 1920"
                          />
                        </div>

                        <div className="form-field">
                          <label>Height (px)</label>
                          <input
                            type="number"
                            min="1"
                            max="16384"
                            value={resizeHeight}
                            onChange={(e) => handleResizeHeightChange(e.target.value)}
                            placeholder="e.g. 1080"
                          />
                        </div>

                        <div className="form-field">
                          <label>Resampling Algorithm</label>
                          <select
                            value={resampleFilter}
                            onChange={(e) => setResampleFilter(e.target.value)}
                          >
                            <option value="lanczos3">Lanczos3 (High Quality)</option>
                            <option value="triangle">Bilinear / Triangle</option>
                            <option value="nearest">Nearest Neighbor (Pixel Art)</option>
                          </select>
                        </div>

                        <div className="form-field" style={{ justifyContent: "center" }}>
                          <label className="toggle-group">
                            <input
                              type="checkbox"
                              checked={lockAspectRatio}
                              onChange={(e) => setLockAspectRatio(e.target.checked)}
                            />
                            <span>Lock Aspect Ratio</span>
                          </label>
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    className="convert-button"
                    style={{ width: "100%", height: 50, fontSize: 13 }}
                    onClick={convertSelected}
                    disabled={!canConvert || busy}
                  >
                    {busy ? <RefreshCw size={17} className="spin" /> : <Sparkles size={17} />}
                    <span>{busy ? "Processing Image..." : `Convert to ${currentFormatLabel}`}</span>
                  </button>
                </div>
              )}

              {/* BATCH PROCESSING MODE */}
              {activeImageSubTab === "batch" && (
                <div>
                  <div className="section-card">
                    <div className="card-header">
                      <h3>
                        <Layers size={16} /> Batch Conversion Queue
                      </h3>
                      <div style={{ display: "flex", gap: 10 }}>
                        <button className="text-button" onClick={chooseBatchFiles}>
                          <FilePlus2 size={14} /> Add Images
                        </button>
                        {batchQueue.length > 0 && (
                          <button
                            className="text-button"
                            style={{ color: "#ff8888" }}
                            onClick={clearBatchQueue}
                          >
                            <Trash2 size={14} /> Clear Queue
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="form-grid">
                      <div className="form-field">
                        <label>Output Destination Folder</label>
                        <div style={{ display: "flex", gap: 8 }}>
                          <input
                            type="text"
                            readOnly
                            value={batchOutputDir}
                            placeholder="Select target folder..."
                            style={{ flex: 1 }}
                          />
                          <button className="primary-action" style={{ width: 110 }} onClick={chooseBatchOutputDir}>
                            Browse...
                          </button>
                        </div>
                      </div>

                      <div className="form-field">
                        <label>Convert All To</label>
                        <select value={format} onChange={(e) => setFormat(e.target.value)}>
                          <option value="webp">WebP</option>
                          <option value="png">PNG</option>
                          <option value="jpg">JPG</option>
                          <option value="bmp">BMP</option>
                        </select>
                      </div>

                      {format === "jpg" && (
                        <div className="form-field">
                          <label>JPEG Quality: {quality}%</label>
                          <input
                            type="range"
                            min="10"
                            max="100"
                            value={quality}
                            onChange={(e) => setQuality(parseInt(e.target.value, 10))}
                          />
                        </div>
                      )}

                      {format === "webp" && (
                        <div className="form-field" style={{ justifyContent: "center" }}>
                          <span className="field-hint" style={{ color: "#8aa0bd" }}>
                            WebP: Pure Rust lossless VP8L compression
                          </span>
                        </div>
                      )}
                    </div>

                    {batchProgress && (
                      <div style={{ marginTop: 16 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#8aa0bd" }}>
                          <span>
                            Progress: {batchProgress.done} / {batchProgress.total} completed
                          </span>
                          <span>
                            {batchProgress.success} succeeded, {batchProgress.failed} failed
                          </span>
                        </div>
                        <div className="progress-bar-container">
                          <div
                            className="progress-bar-fill"
                            style={{
                              width: `${(batchProgress.done / batchProgress.total) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {batchQueue.length === 0 ? (
                      <div
                        className="empty-recent"
                        style={{ marginTop: 18, cursor: "pointer" }}
                        onClick={chooseBatchFiles}
                      >
                        <div className="empty-icon">
                          <Layers size={18} />
                        </div>
                        <div>
                          <strong>No images in batch queue</strong>
                          <p>Click here or drop multiple files to batch process images.</p>
                        </div>
                        <button onClick={chooseBatchFiles}>Select Files</button>
                      </div>
                    ) : (
                      <table className="batch-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>FILE</th>
                            <th>SOURCE</th>
                            <th>STATUS</th>
                            <th>ACTIONS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {batchQueue.map((item, idx) => (
                            <tr key={item.id}>
                              <td>{idx + 1}</td>
                              <td>
                                <strong>{item.name}</strong>
                              </td>
                              <td style={{ color: "#77879e", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {item.path}
                              </td>
                              <td>
                                <span className={"badge-status " + item.status}>
                                  {item.status.toUpperCase()}
                                </span>
                                {item.errorMessage && (
                                  <small style={{ display: "block", color: "#ff8888", fontSize: 8 }}>
                                    {item.errorMessage}
                                  </small>
                                )}
                              </td>
                              <td>
                                <button
                                  className="remove-btn"
                                  onClick={() => removeBatchItem(item.id)}
                                  aria-label="Remove item"
                                >
                                  <X size={13} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 12 }}>
                    <button
                      className="convert-button"
                      style={{ flex: 1, height: 48, fontSize: 12 }}
                      onClick={startBatchProcessing}
                      disabled={batchQueue.length === 0 || busy || !batchOutputDir}
                    >
                      {busy ? <RefreshCw size={16} className="spin" /> : <Sparkles size={16} />}
                      <span>{busy ? "Processing Batch..." : `Process ${batchQueue.length} Images`}</span>
                    </button>
                    {busy && (
                      <button
                        className="primary-action"
                        disabled={batchCancelled}
                        style={{
                          width: 140,
                          background: "rgba(220, 60, 60, .2)",
                          color: "#ff9090",
                          borderColor: "#ff6060",
                          opacity: batchCancelled ? 0.6 : 1,
                        }}
                        onClick={() => {
                          cancelBatchRef.current = true;
                          setBatchCancelled(true);
                          setToast("Stopping batch queue after active file...");
                        }}
                      >
                        {batchCancelled ? "Stopping..." : "Stop Batch"}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB: RECENT PROJECTS */}
          {activeNav === "Recent projects" && (
            <div>
              <div className="section-card">
                <div className="card-header">
                  <div>
                    <h2>
                      Recent Projects & Files <span className="count-pill">{recentCount}</span>
                    </h2>
                    <p style={{ marginTop: 4, color: "#77879d", fontSize: 10 }}>
                      Metadata is stored on this device in WebView storage. Files remain in your original folders.
                    </p>
                  </div>
                  {recentCount > 0 && (
                    <button className="clear-history" onClick={clearHistory}>
                      <Trash2 size={13} /> Clear all history
                    </button>
                  )}
                </div>

                <div style={{ marginBottom: 16 }}>
                  <div style={{ position: "relative" }}>
                    <input
                      type="text"
                      placeholder="Search recent files by name or path..."
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      style={{
                        width: "100%",
                        height: 38,
                        padding: "0 12px 0 34px",
                        border: "1px solid var(--line-strong)",
                        borderRadius: 6,
                        background: "rgba(6, 11, 19, .5)",
                        color: "#e1ebf9",
                        fontSize: 11,
                      }}
                    />
                    <Search
                      size={14}
                      style={{ position: "absolute", left: 11, top: 12, color: "#6e809b" }}
                    />
                  </div>
                </div>

                {filteredHistory.length === 0 ? (
                  <div className="empty-recent">
                    <div className="empty-icon">
                      <Clock3 size={18} />
                    </div>
                    <div>
                      <strong>No matching history records found</strong>
                      <p>Try a different search query or open an image to start recording history.</p>
                    </div>
                  </div>
                ) : (
                  <table className="batch-table">
                    <thead>
                      <tr>
                        <th>NAME</th>
                        <th>KIND</th>
                        <th>LAST ACCESSED</th>
                        <th>FILE STATUS</th>
                        <th>ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredHistory.map((item) => (
                        <tr key={item.path}>
                          <td>
                            <strong>{item.name}</strong>
                            <small style={{ display: "block", color: "#6f7f96", fontSize: 8 }}>
                              {item.path}
                            </small>
                          </td>
                          <td>
                            <span className="count-pill">{item.kind}</span>
                          </td>
                          <td style={{ color: "#77879e", font: "9px Consolas, monospace" }}>
                            {prettyTime(item.lastOpened)}
                          </td>
                          <td>
                            {item.exists === false ? (
                              <span className="badge-missing">MOVED / MISSING</span>
                            ) : (
                              <span className="badge-verified">ON DISK</span>
                            )}
                          </td>
                          <td style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <button
                              className="text-button"
                              onClick={() => openRecent(item)}
                              title="Open file in studio"
                            >
                              Load <ArrowRight size={12} />
                            </button>
                            <button
                              className="remove-btn"
                              onClick={() => removeRecent(item.path)}
                              title="Remove from history"
                            >
                              <X size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* TAB: SETTINGS & PRIVACY */}
          {activeNav === "Settings" && (
            <div>
              <div className="section-card">
                <div className="card-header">
                  <h3>
                    <ShieldCheck size={16} /> Privacy Architecture & Storage Transparency
                  </h3>
                </div>
                <div style={{ color: "#8a9bb2", fontSize: 11, lineHeight: 1.8 }}>
                  <p>
                    Zcloud FileFlow is strictly local-first. We believe professional desktop tools
                    should work silently without forcing accounts, cloud sync, or telemetry.
                  </p>
                  <ul style={{ paddingLeft: 18, margin: "10px 0" }}>
                    <li>
                      <strong>Zero Cloud Uploads:</strong> Image conversion, resize, and compression
                      run exclusively on your local computer via Rust.
                    </li>
                    <li>
                      <strong>No Telemetry / No Tracking:</strong> No analytics SDKs, error reporting
                      beacons, or user monitoring code exists in this binary.
                    </li>
                    <li>
                      <strong>Local History:</strong> Recent projects store only paths, filenames,
                      and timestamps in local WebView storage on this device.
                    </li>
                  </ul>
                  <div style={{ marginTop: 14 }}>
                    <button className="clear-history" onClick={clearHistory}>
                      <Trash2 size={13} /> Clear local history database
                    </button>
                  </div>
                </div>
              </div>

              <div className="section-card">
                <div className="card-header">
                  <h3>
                    <LogIn size={16} /> Google Sign-In & OAuth Integration
                  </h3>
                  <span className="badge-status skipped">PENDING CONFIGURATION</span>
                </div>
                <div style={{ color: "#8a9bb2", fontSize: 11, lineHeight: 1.8 }}>
                  <p>
                    Google Sign-in is optional and currently pending client configuration. When
                    configured, it provides identity verification without transmitting local project
                    files or recent history to Google servers.
                  </p>
                  <div
                    style={{
                      background: "rgba(10, 16, 26, .6)",
                      border: "1px solid var(--line)",
                      borderRadius: 6,
                      padding: "12px 16px",
                      marginTop: 10,
                      fontFamily: "Consolas, monospace",
                      fontSize: 10,
                    }}
                  >
                    <div>1. Create an OAuth 2.0 Client ID (Desktop Application) in Google Cloud Console.</div>
                    <div>2. Configure Authorized Redirect URI: <code>http://127.0.0.1:1420/oauth/callback</code></div>
                    <div>3. Scope: <code>openid email profile</code> (Minimal identity scopes only).</div>
                    <div>4. Provide <code>VITE_GOOGLE_CLIENT_ID</code> in local environment settings.</div>
                  </div>
                  <p style={{ marginTop: 10, fontSize: 10, color: "#74869e" }}>
                    * First-time authentication requires an active internet connection. Core image
                    tools will always remain usable offline regardless of sign-in status.
                  </p>
                </div>
              </div>
            </div>
          )}

          <footer className="page-footer">
            <span>
              Made for your desktop by <strong>Zcloud Digitech</strong>
            </span>
            <span>
              <span className="footer-green-dot" /> LOCAL-FIRST BY DESIGN
            </span>
          </footer>
        </div>
      </main>

      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          <span>{toast}</span>
          <button onClick={() => setToast("")} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
