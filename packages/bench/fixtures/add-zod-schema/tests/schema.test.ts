import { describe, expect, it } from "vitest";
import { UserSchema, type User } from "../src/user.js";

describe("UserSchema", () => {
  it("accepts a valid user", () => {
    const u: User = { id: "11111111-1111-1111-1111-111111111111", email: "a@b.co" };
    expect(UserSchema.parse(u)).toEqual(u);
  });
  it("rejects invalid email", () => {
    expect(() => UserSchema.parse({ id: "11111111-1111-1111-1111-111111111111", email: "nope" })).toThrow();
  });
});
