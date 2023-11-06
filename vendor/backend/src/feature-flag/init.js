import { eventStart, eventStop, newEventFromEvent } from "@compas/stdlib";
import { multitenantRequireTenant } from "../multitenant/events.js";
import { importProjectResource } from "../util.js";
import { featureFlagCurrent, featureFlagSyncAvailableFlags } from "./events.js";

/**
 * Initialize feature flag system.
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @returns {Promise<void>}
 */
export async function featureFlagInit(event, sql) {
  eventStart(event, "featureFlag.init");

  await featureFlagSyncAvailableFlags(newEventFromEvent(event), sql);

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

    ctx.body = await featureFlagCurrent(newEventFromEvent(ctx.event), tenant);

    if (next) {
      return next();
    }
  };

  eventStop(event);
}
