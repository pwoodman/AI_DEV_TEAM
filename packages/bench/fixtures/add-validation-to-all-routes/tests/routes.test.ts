import { expect, test } from "vitest";
import { handle } from "../src/router.js";

// POST /users
test("POST /users valid", () => {
  const r = handle({ method: "POST", path: "/users", body: { name: "Alice", email: "alice@example.com" } });
  expect(r.status).toBe(201);
});
test("POST /users invalid - missing email", () => {
  const r = handle({ method: "POST", path: "/users", body: { name: "Alice" } });
  expect(r.status).toBe(400);
});
test("POST /users invalid - empty name", () => {
  const r = handle({ method: "POST", path: "/users", body: { name: "", email: "a@b.com" } });
  expect(r.status).toBe(400);
});

// POST /posts
test("POST /posts valid", () => {
  const r = handle({ method: "POST", path: "/posts", body: { title: "Hello", userId: 1 } });
  expect(r.status).toBe(201);
});
test("POST /posts invalid - userId not a number", () => {
  const r = handle({ method: "POST", path: "/posts", body: { title: "Hello", userId: "abc" } });
  expect(r.status).toBe(400);
});

// PUT /posts/:id
test("PUT /posts/:id valid", () => {
  const r = handle({ method: "PUT", path: "/posts/5", params: { id: "5" }, body: { title: "Updated" } });
  expect(r.status).toBe(200);
});
test("PUT /posts/:id invalid - empty title", () => {
  const r = handle({ method: "PUT", path: "/posts/5", params: { id: "5" }, body: { title: "" } });
  expect(r.status).toBe(400);
});

// DELETE /users/:id
test("DELETE /users/:id valid", () => {
  const r = handle({ method: "DELETE", path: "/users/3", params: { id: "3" } });
  expect(r.status).toBe(204);
});
test("DELETE /users/:id invalid - non-numeric id", () => {
  const r = handle({ method: "DELETE", path: "/users/abc", params: { id: "abc" } });
  expect(r.status).toBe(400);
});

// POST /comments
test("POST /comments valid", () => {
  const r = handle({ method: "POST", path: "/comments", body: { postId: 1, text: "nice" } });
  expect(r.status).toBe(201);
});
test("POST /comments invalid - empty text", () => {
  const r = handle({ method: "POST", path: "/comments", body: { postId: 1, text: "" } });
  expect(r.status).toBe(400);
});
