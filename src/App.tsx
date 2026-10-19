import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  ArrowDownToLine,
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
  LockKeyhole,
  LogIn,
  MoreHorizontal,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Video,
  WandSparkles,
  X,
  Zap,
} from "lucide-react";

type RecentItem = {
  path: string;
  name: string;
  kind: string;
  lastOpened: number;
};

const HISTORY_KEY = "zcloud-fileflow.recent.v1";
const supportedFormats = ["png", "jpg", "webp", "bmp"];

function getFileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

function getExtension(path: string): string {
  const name = getFileName(path);
  const index = name.lastIndexOf(".");
  return index > -1 ? name.slice(index + 1).toLowerCase() : "";
}

function loadRecent(): RecentItem[] {
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
    ).slice(0, 12);
  } catch {
    return [];
  }
}

function prettyTime(timestamp: number): string {
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
  const [toast, setToast] = useState("");
  const [showHistoryInfo, setShowHistoryInfo] = useState(false);

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

  const selectedName = selectedPath ? getFileName(selectedPath) : "";
  const selectedExtension = selectedPath ? getExtension(selectedPath) : "";
  const recentCount = recent.length;
  const hasSelection = Boolean(selectedPath);
  const canConvert = hasSelection && supportedFormats.includes(selectedExtension);

  const currentFormatLabel = useMemo(() => format.toUpperCase(), [format]);

  function rememberPath(path: string) {
    const name = getFileName(path);
    const item: RecentItem = {
      path,
      name,
      kind: getExtension(path).toUpperCase() || "FILE",
      lastOpened: Date.now(),
    };
    setRecent((existing) => [item, ...existing.filter((row) => row.path !== path)].slice(0, 12));
    setSelectedPath(path);
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
        setToast("File selected. Choose an output format to continue.");
      }
    } catch {
      setToast("File picker failed. Run Zcloud FileFlow as a desktop app and try again.");
    }
  }

  async function convertSelected() {
    if (!selectedPath) {
      setToast("Choose an image first.");
      return;
    }
    if (!supportedFormats.includes(selectedExtension)) {
      setToast("This first build converts PNG, JPG, WebP and BMP images only.");
      return;
    }
    if (selectedExtension === format || (selectedExtension === "jpeg" && format === "jpg")) {
      setToast("The selected image is already in that format.");
      return;
    }

    const originalName = getFileName(selectedPath);
    const dot = originalName.lastIndexOf(".");
    const stem = dot > 0 ? originalName.slice(0, dot) : originalName;

    try {
      const destination = await save({
        defaultPath: stem + "." + format,
        filters: [{ name: currentFormatLabel + " image", extensions: [format] }],
      });
      if (!destination) return;

      setBusy(true);
      const savedPath = await invoke<string>("convert_image", {
        inputPath: selectedPath,
        outputPath: destination,
        outputFormat: format,
      });
      setToast("Converted locally and saved to " + getFileName(savedPath));
      setRecent((existing) => [
        { path: savedPath, name: getFileName(savedPath), kind: format.toUpperCase(), lastOpened: Date.now() },
        ...existing.filter((row) => row.path !== savedPath),
      ].slice(0, 12));
    } catch (error) {
      setToast(typeof error === "string" ? error : "Conversion failed. Check the selected image and output path.");
    } finally {
      setBusy(false);
    }
  }

  function openRecent(item: RecentItem) {
    setSelectedPath(item.path);
    setActiveNav("Workspace");
    setToast("Loaded local history entry: " + item.name);
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

  const sidebarLinks = [
    { label: "Workspace", icon: HardDrive },
    { label: "Image tools", icon: ImageIcon },
    { label: "PDF tools", icon: FileText },
    { label: "Audio", icon: AudioLines },
    { label: "Video", icon: Video },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark"><span>Z</span><i /></div>
          <div className="brand-copy">
            <strong>Zcloud <span>FileFlow</span></strong>
            <small>LOCAL FILE WORKSPACE</small>
          </div>
        </div>

        <button className="new-project-button" onClick={chooseFile}>
          <FilePlus2 size={17} strokeWidth={1.9} />
          <span>Open a file</span>
          <span className="shortcut">↵</span>
        </button>

        <div className="nav-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          {sidebarLinks.map(({ label, icon: Icon }) => (
            <button
              key={label}
              className={"nav-item " + (activeNav === label ? "active" : "")}
              onClick={() => {
                setActiveNav(label);
                if (label !== "Workspace" && label !== "Image tools") {
                  setToast(label + " tools are planned for a later build. Nothing was uploaded.");
                }
                if (label === "Image tools") {
                  setToast("Image conversion is available in this MVP.");
                }
              }}
            >
              <Icon size={17} strokeWidth={1.8} />
              <span>{label}</span>
              {label === "Workspace" && <span className="nav-dot" />}
              {label === "Image tools" && <span className="nav-mini-tag">BETA</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-divider" />
        <div className="nav-label">YOUR SPACE</div>
        <button className="nav-item" onClick={() => setShowHistoryInfo((value) => !value)}>
          <Clock3 size={17} strokeWidth={1.8} />
          <span>Recent projects</span>
          <span className="nav-count">{recentCount}</span>
        </button>
        <button className="nav-item" onClick={() => setToast("Keyboard shortcuts and radial actions are planned for the next milestone.")}>
          <Keyboard size={17} strokeWidth={1.8} />
          <span>Quick actions</span>
          <span className="soon-tag">SOON</span>
        </button>

        <div className="sidebar-spacer" />
        <div className="privacy-mini-card">
          <div className="privacy-icon"><ShieldCheck size={17} /></div>
          <div>
            <strong>Your files stay yours.</strong>
            <p>Local processing. No file uploads. No telemetry.</p>
          </div>
        </div>
        <button className="nav-item settings-link" onClick={() => setToast("Settings will include history controls, output preferences and optional sign-in.")}>
          <Settings2 size={17} strokeWidth={1.8} />
          <span>Settings</span>
        </button>
        <div className="sidebar-footer">
          <span className="version-dot" /> <span>v0.1.0 MVP</span>
          <a href="https://github.com/Shameer28tm/zcloud-fileflow" target="_blank" rel="noreferrer" aria-label="Open GitHub repository">
            <Github size={15} />
          </a>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{activeNav}</strong></div>
          <div className="topbar-actions">
            <div className="connection-status"><span className="green-dot" /> Ready offline</div>
            <button className="google-button" onClick={connectGoogle}>
              <LogIn size={15} /> <span>Connect Google</span>
            </button>
            <button className="icon-button" aria-label="Help" onClick={() => setToast("All processing is local. Google sign-in is optional and not configured yet.")}>
              <CircleHelp size={17} />
            </button>
          </div>
        </header>

        <div className="content-area">
          <section className="welcome-row">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" /> YOUR DESKTOP, IN FLOW</div>
              <h1>Good work starts<br /><span>with less friction.</span></h1>
              <p className="welcome-description">Your everyday file tools, in one quiet workspace.<br />Private by default. Ready when your internet isn't.</p>
            </div>
            <div className="welcome-art" aria-hidden="true">
              <div className="orbit orbit-one" /><div className="orbit orbit-two" />
              <div className="art-core"><Zap size={35} strokeWidth={1.25} /></div>
              <div className="art-float art-file"><FileImage size={19} /><span>PNG</span></div>
              <div className="art-float art-lock"><LockKeyhole size={17} /></div>
              <div className="art-spark spark-one" /><div className="art-spark spark-two" />
            </div>
          </section>

          <section className="status-strip" aria-label="Privacy status">
            <div className="status-item"><span className="status-icon"><CloudOff size={16} /></span><span><strong>Offline ready</strong><small>Core image conversion runs on-device</small></span></div>
            <div className="status-item"><span className="status-icon"><LockKeyhole size={16} /></span><span><strong>No file uploads</strong><small>Your image never leaves your PC</small></span></div>
            <div className="status-item"><span className="status-icon"><HardDrive size={16} /></span><span><strong>Local history</strong><small>Clear it whenever you need</small></span></div>
          </section>

          <div className="section-heading">
            <div><h2>Workspace</h2><p>Pick up where you left off, or start something new.</p></div>
            <button className="text-button" onClick={() => setShowHistoryInfo((value) => !value)}><LockKeyhole size={14} /> Data & privacy <ArrowRight size={14} /></button>
          </div>

          {showHistoryInfo && (
            <div className="history-info">
              <ShieldCheck size={18} />
              <div><strong>What gets saved on this PC?</strong><p>Recent history stores file paths, names, formats and last-opened times in this app's local WebView storage. File contents are not copied into history or sent to a server. Use “Clear history” to remove this list. Your original and converted files remain wherever you saved them.</p></div>
              <button aria-label="Close privacy details" onClick={() => setShowHistoryInfo(false)}><X size={16} /></button>
            </div>
          )}

          <section className="tool-grid">
            <article className="tool-card image-card">
              <div className="tool-card-top"><div className="tool-icon image-tool-icon"><ImageIcon size={19} /></div><span className="tool-chip available"><span /> AVAILABLE NOW</span></div>
              <h3>Image converter</h3>
              <p>Switch formats without sending a single pixel to the cloud.</p>
              <div className="format-row"><span>PNG</span><ArrowRight size={13} /><span>JPG</span><ArrowRight size={13} /><span>WEBP</span><ArrowRight size={13} /><span>BMP</span></div>
              <button className="card-action primary-action" onClick={chooseFile}>Choose an image <ArrowRight size={15} /></button>
            </article>

            <article className="tool-card muted-card">
              <div className="tool-card-top"><div className="tool-icon pdf-tool-icon"><FileText size={19} /></div><span className="tool-chip planned">IN THE WORKS</span></div>
              <h3>PDF toolkit</h3>
              <p>Merge, split, reorder and export pages. All local, all under your control.</p>
              <div className="feature-pills"><span>Merge</span><span>Split</span><span>Export pages</span></div>
              <button className="card-action muted-action" onClick={() => setToast("PDF tools are planned; the current build does not process PDF files yet.")}>Coming next <ArrowRight size={15} /></button>
            </article>

            <article className="tool-card muted-card">
              <div className="tool-card-top"><div className="tool-icon media-tool-icon"><AudioLines size={19} /></div><span className="tool-chip planned">IN THE WORKS</span></div>
              <h3>Audio & video</h3>
              <p>Convert, trim and export media with processing handled on your device.</p>
              <div className="feature-pills"><span>MP3 / WAV</span><span>MP4 / MOV</span></div>
              <button className="card-action muted-action" onClick={() => setToast("Audio/video tools are planned for a later milestone.")}>Coming next <ArrowRight size={15} /></button>
            </article>
          </section>

          <section className="converter-panel">
            <div className="converter-heading">
              <div className="converter-icon"><WandSparkles size={18} /></div>
              <div><h2>Quick convert</h2><p>Choose a source image and an output format.</p></div>
              <span className="local-badge"><span /> LOCAL ENGINE</span>
            </div>
            <div className="converter-controls">
              <button className={"file-select " + (hasSelection ? "has-file" : "")} onClick={chooseFile}>
                <span className="file-select-icon"><FolderOpen size={18} /></span>
                <span className="file-select-copy"><strong>{hasSelection ? selectedName : "Choose source image"}</strong><small>{hasSelection ? selectedExtension.toUpperCase() + " · " + selectedPath : "PNG, JPG, WebP or BMP"}</small></span>
                <MoreHorizontal size={18} className="more-icon" />
              </button>
              <div className="conversion-arrow"><ArrowRight size={17} /></div>
              <label className="format-select"><span>Convert to</span><select value={format} onChange={(event) => setFormat(event.target.value)}><option value="webp">WebP</option><option value="png">PNG</option><option value="jpg">JPG</option><option value="bmp">BMP</option></select><ChevronDown size={14} /></label>
              <button className="convert-button" onClick={convertSelected} disabled={!canConvert || busy}>{busy ? <RefreshCw size={16} className="spin" /> : <Sparkles size={16} />}<span>{busy ? "Converting..." : "Convert image"}</span></button>
            </div>
            <div className="converter-footnote"><LockKeyhole size={12} /><span>Runs locally on your PC. Output is saved only where you choose.</span><span className="footnote-separator">·</span><span>No cloud upload</span></div>
          </section>

          <section className="recent-section">
            <div className="recent-heading"><div><h2>Recent projects <span className="count-pill">{recentCount}</span></h2><p>Stored locally on this device, never synced.</p></div><div className="recent-actions"><button className="subtle-icon-button" title="Refresh view" onClick={() => setRecent(loadRecent())}><RefreshCw size={14} /></button>{recentCount > 0 && <button className="clear-history" onClick={clearHistory}><Trash2 size={13} /> Clear history</button>}</div></div>
            {recent.length === 0 ? (
              <div className="empty-recent"><div className="empty-icon"><Clock3 size={18} /></div><div><strong>Your recent work will appear here</strong><p>Choose a file to begin. Only its local path and basic details are kept for your recent list.</p></div><button onClick={chooseFile}>Open first file <ArrowRight size={14} /></button></div>
            ) : (
              <div className="recent-list">
                {recent.slice(0, 5).map((item) => (
                  <div className="recent-row" key={item.path}>
                    <div className="recent-file-icon">{item.kind === "PNG" || item.kind === "JPG" || item.kind === "WEBP" || item.kind === "BMP" ? <FileImage size={17} /> : <FileText size={17} />}</div>
                    <button className="recent-name" onClick={() => openRecent(item)}><strong>{item.name}</strong><small>{item.kind} · {item.path}</small></button>
                    <span className="recent-time">{prettyTime(item.lastOpened)}</span>
                    <button className="recent-open" onClick={() => openRecent(item)} aria-label={"Load " + item.name}><ArrowRight size={15} /></button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <footer className="page-footer"><span>Made for your desktop by <strong>Zcloud Digitech</strong></span><span><span className="footer-green-dot" /> LOCAL-FIRST BY DESIGN</span></footer>
        </div>
      </main>
      {toast && <div className="toast" role="status"><Check size={16} /><span>{toast}</span><button onClick={() => setToast("")} aria-label="Dismiss"><X size={14} /></button></div>}
    </div>
  );
}

export default App;
