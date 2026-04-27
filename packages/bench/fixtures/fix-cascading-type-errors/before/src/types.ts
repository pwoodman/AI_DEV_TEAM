export type UserId = string;

export interface User {
  id: UserId;
  name: string;
  email: string;
}

export interface Session {
  sessionId: string;
  userId: UserId;
  createdAt: string;
}
