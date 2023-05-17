import { newEventFromEvent } from "@compas/stdlib";
import { sessionStoreCreate, sessionStoreInvalidate } from "@compas/store";
import { multitenantRequireTenant } from "../../multitenant/events.js";
import { sessionStoreSettings, sql } from "../../services.js";
import {
  importProjectResource,
  normalizeSessionErrorsToUnauthorizedAndThrow,
} from "../../util.js";
import { sessionStoreObjectSymbol } from "../constants.js";
import { authSessionAppendDevice } from "../session/events.js";
import { authCombineUsers } from "../user.events.js";
import { authAnonymousBasedLogin } from "./events.js";

/**
 * @typedef {{}} AnonymousBasedSettings
 */

/**
 * @typedef {AnonymousBasedSettings & {
 *   determineTwoStepFunction: AuthDetermineTwoStepCheckFunction,
 *   combineUserCallbacks?: AuthCombineUserCallbacks,
 * }} InternalAnonymousBasedSettings
 */

/**
 *
 * @param {InternalAnonymousBasedSettings} settings
 * @returns {Promise<void>}
 */
export async function applyAnonymousBasedController(settings) {
  /**
   * @type {typeof
   *   import("../../../../../src/generated/application/authAnonymousBased/controller.js")}
   */
  const controller = await importProjectResource(
    "./src/generated/application/authAnonymousBased/controller.js",
  );

  controller.authAnonymousBasedHandlers.login = async (ctx, next) => {
    const { tenant } = await multitenantRequireTenant(
      newEventFromEvent(ctx.event),
      ctx,
    );

    await sql.begin(async (sql) => {
      const user = await sql.savepoint(async (sql) => {
        const user = await authAnonymousBasedLogin(
          newEventFromEvent(ctx.event),
          sql,
          tenant,
          ctx.validatedBody,
        );

        return await authCombineUsers(
          newEventFromEvent(ctx.event),
          sql,
          ctx,
          tenant,
          user,
          settings.combineUserCallbacks,
        );
      });

      if (ctx[sessionStoreObjectSymbol]) {
        const invalidateResult = await sessionStoreInvalidate(
          newEventFromEvent(ctx.event),
          sql,
          ctx[sessionStoreObjectSymbol],
        );

        if (invalidateResult.error) {
          normalizeSessionErrorsToUnauthorizedAndThrow(invalidateResult.error);
        }
      }

      const set2FACheck =
        typeof settings.determineTwoStepFunction === "function" &&
        (settings.determineTwoStepFunction(user) ?? {});

      const newSessionResult = await sessionStoreCreate(
        newEventFromEvent(ctx.event),
        sql,
        sessionStoreSettings,
        {
          type: "user",
          loginType: "anonymousBased",
          ...set2FACheck,
          userId: user.id,
        },
      );

      if (newSessionResult.error) {
        normalizeSessionErrorsToUnauthorizedAndThrow(newSessionResult.error);
      }

      await authSessionAppendDevice(
        newEventFromEvent(ctx.event),
        sql,
        user.id,
        newSessionResult.value.accessToken,
        ctx.validatedBody.device,
      );

      ctx.body = newSessionResult.value;
    });

    if (next) {
      return next();
    }
  };
}
