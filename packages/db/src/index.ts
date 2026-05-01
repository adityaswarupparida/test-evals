import { env } from "@test-evals/env/server";
import { drizzle } from "drizzle-orm/node-postgres";

import * as schema from "./schema";

export function createDb() {
  return drizzle(env.DATABASE_URL, { schema });
}

export const db = createDb();

export * from "./schema";
// Re-export the operators apps need — @test-evals/db owns the drizzle-orm dep
export { eq, and, or, inArray, desc, sql } from "drizzle-orm";
