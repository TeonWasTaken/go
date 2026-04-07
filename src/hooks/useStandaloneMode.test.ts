import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStandaloneMode } from "./useStandaloneMode";

describe("useStandaloneMode", () => {
  let originalMatchMedia: typeof window.matchMedia;
  let originalNavigator: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
    originalNavigator = Object.getOwnPropertyDescriptor(navigator, "standalone");
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    if (originalNavigator) {
      Object.defineProperty(navigator, "standalone", originalNavigator);
    } else {
      delete (navigator as any).standalone;
    }
  });

  it("returns false when matchMedia is not supported", () => {
    (window as any).matchMedia = undefined;
    const { result } = renderHook(() => useStandaloneMode());
    expect(result.current).toBe(false);
  });

  it("returns false when not in standalone mode", () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    const { result } = renderHook(() => useStandaloneMode());
    expect(result.current).toBe(false);
  });

  it("returns true when matchMedia reports standalone", () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    const { result } = renderHook(() => useStandaloneMode());
    expect(result.current).toBe(true);
  });

  it("returns true when iOS navigator.standalone is true", () => {
    Object.defineProperty(navigator, "standalone", {
      value: true,
      configurable: true,
    });
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    const { result } = renderHook(() => useStandaloneMode());
    expect(result.current).toBe(true);
  });

  it("updates when matchMedia change event fires", () => {
    let changeHandler: ((e: MediaQueryListEvent) => void) | null = null;
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn((_event: string, handler: (e: MediaQueryListEvent) => void) => {
        changeHandler = handler;
      }),
      removeEventListener: vi.fn(),
    });

    const { result } = renderHook(() => useStandaloneMode());
    expect(result.current).toBe(false);

    act(() => {
      changeHandler!({ matches: true } as MediaQueryListEvent);
    });
    expect(result.current).toBe(true);
  });

  it("cleans up the matchMedia listener on unmount", () => {
    const removeEventListener = vi.fn();
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener,
    });

    const { unmount } = renderHook(() => useStandaloneMode());
    unmount();
    expect(removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });
});
