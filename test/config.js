import { cleanupTestServices, injectTestServices } from "../src/testing.js";

/**
 * Test timeout, see compas docs
 *
 * @type {number}
 */
export const timeout = 2500;

/**
 * Test setup, this is run once by the test runner
 * We set the global templates for database and bucket
 * But don't clean them up yet
 *
 * @returns {Promise<void>}
 */
export async function setup() {
  await injectTestServices();
}

/**
 * Cleanup templates for database & bucket
 *
 * @returns {Promise<void>}
 */
export async function teardown() {
  await cleanupTestServices();
}
