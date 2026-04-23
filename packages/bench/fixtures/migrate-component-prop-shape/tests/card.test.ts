import { describe, expect, it } from "vitest";
import { Card } from "../src/card.js";
import { renderPage } from "../src/page.js";

describe("Card", () => {
  it("renders with heading and content props", () => {
    expect(Card({ heading: "Hi", content: "World" })).toBe("Hi: World");
  });

  it("renderPage returns the expected string", () => {
    expect(renderPage()).toBe("Hi: World");
  });
});
