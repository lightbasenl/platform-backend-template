import { eventStart, eventStop, newEventFromEvent } from "@compas/stdlib";
import { authLoadSessionOptionally } from "../auth/events.js";
import { multitenantRequireTenant } from "../multitenant/events.js";
import { sql } from "../services.js";
import { importProjectResource } from "../util.js";
import { featureFlagCurrent, featureFlagSyncAvailableFlags } from "./events.js";

/**
 * Initialize feature flag system.
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} initSql
 * @returns {Promise<void>}
 */
export async function featureFlagInit(event, initSql) {
  eventStart(event, "featureFlag.init");

  await featureFlagSyncAvailableFlags(newEventFromEvent(event), initSql);

  /**
   * @type {typeof
   *   import("../../../../src/generated/application/featureFlag/controller.js")}
   */
  const controller = await importProjectResource(
    "./src/generated/application/featureFlag/controller.js",
  );

  controller.featureFlagHandlers.current = async (ctx, next) => {
    const { tenant } = await multitenantRequireTenant(
      newEventFromEvent(ctx.event),
      ctx,
    );
    const session = await authLoadSessionOptionally(
      newEventFromEvent(ctx.event),
      sql,
      ctx,
    );

    ctx.body = await featureFlagCurrent(
      newEventFromEvent(ctx.event),
      tenant,
      session ? { id: session.userId } : undefined,
    );

    if (next) {
      return next();
    }
  };

  eventStop(event);
}
