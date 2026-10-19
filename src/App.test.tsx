import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import App from "./App";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockImplementation((cmd: string) => {
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
  }),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: vi.fn(),
}));

describe("Zcloud FileFlow Phase 1 - Frontend Test Suite", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
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
    act(() => {
      fireEvent.change(searchInput, { target: { value: "photo" } });
    });

    expect(screen.getByText("photo.png")).toBeDefined();
    expect(screen.queryByText("document.jpg")).toBeNull();
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
});
