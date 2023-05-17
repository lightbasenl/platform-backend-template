import {
  createTestPostgresDatabase,
  newPostgresConnection,
} from "@compas/store";
import { serviceLogger } from "./logger.js";

/**
 * Used in `compas migrate` to customize the connection options.
 *
 * @type {{max: number, createIfNotExists: boolean}}
 */
export const postgresConnectionSettings = {
  createIfNotExists: true,
  max: 2,
};

/**
 * @type {Postgres}
 */
export let sql = undefined;

/**
 * Initialize the Postgres connection
 *
 * @param {{
 *   connectionCount: number
 * }} options
 */
export async function serviceSqlInit(options) {
  serviceLogger.info("setting sql");

  // No need to enforce env vars, `newPostgresConnection` will already do this.
  sql = await newPostgresConnection({
    createIfNotExists: true,
    max: options.connectionCount,
  });
}

/**
 * Initialize the postgres connection to a new database derived from the application
 * database. All tables will be truncated, the migration state will be same as the
 * `$APP_NAME` database.
 */
export async function serviceSqlTestInit() {
  serviceLogger.info("setting sql");

  sql = await createTestPostgresDatabase();
}
