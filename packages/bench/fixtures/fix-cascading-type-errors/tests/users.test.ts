import { expect, test } from "vitest";
import { getUser, listUsers, addUser } from "../src/user-store.js";
import { createSession, isValidSession } from "../src/session.js";
import { authenticate, validateUserId } from "../src/auth.js";
import { handleGetUser, handleAddUser } from "../src/api.js";

// user-store tests
test("getUser returns user for valid string id", () => {
  const user = getUser("user-1");
  expect(user).toBeDefined();
  expect(user?.name).toBe("Alice");
});

test("getUser returns user-2 for 'user-2'", () => {
  const user = getUser("user-2");
  expect(user).toBeDefined();
  expect(user?.name).toBe("Bob");
});

test("getUser returns undefined for unknown id", () => {
  expect(getUser("user-999")).toBeUndefined();
});

test("listUsers returns all seeded users", () => {
  expect(listUsers().length).toBeGreaterThanOrEqual(2);
});

test("addUser with string id adds user", () => {
  addUser({ id: "user-42", name: "Carol", email: "carol@example.com" });
  expect(getUser("user-42")?.name).toBe("Carol");
});

// session tests
test("createSession stores the provided userId as a string", () => {
  const session = createSession("user-1");
  expect(session.userId).toBe("user-1");
  expect(typeof session.userId).toBe("string");
});

test("isValidSession returns true for non-empty userId", () => {
  const session = createSession("user-1");
  expect(isValidSession(session)).toBe(true);
});

test("isValidSession returns false for empty userId", () => {
  const session = createSession("user-1");
  const emptySession = { ...session, userId: "" as unknown as "user-1" };
  expect(isValidSession(emptySession)).toBe(false);
});

// auth tests
test("authenticate returns true for matching email", () => {
  expect(authenticate("user-1", "alice@example.com")).toBe(true);
});

test("authenticate returns false for wrong email", () => {
  expect(authenticate("user-1", "wrong@example.com")).toBe(false);
});

test("validateUserId returns true for non-empty string", () => {
  expect(validateUserId("user-1")).toBe(true);
});

test("validateUserId returns false for empty string", () => {
  expect(validateUserId("")).toBe(false);
});

// api tests
test("handleGetUser returns user for valid string id", () => {
  const result = handleGetUser({ userId: "user-1" });
  expect("error" in result).toBe(false);
  if (!("error" in result)) expect(result.name).toBe("Alice");
});

test("handleGetUser returns error for unknown id", () => {
  const result = handleGetUser({ userId: "user-999" });
  expect("error" in result).toBe(true);
});
