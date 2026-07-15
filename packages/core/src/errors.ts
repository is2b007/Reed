import type { MutationRecord } from "@reed/schema";

export class ReedError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends ReedError {
  constructor(entity: string, id: string) {
    super(`${entity} not found: ${id}`, "NOT_FOUND", { entity, id });
  }
}

export class ConflictError extends ReedError {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message, "CONFLICT", details);
  }
}

export class GuardrailError extends ReedError {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message, "GUARDRAIL", details);
  }
}

export class ConcurrencyError extends ReedError {
  constructor(
    readonly aggregateId: string,
    readonly expectedVersion: number,
    readonly currentVersion: number,
    readonly changesSinceExpected: MutationRecord[],
  ) {
    super(
      `Stale write for ${aggregateId}: expected version ${expectedVersion}, current version is ${currentVersion}`,
      "STALE_VERSION",
      { aggregateId, expectedVersion, currentVersion, changesSinceExpected },
    );
  }
}
