import "dotenv/config";
import { assertSafeDatabaseForCleanup } from "./databaseSafety.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to reset the persistent test database.");
}

assertSafeDatabaseForCleanup(connectionString);
