import { expect, test } from "vitest";
// Import each parser to trigger self-registration
import "../src/parsers/csv.js";
import "../src/parsers/json.js";
import "../src/parsers/tsv.js";
import "../src/parsers/xml.js";
import { parse } from "../src/pipeline.js";

test("csv parser works via registry", () => {
  expect(parse("a, b, c", "csv")).toEqual(["a", "b", "c"]);
});

test("json parser works via registry", () => {
  expect(parse('["x","y"]', "json")).toEqual(["x", "y"]);
});

test("xml parser works via registry", () => {
  expect(parse("<item>foo</item><item>bar</item>", "xml")).toEqual(["foo", "bar"]);
});

test("tsv parser works via registry", () => {
  expect(parse("a\tb\tc", "tsv")).toEqual(["a", "b", "c"]);
});

test("unknown format throws", () => {
  // @ts-expect-error testing runtime error
  expect(() => parse("x", "yaml")).toThrow();
});
