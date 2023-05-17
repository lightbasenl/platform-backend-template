import { AppError, eventStart, eventStop, isNil, uuid } from "@compas/stdlib";
import { queueWorkerAddJob } from "@compas/store";
import {
  globalEventMetadata,
  queries,
  queryUser,
  userBuilder,
} from "../../services.js";
import { authEventNames, authStringPrefixes } from "../constants.js";

/**
 * Let an anonymous based user login with the specified token.
 *
 * Errors:
 * - `authAnonymousBased.login.unknownToken` -> can't find a user with the provided
 *   token
 * - `authAnonymousBased.login.tokenIsNotAllowedToLogin` -> token is not allowed to
 *   log in.
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {QueryResultBackendTenant} tenant
 * @param {AuthAnonymousBasedLoginBody} body
 * @returns {Promise<QueryResultAuthUser>}
 */
export async function authAnonymousBasedLogin(event, sql, tenant, body) {
  eventStart(event, "authAnonymousBased.login");

  const [user] = await queryUser({
    ...userBuilder,
    where: {
      viaAnonymousLogin: {
        where: {
          loginToken: body.token,
        },
      },
      viaTenants: {
        where: {
          tenant: tenant.id,
        },
      },
    },
  }).exec(sql);

  if (isNil(user)) {
    throw AppError.validationError("authAnonymousBased.login.unknownToken");
  }

  // @ts-expect-error
  if (!user.anonymousLogin.isAllowedToLogin) {
    throw AppError.validationError(
      "authAnonymousBased.login.tokenIsNotAllowedToLogin",
    );
  }

  user.lastLogin = new Date();
  await queries.userUpdate(sql, {
    update: {
      lastLogin: new Date(),
    },
    where: {
      id: user.id,
    },
  });

  eventStop(event);

  return user;
}

/**
 * Converts an anonymous based user to a session object. This allows the platform
 * to create custom flows that create an ' internal' anonymous user and set their
 * own `ctx.session` with the returned object. Call {@link authSaveSession} afterwards.
 *
 * Errors:
 * - `authAnonymousBased.getSessionForUser.userWithoutAnonymousLogin` -> user does
 *   not have an anonymous login
 *
 * @param {QueryResultAuthUser} user
 * @returns {AuthSession}
 */
export function authAnonymousBasedGetSessionForUser(user) {
  if (isNil(user?.anonymousLogin?.loginToken)) {
    throw AppError.validationError(
      "authAnonymousBased.getSessionForUser.userWithoutAnonymousLogin",
    );
  }

  return {
    type: "user",
    loginType: "anonymousBased",
    userId: user.id,
  };
}

/**
 * @typedef {object} AuthAnonymousBasedRegisterBody
 * @property {boolean} isAllowedToLogin
 * @property {object|undefined} [eventMetadata]
 */

/**
 * Adds an anonymous login to the provided user. By setting `isAllowedToLogin` to
 * true, the token can be shared via a magic link and `apiAuthAnonymousBasedLogin`
 * can be called. When `isAllowedToLogin` is set to false, it is a session only
 * user.
 *
 * Errors:
 * - `authAnonymousBased.register.invalidIsAllowedToLogin` -> provide an object as
 *   the last argument with the `isAllowedToLogin` property with a boolean value.
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {AuthUser} dbUser
 * @param {AuthAnonymousBasedRegisterBody} body
 * @returns {Promise<QueryResultAuthUser>}
 */
export async function authAnonymousBasedRegister(event, sql, dbUser, body) {
  eventStart(event, "authAnonymousBased.register");

  if (typeof body?.isAllowedToLogin !== "boolean") {
    throw AppError.validationError(`${event.name}.invalidIsAllowedToLogin`);
  }

  // @ts-expect-error
  //
  // SQL should be in a transaction
  if (typeof sql.savepoint !== "function") {
    throw AppError.serverError({
      message: "Function should be called inside a sql transaction.",
    });
  }

  if (isNil(dbUser?.id)) {
    throw AppError.validationError(`${event.name}.missingUser`);
  }

  const [anonymousLogin] = await queries.anonymousLoginInsert(sql, {
    isAllowedToLogin: body.isAllowedToLogin,
    user: dbUser.id,
    loginToken: `${authStringPrefixes.anonymousToken}-${uuid()}`,
  });

  await queueWorkerAddJob(sql, {
    name: authEventNames.authAnonymousBasedUserRegistered,
    priority: 4,
    data: {
      anonymousLoginId: anonymousLogin.id,
      metadata: {
        ...globalEventMetadata,
        ...(body.eventMetadata ?? {}),
      },
    },
  });

  const [user] = await queryUser({
    ...userBuilder,
    where: {
      id: dbUser.id,
    },
  }).exec(sql);

  eventStop(event);

  return user;
}
