import type { User, UserId } from "./types.js";

const users = new Map<UserId, User>([
  ["user-1", { id: "user-1", name: "Alice", email: "alice@example.com" }],
  ["user-2", { id: "user-2", name: "Bob", email: "bob@example.com" }],
]);

export function getUser(id: UserId): User | undefined {
  // BUG: parseInt converts "user-1" to NaN; lookup always fails
  // @ts-expect-error intentional type bug for the fixture
  const numericId = parseInt(id);
  if (numericId <= 0 || isNaN(numericId)) return undefined;
  return users.get(String(numericId));
}

export function listUsers(): User[] {
  return [...users.values()];
}

export function addUser(user: User): void {
  // @ts-expect-error intentional type bug for the fixture
  if ((user.id as unknown as number) <= 0) throw new Error("invalid id");
  users.set(user.id, user);
}
