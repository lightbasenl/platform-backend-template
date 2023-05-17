import { eventStart, eventStop } from "@compas/stdlib";
import { queries } from "../../services.js";

/**
 * Remove expired reset tokens as a job. Use the
 * `authJobNames.authPasswordBasedInvalidateResetTokens` as a dispatch key.
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @returns {Promise<void>}
 */
export async function authPasswordBasedInvalidateResetTokens(event, sql) {
  eventStart(event, "authPasswordBased.invalidateResetTokens");

  await queries.passwordLoginResetDelete(sql, {
    expiresAtLowerThan: new Date(),
  });

  eventStop(event);
}
