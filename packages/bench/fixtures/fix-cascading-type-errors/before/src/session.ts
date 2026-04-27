import type { Session, UserId } from "./types.js";
import { randomUUID } from "node:crypto";

export function createSession(userId: UserId): Session {
  return {
    sessionId: randomUUID(),
    // BUG: ignores the userId argument, hardcodes number literal
    // @ts-expect-error intentional type bug for the fixture
    userId: 1,
    createdAt: new Date().toISOString(),
  };
}

export function isValidSession(session: Session): boolean {
  // BUG: numeric comparison on a string type
  // @ts-expect-error intentional type bug for the fixture
  return (session.userId as unknown as number) > 0;
}
