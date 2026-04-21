import { describe, expect, it } from "vitest";
import { ValidationError, validateAge } from "../src/validate.js";

describe("add-typed-error", () => {
  it("exports ValidationError class extending Error", () => {
    const err = new ValidationError("x");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.name).toBe("ValidationError");
  });
  it("throws ValidationError for negative age", () => {
    expect(() => validateAge(-1)).toThrow(ValidationError);
    try {
      validateAge(-1);
    } catch (e) {
      expect((e as Error).message).toBe("age must be non-negative");
    }
  });
  it("returns the age when valid", () => {
    expect(validateAge(30)).toBe(30);
  });
});
