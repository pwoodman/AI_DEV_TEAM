import type { User, UserId } from "./types.js";
import { getUser, addUser } from "./user-store.js";

export interface ApiRequest {
  userId: string;
  name?: string;
  email?: string;
}

export function handleGetUser(req: ApiRequest): User | { error: string } {
  // BUG: Number() converts "user-1" → NaN, so getUser always returns undefined
  // @ts-expect-error intentional type bug for the fixture
  const user = getUser(Number(req.userId) as unknown as UserId);
  if (!user) return { error: "not found" };
  return user;
}

export function handleAddUser(req: ApiRequest): { ok: boolean } {
  if (!req.name || !req.email) return { ok: false };
  // BUG: Number() converts string ID to NaN
  // @ts-expect-error intentional type bug for the fixture
  const id: UserId = Number(req.userId) as unknown as UserId;
  addUser({ id, name: req.name, email: req.email });
  return { ok: true };
}
