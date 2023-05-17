import { AppError, environment } from "@compas/stdlib";

/**
 * Ensure environment vars are present, throw hard if missing.
 * This method should be used as guard during startup to ensure non-unexpected
 * code paths are hit during runtime.
 *
 * @param {string[]} requiredEnvironmentVariables
 * @returns {void}
 */
export function ensureEnvironmentVars(requiredEnvironmentVariables) {
  for (const env of requiredEnvironmentVariables) {
    if (typeof environment[env] !== "string" || environment[env].length === 0) {
      throw AppError.serverError({
        message: `Missing environment variable '${env}'. Please add it to your '.env' file.`,
      });
    }
  }
}
