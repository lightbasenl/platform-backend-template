import { createHmac, timingSafeEqual } from "node:crypto";
import {
  AppError,
  environment,
  eventStart,
  eventStop,
  isNil,
  newEventFromEvent,
} from "@compas/stdlib";
import {
  sessionStoreCreate,
  sessionStoreInvalidate,
  sessionStoreUpdate,
  sessionTransportLoadFromContext,
} from "@compas/store";
import { sessionStoreSettings, sessionTransportSettings } from "../services.js";
import { normalizeSessionErrorsToUnauthorizedAndThrow } from "../util.js";
import { sessionStoreObjectSymbol } from "./constants.js";

/**
 * Accept client side values from SSR requests, only if environment.SSR_KEY exists.
 * This way the SSR request can for example proxy client IP's in a 'safe' way.
 * The verification is based on HMAC-SHA512.
 *
 * Will only throw when the headerKey does not start with 'x-ssr'. Otherwise returns true
 * when the value at 'headerKey' is safe to use.
 *
 * Client code:
 * ```js
 * const val = req.headers["x-forwarded-for"];
 * const ip = (typeof val === "string" ? val.split(/\s*,\s*\/) : val ?? [])[0];
 *
 * const headers = {
 *   'X-SSR-Ip': ip,
 *   'X-SSR-Ip-Verification': env.SSR_KEY && ip
 *       ? createHmac("sha512", env.SSR_KEY).update(ip).digest("base64")
 *       : undefined,
 * };
 * ```
 *
 * @param {import("@compas/server").Context<any, any, any>} ctx
 * @param {string} headerKey
 * @returns {boolean}
 */
function authVerifyServerSideRenderingHeader(ctx, headerKey) {
  if (isNil(environment.SSR_KEY) || typeof ctx?.request?.get !== "function") {
    return false;
  }

  if (
    !headerKey.toLowerCase().startsWith("x-ssr") ||
    headerKey.toLowerCase() === "x-ssr"
  ) {
    throw AppError.serverError({
      message:
        "'headerKey' as provided to 'authVerifyServerSideRenderingHeader' should start with 'x-ssr' (case insensitive) but may nog equal to 'x-ssr'.",
    });
  }

  const headerValue = ctx.request.get(headerKey);
  const headerVerification = ctx.request.get(`${headerKey}-verification`);

  if (!(headerValue?.length > 0)) {
    return false;
  }
  if (!(headerVerification?.length > 0)) {
    return false;
  }

  const computedHmac = createHmac("sha512", environment.SSR_KEY)
    .update(headerValue)
    .digest();
  const verifyBuffer = Buffer.from(headerVerification, "base64");

  if (computedHmac.length !== verifyBuffer.length) {
    return false;
  }

  return timingSafeEqual(computedHmac, verifyBuffer);
}

/**
 * Check if the request IP is in one of the allowed IP addresses. Uses 'X-SSR-Ip'
 * as the server side rendering header, to pass in the real client ip.
 *
 * Accept client side values from SSR requests, only if environment.SSR_KEY exists.
 * This way the SSR request can for example proxy client IP's in a 'safe' way. The
 * verification is based on HMAC-SHA512.
 *
 * Errors:
 * - `auth.ipCheck.invalid` -> the found IP address is not part of the `allowedIps`
 *   array.
 *
 * @example Client side way of passing the x-ssr-ip header
 * ```
 *  const val = req.headers["x-forwarded-for"];
 *  const ip = (typeof val === "string" ? val.split(/\s*,\s*\/) : val ?? [])[0];
 *  const headers = {
 *   "X-SSR-Ip": ip,
 *   "X-SSR-Ip-Verification":
 *     env.SSR_KEY && ip
 *       ? createHmac("sha512", env.SSR_KEY).update(ip).digest("base64")
 *       : undefined,
 *   };
 * ```
 * @param {import("@compas/server").Context<any, any, any>} ctx
 * @param {string[]} allowedIps
 */
export function authIpCheck(ctx, allowedIps) {
  let trustedIp = ctx.ip;
  if (authVerifyServerSideRenderingHeader(ctx, "x-ssr-ip")) {
    trustedIp = ctx.request.get("x-ssr-ip");
  }

  if (!(allowedIps ?? []).includes(trustedIp)) {
    throw new AppError("auth.ipCheck.invalid", 403, {});
  }
}

/**
 * Load a session on to `ctx.session` based on `ctx.headers.authorization`. Expects
 * the `Authorization` header to be in a `Bearer jwt` format.
 *
 * Errors:
 * - `sessionStore.verifyAndDecodeJWT.missingTOken` -> when the authorization
 *   header are missing or in an invalid format
 * - Inherits errors from
 *   [`sessionStoreGet`](https://compasjs.com/features/session-handling.html#sessionstoreget)
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {import("@compas/server").Context<any, any, any>} ctx
 * @returns {Promise<AuthSession>}
 */
