import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { IconFallback } from "../IconFallback";
import { getIconColor, getIconLetter } from "../iconFallbackUtils";

afterEach(() => {
  cleanup();
});

describe("IconFallback component", () => {
  it("renders <img> when iconUrl is provided", () => {
    const { container } = render(
      <IconFallback
        iconUrl="https://example.com/favicon.ico"
        title="Example"
        alias="ex"
        size={20}
      />,
    );

    const img = container.querySelector("img");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "https://example.com/favicon.ico");
  });

  it("renders letter div when iconUrl is null", () => {
    const { container } = render(
      <IconFallback iconUrl={null} title="Example" alias="ex" size={20} />,
    );

    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(screen.getByText("E")).toBeInTheDocument();
  });

  it("switches to letter div on image onError", () => {
    const { container } = render(
      <IconFallback
        iconUrl="https://example.com/bad.ico"
        title="Fallback"
        alias="fb"
        size={20}
      />,
    );

    const img = container.querySelector("img")!;
    fireEvent.error(img);

    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(screen.getByText("F")).toBeInTheDocument();
  });
});

describe("getIconLetter", () => {
  it('returns "?" for empty title and alias', () => {
    expect(getIconLetter("", "")).toBe("?");
  });
});

describe("getIconColor", () => {
  it("returns a valid hex string", () => {
    const color = getIconColor("test");
    expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});
