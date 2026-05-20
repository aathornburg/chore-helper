export function assertSafeDatabaseForCleanup(connectionString: string, allowDestructive = false) {
  const databaseName = new URL(connectionString).pathname.replace(/^\//, "");

  if (allowDestructive || databaseName.endsWith("_test")) return;

  throw new Error(
    `Refusing to run destructive DB tests against database "${databaseName}". ` +
      "Set DATABASE_URL to a dedicated *_test database, or set ALLOW_DESTRUCTIVE_DB_TESTS=true."
  );
}