export async function authLoadSession(event, sql, ctx) {
  eventStart(event, "auth.loadSession");

  const sessionResult = await sessionTransportLoadFromContext(
    newEventFromEvent(event),
    sql,
    ctx,
    sessionTransportSettings,
  );

  if (sessionResult.error) {
    normalizeSessionErrorsToUnauthorizedAndThrow(sessionResult.error);
  }

  ctx[sessionStoreObjectSymbol] = sessionResult.value.session;
  ctx.session = ctx[sessionStoreObjectSymbol].data;

  eventStop(event);

  return ctx.session;
}

/**
 * Try to load a session, returns undefined otherwise.
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {import("@compas/server").Context<any, any, any>} ctx
 * @returns {Promise<AuthSession|undefined>}
 */
export async function authLoadSessionOptionally(event, sql, ctx) {
  eventStart(event, "auth.loadSessionOptionally");

  try {
    const result = await authLoadSession(newEventFromEvent(event), sql, ctx);
    eventStop(event);

    return result;
  } catch {
    eventStop(event);

    return undefined;
  }
}

/**
 * Compat layer for saving `ctx.session`, for sessions loaded by `authLoadSession`.
 * Should only be used if there is a way to change the session from platform code.
 *
 * Errors:
 * - Inherits errors from
 * [`sessionStoreCreate`](https://compasjs.com/features/session-handling.html#sessionstorecreate),
 * [`sessionStoreInvalidate`](https://compasjs.com/features/session-handling.html#sessionstoreinvalidate)
 * and
 * [`sessionStoreUpdate`](https://compasjs.com/features/session-handling.html#sessionstoreupdate)
 *
 * @example
 * ```js
 * // Start an anonymous user session
 * fooHandlers.start = async (ctx, next) => {
 *   const anonymousUser = await authAnonymousBasedRegister(/* ... *\/);
 *
 *   if (ctx.session) {
 *     // Remove existing session
 *     ctx.session = undefined;
 *     await authSaveSession(newEventFromEvent(ctx.event), sql, ctx);
 *   }
 *
 *   ctx.session = authAnonymousBasedGetSessionForUser(anonymousUser);
 *
 *   const tokens = await authSaveSession(newEventFromEvent(ctx.event), sql, ctx);
 *   ctx.body = tokens;
 *
 *   if (next) { return next(); }
 * };
 * ```
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {import("@compas/server").Context<any, any, any>} ctx
 * @returns {Promise<AuthTokenPair|undefined>}
 */
export async function authSaveSession(event, sql, ctx) {
  eventStart(event, "auth.saveSession");

  if (isNil(ctx[sessionStoreObjectSymbol]) && isNil(ctx.session)) {
    // No session loaded & no session created
    eventStop(event);
    return;
  }

  if (isNil(ctx[sessionStoreObjectSymbol])) {
    // No session loaded, but session created
    const createResult = await sessionStoreCreate(
      newEventFromEvent(event),
      sql,
      sessionStoreSettings,
      ctx.session,
    );

    if (createResult.error) {
      throw createResult.error;
    }

    eventStop(event);

    return createResult.value;
  }

  if (isNil(ctx.session)) {
    // Session loaded, but data object destroyed
    const invalidateResult = await sessionStoreInvalidate(
      newEventFromEvent(event),
      sql,
      ctx[sessionStoreObjectSymbol],
    );

    if (invalidateResult.error) {
      throw invalidateResult.error;
    }

    delete ctx[sessionStoreObjectSymbol];

    eventStop(event);
    return;
  }

  const updateResult = await sessionStoreUpdate(
    newEventFromEvent(event),
    sql,
    ctx[sessionStoreObjectSymbol],
  );

  if (updateResult.error) {
    throw updateResult.error;
  }

  eventStop(event);
}

/**
 * Handle auth tokens in LPC based projects.
 *
 * - Intercepts responses to catch token pairs
 *   - Access token is injected as a default header on the provided `axiosInstance`
 * - Intercepts `/auth/logout` requests and destroys the known tokens
 *
 * We don't try to refresh tokens in the interceptors, since tests should be fast
 * enough to never hit the access token max age.
 *
 * @param {import("axios").AxiosInstance} axiosInstance
 */
export function authInjectTokenInterceptors(axiosInstance) {
  axiosInstance.interceptors.response.use((response) => {
    if (response?.data?.accessToken && response.data?.refreshToken) {
      axiosInstance.defaults.headers.authorization = `Bearer ${response.data.accessToken}`;
    }

    // @ts-expect-error
    if (response.config.url.includes("auth/logout")) {
      delete axiosInstance.defaults.headers.authorization;
    }

    return response;
  });
}
