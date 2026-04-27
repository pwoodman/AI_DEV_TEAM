import type { UserId } from "./types.js";
import { getUser } from "./user-store.js";

export function authenticate(userId: UserId, email: string): boolean {
  // BUG: numeric comparison on string type
  // @ts-expect-error intentional type bug for the fixture
  if ((userId as unknown as number) <= 0) return false;
  const user = getUser(userId);
  return user?.email === email;
}

export function validateUserId(id: UserId): boolean {
  // BUG: > 0 is a number check; string IDs need a non-empty check
  // @ts-expect-error intentional type bug for the fixture
  return (id as unknown as number) > 0;
}
