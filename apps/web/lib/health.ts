export type HealthStatus = "ok" | "degraded";
export type DatabaseStatus = "up" | "down";

export interface HealthPayload {
  status: HealthStatus;
  database: DatabaseStatus;
  migration: string;
  timestamp: string;
}

interface BuildHealthPayloadInput {
  databaseUp: boolean;
  migration: string | null;
  now?: Date;
}

/**
 * Pure mapping from a database probe result to the public health payload.
 * Driver and SQL error text never enters this shape.
 */
export function buildHealthPayload({
  databaseUp,
  migration,
  now = new Date(),
}: BuildHealthPayloadInput): HealthPayload {
  const timestamp = now.toISOString();

  if (!databaseUp) {
    return {
      status: "degraded",
      database: "down",
      migration: "unknown",
      timestamp,
    };
  }

  return {
    status: "ok",
    database: "up",
    migration: migration && migration.length > 0 ? migration : "none",
    timestamp,
  };
}

/**
 * Converts the newest `drizzle.__drizzle_migrations.created_at` value into a
 * stable label. PostgreSQL returns bigint columns as strings.
 */
export function migrationLabel(createdAt: string | number | null | undefined): string {
  if (createdAt === null || createdAt === undefined || createdAt === "") {
    return "none";
  }

  return String(createdAt);
}
