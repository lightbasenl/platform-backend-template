import { eventStart, eventStop, newEventFromEvent } from "@compas/stdlib";
import { multitenantRequireTenant } from "../multitenant/events.js";
import { sql as serviceSql } from "../services.js";
import { importProjectResource } from "../util.js";
import {
  managementFeatureFlagCrudModifier,
  managementRequestMagicLink,
} from "./events.js";

/**
 * Initialize management system
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @returns {Promise<void>}
 */
export async function managementInit(event) {
  eventStart(event, "management.init");

  /**
   * @type {typeof
   *   import("../../../../src/generated/application/management/controller.js")}
   */
  const controller = await importProjectResource(
    "./src/generated/application/management/controller.js",
  );

  controller.managementHandlers.requestMagicLink = async (ctx, next) => {
    const resolvedTenant = await multitenantRequireTenant(
      newEventFromEvent(ctx.event),
      ctx,
    );

    ctx.body = await serviceSql.begin((sql) =>
      managementRequestMagicLink(
        newEventFromEvent(ctx.event),
        sql,
        resolvedTenant,
        ctx.validatedBody,
      ),
    );

    if (next) {
      return next();
    }
  };

  /**
   * @type {typeof
   *   import("../../../../src/generated/application/managementFeatureFlag/crud.js")}
   */
  const controllerFeatureFlag = await importProjectResource(
    "./src/generated/application/managementFeatureFlag/crud.js",
  );

  controllerFeatureFlag.managementFeatureFlagRegisterCrud({
    sql: serviceSql,
    managementFeatureFlagListPreModifier: managementFeatureFlagCrudModifier,
    managementFeatureFlagSinglePreModifier: managementFeatureFlagCrudModifier,
    managementFeatureFlagUpdatePreModifier: managementFeatureFlagCrudModifier,
  });

  eventStop(event);
}
