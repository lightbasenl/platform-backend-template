import {
  AppError,
  eventStart,
  eventStop,
  isNil,
  newEventFromEvent,
} from "@compas/stdlib";
import { sessionStoreObjectSymbol } from "./constants.js";
import { authSaveSession } from "./events.js";

/**
 * Start an impersonating session. This allows a user to act on behalf an other user.
 *
 * We expect the caller to have loaded the session via 'authRequireUser' or equivalent.
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {import("koa").Context<any, any, any>} ctx
 * @param {QueryResultAuthUser} user
 * @returns {Promise<void>}
 */
export async function authImpersonateStartSession(event, sql, ctx, user) {
  eventStart(event, "authImpersonate.startSession");

  if (isNil(ctx[sessionStoreObjectSymbol])) {
    throw AppError.validationError(`${event.name}.invalid`, {
      message:
        "Context doesn't have a session attached, make sure to load it via 'backendGetTenantAndUser' or 'authRequireUser'.",
    });
  }

  if (ctx.session.type !== "user") {
    throw AppError.validationError(`${event.name}.invalid`, {
      message:
        "Context has an invalid session attached, make sure that the user is not in a 2FA or update password flow.",
    });
  }

  /**
   * @type {QueryResultStoreSessionStore}
   */
  const session = ctx[sessionStoreObjectSymbol];

  session.data.impersonatorUserId = session.data.userId;
  session.data.userId = user.id;

  await authSaveSession(newEventFromEvent(event), sql, ctx);

  eventStop(event);
}

/**
 * Check if an impersonating session is going on.
 *
 * @param {import("koa").Context<any, any, any>} ctx
 * @returns {boolean}
 */
export function authImpersonateIsInSession(ctx) {
  return !isNil(ctx.session.impersonatorUserId);
}

/**
 * Stop an impersonating session.
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {import("koa").Context<any, any, any>} ctx
 * @returns {Promise<void>}
 */
export async function authImpersonateStopSession(event, sql, ctx) {
  eventStart(event, "authImpersonate.stopSession");

  if (
    isNil(ctx[sessionStoreObjectSymbol]) ||
    isNil(ctx.session?.impersonatorUserId)
  ) {
    throw AppError.validationError(`${event.name}.invalid`, {
      message:
        "Context doesn't have a session attached, make sure to load it via 'backendGetTenantAndUser' or 'authRequireUser'.",
    });
  }

  /**
   * @type {QueryResultStoreSessionStore}
   */
  const session = ctx[sessionStoreObjectSymbol];

  session.data.userId = session.data.impersonatorUserId;
  delete session.data.impersonatorUserId;

  await authSaveSession(newEventFromEvent(event), sql, ctx);

  eventStop(event);
}
