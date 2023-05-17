import { newEventFromEvent } from "@compas/stdlib";
import { backendGetTenantAndUser } from "../../events.js";
import { importProjectResource } from "../../util.js";
import { sessionStoreObjectSymbol } from "../constants.js";
import {
  authSessionList,
  authSessionLogout,
  authSessionSetDeviceNotificationToken,
} from "./events.js";

/**
 * @typedef {{}} SessionSettings
 */

/**
 * @typedef {SessionSettings & {
 * }} InternalSessionSettings
 */

/**
 *
 * @param {InternalSessionSettings} settings
 * @returns {Promise<void>}
 */
export async function applySessionController(settings) {
  if (settings) {
    // eslint ignore yes
  }

  /**
   * @type {typeof
   *   import("../../../../../src/generated/application/session/controller.js")}
   */
  const controller = await importProjectResource(
    "./src/generated/application/session/controller.js",
  );

  controller.sessionHandlers.list = async (ctx, next) => {
    const { user } = await backendGetTenantAndUser(ctx, {});
    const session = ctx[sessionStoreObjectSymbol];

    ctx.body = await authSessionList(
      newEventFromEvent(ctx.event),
      user,
      session,
    );

    if (next) {
      return next();
    }
  };

  controller.sessionHandlers.setDeviceNotificationToken = async (ctx, next) => {
    const { user } = await backendGetTenantAndUser(ctx, {});
    const session = ctx[sessionStoreObjectSymbol];

    await authSessionSetDeviceNotificationToken(
      newEventFromEvent(ctx.event),
      user,
      session,
      ctx.validatedBody,
    );

    ctx.body = {};

    if (next) {
      return next();
    }
  };

  controller.sessionHandlers.logout = async (ctx, next) => {
    const { user } = await backendGetTenantAndUser(ctx, {});
    const session = ctx[sessionStoreObjectSymbol];

    await authSessionLogout(
      newEventFromEvent(ctx.event),
      user,
      session,
      ctx.validatedBody,
    );

    ctx.body = {};

    if (next) {
      return next();
    }
  };
}
