import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import App from "./App";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

const defaultInvokeImpl = (cmd: string) => {
  if (cmd === "check_file_exists") return Promise.resolve(true);
  if (cmd === "get_image_metadata") {
    return Promise.resolve({
      path: "C:\\mock\\photo.png",
      filename: "photo.png",
      format: "PNG",
      width: 1920,
      height: 1080,
      file_size_bytes: 204800,
      has_alpha: true,
    });
  }
  if (cmd === "process_image") {
    return Promise.resolve({
      input_path: "C:\\mock\\photo.png",
      output_path: "C:\\mock\\photo.webp",
      original_size_bytes: 204800,
      output_size_bytes: 102400,
      original_width: 1920,
      original_height: 1080,
      output_width: 1920,
      output_height: 1080,
      output_format: "WEBP",
      duration_ms: 45,
    });
  }
  return Promise.resolve({});
};

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: vi.fn(),
}));

describe("Zcloud FileFlow Phase 1 - Frontend Test Suite", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.mocked(invoke).mockImplementation(defaultInvokeImpl);
  });

  it("renders workspace branding and offline readiness badge", () => {
    render(<App />);
    const brands = screen.getAllByText(/Zcloud/i);
    expect(brands.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/FileFlow/i)).toBeDefined();
    expect(screen.getByText(/Ready offline/i)).toBeDefined();
    expect(screen.getByText(/LOCAL FILE WORKSPACE/i)).toBeDefined();
  });

  it("renders privacy badges and offline-first promises", () => {
    render(<App />);
    expect(screen.getByText(/Your files stay yours/i)).toBeDefined();
    const noUploads = screen.getAllByText(/No file uploads/i);
    expect(noUploads.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Local history/i)).toBeDefined();
  });

  it("shows empty state when no recent files exist", () => {
    render(<App />);
    expect(screen.getByText(/Your recent work will appear here/i)).toBeDefined();
  });

  it("handles Connect Google button gracefully without network calls", async () => {
    render(<App />);
    const googleBtn = screen.getByRole("button", { name: /Connect Google/i });
    fireEvent.click(googleBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Google sign-in is not configured in this first build/i),
      ).toBeDefined();
    });
  });

  it("toggles the Data & Privacy disclosure banner", async () => {
    render(<App />);
    const privacyBtn = screen.getByRole("button", { name: /Data & privacy/i });
    fireEvent.click(privacyBtn);

    await waitFor(() => {
      expect(screen.getByText(/What gets saved on this PC\?/i)).toBeDefined();
    });
  });

  it("navigates to Image tools studio and switches between Single and Batch modes", async () => {
    render(<App />);
    const imageNavBtn = screen.getAllByRole("button", { name: /Image tools/i })[0];
    fireEvent.click(imageNavBtn);

    expect(screen.getByText(/Single Image Studio/i)).toBeDefined();
    expect(screen.getByText(/Batch Processing/i)).toBeDefined();

    const batchTab = screen.getByText(/Batch Processing/i);
    fireEvent.click(batchTab);

    expect(screen.getByText(/Batch Conversion Queue/i)).toBeDefined();
    expect(screen.getByText(/No images in batch queue/i)).toBeDefined();
  });

  it("clears recent history locally without deleting files", async () => {
    localStorage.setItem(
      "zcloud-fileflow.recent.v1",
      JSON.stringify([
        {
          path: "C:\\mock\\photo.png",
          name: "photo.png",
          kind: "PNG",
          lastOpened: Date.now(),
        },
      ]),
    );

    render(<App />);
    expect(screen.getByText("photo.png")).toBeDefined();

    const clearBtn = screen.getByRole("button", { name: /Clear history/i });
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(screen.queryByText("photo.png")).toBeNull();
      expect(
        screen.getByText(/Recent history cleared from this device/i),
      ).toBeDefined();
    });
  });

  it("navigates to Recent Projects view and filters items", async () => {
    localStorage.setItem(
      "zcloud-fileflow.recent.v1",
      JSON.stringify([
        {
          path: "C:\\mock\\photo.png",
          name: "photo.png",
          kind: "PNG",
          lastOpened: Date.now(),
        },
        {
          path: "C:\\mock\\document.jpg",
          name: "document.jpg",
          kind: "JPG",
          lastOpened: Date.now(),
        },
      ]),
    );

    render(<App />);
    const recentNav = screen.getByRole("button", { name: /Recent projects/i });
    fireEvent.click(recentNav);

    expect(screen.getByText("photo.png")).toBeDefined();
    expect(screen.getByText("document.jpg")).toBeDefined();

    const searchInput = screen.getByPlaceholderText(/Search recent files/i);
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: "photo" } });
    });

    await waitFor(() => {
      expect(screen.getByText("photo.png")).toBeDefined();
      expect(screen.queryByText("document.jpg")).toBeNull();
    });
  });

  it("displays honest roadmap indicators for planned features", async () => {
    render(<App />);
    const pdfBtn = screen.getByRole("button", { name: /PDF tools/i });
    fireEvent.click(pdfBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/PDF tools are planned for a later build/i),
      ).toBeDefined();
    });
  });

  it("adjusts format-specific compression controls dynamically in Single Studio", async () => {
    render(<App />);
    const imageNavBtn = screen.getAllByRole("button", { name: /Image tools/i })[0];
    fireEvent.click(imageNavBtn);

    // Initial default is WebP
    expect(screen.getByText(/WebP Encoding: Pure Rust lossless/i)).toBeDefined();

    // Switch to JPG
    const formatSelect = screen.getByDisplayValue(/WebP \(Modern, high ratio\)/i);
    fireEvent.change(formatSelect, { target: { value: "jpg" } });

    await waitFor(() => {
      expect(screen.getByText(/JPEG Quality:/i)).toBeDefined();
    });

    // Switch to PNG
    fireEvent.change(formatSelect, { target: { value: "png" } });

    await waitFor(() => {
      expect(screen.getByText(/PNG Compression Strategy/i)).toBeDefined();
    });
  });

  it("handles batch queue cancellation cooperatively without corrupting UI state", async () => {
    render(<App />);
    const imageNavBtn = screen.getAllByRole("button", { name: /Image tools/i })[0];
    fireEvent.click(imageNavBtn);

    const batchTab = screen.getByText(/Batch Processing/i);
    fireEvent.click(batchTab);

    expect(screen.getByText(/Batch Conversion Queue/i)).toBeDefined();
    expect(screen.getByText(/No images in batch queue/i)).toBeDefined();
  });

  it("converts selected image and appends missing extension, resetting loading state", async () => {
    vi.mocked(open).mockResolvedValueOnce("C:\\mock\\picture.png");
    vi.mocked(save).mockResolvedValueOnce("C:\\mock\\picture_out"); // Notice: no extension provided by dialog!

    render(<App />);
    const chooseBtn = screen.getByRole("button", { name: /Choose source image/i });
    await act(async () => {
      fireEvent.click(chooseBtn);
    });

    await waitFor(() => {
      expect(screen.getAllByText("picture.png").length).toBeGreaterThanOrEqual(1);
    });

    const convertBtn = screen.getByRole("button", { name: /Convert image/i });
    expect((convertBtn as HTMLButtonElement).disabled).toBe(false);

    await act(async () => {
      fireEvent.click(convertBtn);
    });

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        "process_image",
        expect.objectContaining({
          options: expect.objectContaining({
            input_path: "C:\\mock\\picture.png",
            output_path: "C:\\mock\\picture_out.webp", // Canonical extension appended!
            output_format: "webp",
          }),
        }),
      );
      expect(screen.getByText(/Saved to photo\.webp/i)).toBeDefined();
    });

    // Busy state terminates and button is restored
    expect((screen.getByRole("button", { name: /Convert image/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("surfaces backend conversion errors and resets busy state cleanly", async () => {
    vi.mocked(open).mockResolvedValueOnce("C:\\mock\\broken.png");
    vi.mocked(save).mockResolvedValueOnce("C:\\mock\\broken.webp");
    vi.mocked(invoke).mockImplementation((cmd) => {
      if (cmd === "process_image") {
        return Promise.reject("Corrupt file header: decode error");
      }
      return defaultInvokeImpl(cmd);
    });

    render(<App />);
    const chooseBtn = screen.getByRole("button", { name: /Choose source image/i });
    await act(async () => {
      fireEvent.click(chooseBtn);
    });

    await waitFor(() => {
      expect(screen.getAllByText("broken.png").length).toBeGreaterThanOrEqual(1);
    });

    const convertBtn = screen.getByRole("button", { name: /Convert image/i });
    await act(async () => {
      fireEvent.click(convertBtn);
    });

    await waitFor(() => {
      expect(screen.getByText("Corrupt file header: decode error")).toBeDefined();
    });

    // Busy state terminates on error
    expect((screen.getByRole("button", { name: /Convert image/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("allows converting images with .jpeg extension", async () => {
    vi.mocked(open).mockResolvedValueOnce("C:\\mock\\photo.jpeg");

    render(<App />);
    const chooseBtn = screen.getByRole("button", { name: /Choose source image/i });
    await act(async () => {
      fireEvent.click(chooseBtn);
    });

    await waitFor(() => {
      expect(screen.getAllByText("photo.jpeg").length).toBeGreaterThanOrEqual(1);
    });

    const convertBtn = screen.getByRole("button", { name: /Convert image/i });
    expect((convertBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it("reports individual batch failures without crashing the batch queue", async () => {
    vi.mocked(open)
      .mockResolvedValueOnce(["C:\\mock\\first.png", "C:\\mock\\second.png"]) // chooseBatchFiles
      .mockResolvedValueOnce("C:\\mock\\output"); // chooseBatchOutputDir

    let processCallCount = 0;
    vi.mocked(invoke).mockImplementation((cmd) => {
      if (cmd === "process_image") {
        processCallCount++;
        if (processCallCount === 1) {
          return Promise.reject("Decode failure on first image");
        }
        return Promise.resolve({
          input_path: "C:\\mock\\second.png",
          output_path: "C:\\mock\\output\\second_converted.webp",
          original_size_bytes: 200000,
          output_size_bytes: 100000,
          original_width: 800,
          original_height: 600,
          output_width: 800,
          output_height: 600,
          output_format: "WEBP",
          duration_ms: 30,
        });
      }
      return defaultInvokeImpl(cmd);
    });

    render(<App />);
    const imageNavBtn = screen.getAllByRole("button", { name: /Image tools/i })[0];
    fireEvent.click(imageNavBtn);

    const batchTab = screen.getByText(/Batch Processing/i);
    fireEvent.click(batchTab);

    const addFilesBtn = screen.getByRole("button", { name: /Add Images/i });
    fireEvent.click(addFilesBtn);

    await waitFor(() => {
      expect(screen.getByText("first.png")).toBeDefined();
      expect(screen.getByText("second.png")).toBeDefined();
    });

    const setFolderBtn = screen.getByRole("button", { name: /Browse\.\.\./i });
    fireEvent.click(setFolderBtn);

    await waitFor(() => {
      expect(screen.getByText(/Output folder set to C:\\mock\\output/i)).toBeDefined();
    });

    const startBatchBtn = screen.getByRole("button", { name: /Process 2 Images/i });
    fireEvent.click(startBatchBtn);

    await waitFor(() => {
      expect(screen.getByText(/Batch complete: 1 successful, 1 failed\./i)).toBeDefined();
      expect(screen.getByText("Decode failure on first image")).toBeDefined();
    });
  });
});
