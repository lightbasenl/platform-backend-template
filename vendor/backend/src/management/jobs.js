import { eventStart, eventStop, newEventFromEvent } from "@compas/stdlib";
import { queries } from "../services.js";
import { slackInvalidateConversations } from "../slack/events.js";
import { managementConstants } from "./constants.js";

/**
 * Remove all Lightbase management users. This should be executed daily.
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {StoreJob} job
 * @returns {Promise<void>}
 */
export async function managementInvalidateUsers(event, sql, { data }) {
  eventStart(event, "management.invalidateUsers");

  await queries.userDelete(sql, {
    viaRoles: {
      where: {
        viaRole: {
          where: {
            identifier: managementConstants.role,
          },
        },
      },
    },
    nameLike: "Lightbase management",
  });

  if (!data?.skipSlackInvalidations) {
    await slackInvalidateConversations(newEventFromEvent(event));
  }

  eventStop(event);
}
