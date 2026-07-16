export type DomainEvent =
  | { type: 'miss'; sourceId: string; targetId: string }
  | { type: 'damage'; sourceId: string; targetId: string; amount: number }
  | { type: 'heal'; sourceId: string; targetId: string; amount: number }
  | { type: 'status-applied'; targetId: string; statusId: string; expiresAt: number }
  | { type: 'death'; entityId: string }
  | { type: 'level-up'; entityId: string; level: number };
