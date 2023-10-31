import {
  AppError,
  eventStart,
  eventStop,
  isNil,
  isPlainObject,
  newEventFromEvent,
  uuid,
} from "@compas/stdlib";
import { query, queueWorkerAddJob } from "@compas/store";
import speakeasy from "speakeasy";
import {
  globalEventMetadata,
  queries,
  queryPermission,
  queryRole,
  queryTenant,
  queryUser,
  userBuilder,
} from "../services.js";
import { authAnonymousBasedRegister } from "./anonymous-based/events.js";
import { authEventNames, authStringPrefixes } from "./constants.js";
import { authDigidBasedRegister } from "./digid-based/events.js";
import { authLoadSession, authLoadSessionOptionally } from "./events.js";
import {
  authKeycloakBasedCheckUnique,
  authKeycloakBasedRegister,
} from "./keycloak-based/events.js";
import {
  authPasswordBasedCheckUnique,
  authPasswordBasedRegister,
} from "./password-based/events.js";
import {
  authPermissionUserSummary,
  authPermissionUserSyncRoles,
} from "./permissions/events.js";

const testBsnSet = new Set();

const authQueries = {
  /**
   * List all relations referencing 'user'.'id'.
   * Use relations as:
   *
   * - table: result[0].table
   * - column: result[0].col[0]
   *
   * @returns {import("@compas/store").QueryPart<any>}
   */
  listUserIdReferences: () => query`
    SELECT (
             SELECT r.relname
             FROM pg_class r
             WHERE r.OID = c.conrelid
           ) AS "table",
           (
             SELECT array_agg(attname)
             FROM pg_attribute
             WHERE attrelid = c.conrelid AND ARRAY [attnum] <@ c.conkey
           ) AS col,
           (
             SELECT r.relname
             FROM pg_class r
             WHERE r.OID = c.confrelid
           ) AS ftable
    FROM pg_constraint c
    WHERE
        c.confrelid = (
        SELECT OID
        FROM pg_class
        WHERE relname = 'user'
      )
    AND c.confkey @> (
      SELECT array_agg(attnum)
      FROM pg_attribute
      WHERE attname = 'id' AND attrelid = c.confrelid
    );

  `,
};

/**
 * @typedef {object} AuthRequireUserOptions
 *
 * Various options to add some logic to 'authRequireUser'
 * @property {string|undefined} [eventKey] Custom event key
 * @property {boolean|undefined} [skipSessionIsUserCheck] If a route should work when
 *   two-step is active but not yet verified.
 * @property {boolean|undefined} [requireAnonymousBased]
 * @property {boolean|undefined} [requireDigidBased]
 * @property {boolean|undefined} [requireKeycloakBased]
 * @property {boolean|undefined} [requirePasswordBased]
 * @property {AuthPermissionIdentifier[]|undefined} [requiredPermissions]
 */

/**
 * @typedef {object} AuthCreateUserOptions
 * @property {import("./anonymous-based/events").
 * AuthAnonymousBasedRegisterBody|undefined} [withAnonymousBased]
 * @property {import("./digid-based/events").
 * AuthDigidBasedRegisterBody|undefined} [withDigidBased]
 * @property {AuthKeycloakBasedCreateBody|undefined} [withKeycloakBased]
 * @property {import("./password-based/events").
 * AuthPasswordBasedRegisterBody|undefined} [withPasswordBased]
 * @property {import(
 *  "./permissions/events").AuthPermissionUserSyncRolesOptions
 * } [withPermissionRoles]
 * @property {AuthMultitenantOptions} [withMultitenant]
 */

/**
 * @typedef {object} AuthMultitenantOptions
 * @property {boolean} [syncUsersAcrossAllTenants] Adds the created users to all known
 *   tenants.
 */

/**
 * @typedef {object} AuthCombineUserCallbacks
 * @property {(event: import("@compas/stdlib").InsightEvent, sql:
 *   import("@compas/store").Postgres, existingSession:
 *   AuthSession, oldUser:
 *   QueryResultAuthUser, newUser:
 *   QueryResultAuthUser
 *   ) => Promise<boolean>|boolean}  shouldCombineUsers
 * @property {(event: import("@compas/stdlib").InsightEvent, sql:
 *   import("@compas/store").Postgres, oldUser:
 *   QueryResultAuthUser, newUser:
 *   QueryResultAuthUser
 *   ) => Promise<void>|void} [beforeUserCombine]
 * @property {(event: import("@compas/stdlib").InsightEvent, sql:
 *   import("@compas/store").Postgres, oldUser:
 *   QueryResultAuthUser, newUser:
 *   QueryResultAuthUser
 *   ) => Promise<void>|void} [afterUserCombine]
 */

/**
 * Create a new user, and optionally pass it to various register functions. The `name` is
 * optional, but may be useful in combination with
 * `apiAuthUserList`.
 *
 * Requires to be run in a SQL transaction.
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {AuthUserInsertPartial} data
 * @param {AuthCreateUserOptions|undefined} [options]
 * @returns {Promise<QueryResultAuthUser>}
 */
export async function authCreateUser(event, sql, data, options) {
  eventStart(event, "auth.createUser");

  // @ts-expect-error
  //
  // SQL should be in a transaction
  if (typeof sql.savepoint !== "function") {
    throw AppError.serverError({
      message: "Function should be called inside a sql transaction.",
    });
  }

  /** @type {QueryResultAuthUser[]} */
  let [user] = await queries.userInsert(sql, data);
  user.roles = [];
  user.tenants = [];

  if (options?.withMultitenant) {
    if (options.withMultitenant.syncUsersAcrossAllTenants) {
      await query`INSERT INTO "userTenant" ("user", "tenant")
                  SELECT ${user.id}, t.id
                  FROM "tenant" t`.exec(sql);

      [user] = await queryUser({
        ...userBuilder,
        where: {
          id: user.id,
        },
      }).exec(sql);
    }
  }

  if (options?.withAnonymousBased) {
    user = await authAnonymousBasedRegister(
      newEventFromEvent(event),
      sql,
      user,
      options.withAnonymousBased,
    );
  }

  if (options?.withDigidBased) {
    user = await authDigidBasedRegister(
      newEventFromEvent(event),
      sql,
      user,
      options.withDigidBased,
    );
  }

  if (options?.withKeycloakBased) {
    user = await authKeycloakBasedRegister(
      newEventFromEvent(event),
      sql,
      user,
      options.withKeycloakBased,
    );
  }

  if (options?.withPasswordBased) {
    user = await authPasswordBasedRegister(
      newEventFromEvent(event),
      sql,
      user,
      options.withPasswordBased,
    );
  }

  // We don't allow creating with permissions, since the user doesn't have permissions,
  // and we can't just create a role with the specified permissions
  if (options?.withPermissionRoles) {
    user.roles = [];
    user = await authPermissionUserSyncRoles(
      newEventFromEvent(event),
      sql,
      user,
      options.withPermissionRoles,
    );
  }

  await authPasswordBasedCheckUnique(newEventFromEvent(event), sql, user);
  await authKeycloakBasedCheckUnique(newEventFromEvent(event), sql, user);

  eventStop(event);

  return user;
}

/**
 * Create a new test user based on the provided options.
 * By default, will just create an 'empty' user.
 *
 * Defaults:
 * - withAnonymousBased.isAllowedToLogin = true
 * - withPasswordBased.isVerified = true
 * - withTotpProvider = disabled
 * - withTotpProvider.isVerified = true
 * - withMultitenant.syncUsersAcrossAllTenants = isNil(withMultitenant?.tenants)
 *
 * Default created values:
 * - passwordBased password is `Test123!` with a low hash cost, so test logins are fast.
 * - The password on the returned `user.passwordLogin.password` is overwritten to
 * contain the plain test password.
 * - passwordBased if not verified, the verify token expires in a month.
 * - totpProvider a random secret is generated
 *
 * Note that when permissions are provided, they are all assigned to a
 * new role. To ensure that the user doesn't have more permissions than requested.
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {{
 *   withAnonymousBased?: {
 *     isAllowedToLogin?: boolean
 *   },
 *   withDigidBased?: {},
 *   withKeycloakBased?: {},
 *   withPasswordBased?: {
 *     isVerified?: boolean,
 *     isOtpEnabled?: boolean,
 *   },
 *   withTotpProvider?: {
 *     isVerified?: boolean,
 *   },
 *   withPermissions?: {
 *     permissions?: AuthPermissionIdentifier[],
 *     roles?: string[],
 *   },
 *   withMultitenant?: {
 *     syncUsersAcrossAllTenants?: boolean,
 *     tenants?: string[],
 *   }
 * }} options
 * @returns {Promise<QueryResultAuthUser>}
 */
export async function authTestCreateUser(event, sql, options = {}) {
  eventStart(event, "auth.testCreateUser");

  const authPlainPassword = "Test123!";
  const authEncryptedPassword =
    "$2b$04$oOxbHq7y2bHfatXTs8IPQOWFH3m4Wotw9EmB6ABWjy4ZjBEU8M3wG";

  const isObjectCheck = (key) => {
    if (!isNil(options[key]) && !isPlainObject(options[key])) {
      throw AppError.validationError(`auth.createTestUser.${key}`, {
        message: `If '${key}' is specified, it should be an object.`,
      });
    }
  };

  const randomBsn = () => {
    const d = String(Date.now() - Math.floor(Math.random() * 1000));

    const bsn = d.substring(d.length - 9);

    if (testBsnSet.has(bsn)) {
      return randomBsn();
    }

    testBsnSet.add(bsn);
    return bsn;
  };

  isObjectCheck("withPermissions");
  isObjectCheck("withAnonymousBased");
  isObjectCheck("withDigidBased");
  isObjectCheck("withKeycloakBased");
  isObjectCheck("withPasswordBased");
  isObjectCheck("withTotpProvider");
  isObjectCheck("withMultitenant");

  const user = await sql.begin(async (sql) => {
    const user = await authCreateUser(
      newEventFromEvent(event),
      sql,
      {
        name: `Test user ${uuid()}`,
      },
      {
        withMultitenant: {
          syncUsersAcrossAllTenants:
            options.withMultitenant?.syncUsersAcrossAllTenants ??
            isNil(options.withMultitenant?.tenants),
        },
      },
    );

    if (options.withAnonymousBased) {
      await queries.anonymousLoginInsert(sql, {
        user: user.id,
        loginToken: `${authStringPrefixes.anonymousToken}-${uuid()}`,
        isAllowedToLogin: options.withAnonymousBased.isAllowedToLogin ?? true,
      });
    }

    if (options.withDigidBased) {
      await queries.digidLoginInsert(sql, {
        user: user.id,
        bsn: randomBsn(),
      });
    }

    if (options.withKeycloakBased) {
      await queries.keycloakLoginInsert(sql, {
        user: user.id,
        email: `${uuid()}@lpc-test.nl`,
      });
    }

    if (options.withPasswordBased) {
      const [passwordLogin] = await queries.passwordLoginInsert(sql, {
        user: user.id,
        email: `${uuid()}@lpc-test.nl`,
        password: authEncryptedPassword,
        verifiedAt:
          options.withPasswordBased.isVerified === false
            ? undefined
            : new Date(),
        otpEnabledAt: options.withPasswordBased.isOtpEnabled
          ? new Date()
          : undefined,
      });

      if (options.withPasswordBased.isVerified === false) {
        const expiresAt = new Date();
        expiresAt.setUTCMonth(expiresAt.getUTCMonth() + 1);

        await queries.passwordLoginResetInsert(sql, {
          login: passwordLogin.id,
          resetToken: `${authStringPrefixes.passwordVerifyToken}-${uuid()}`,
          shouldSetPassword: false,
          expiresAt,
        });
      }
    }

    if (options.withTotpProvider) {
      await queries.totpSettingsInsert(sql, {
        user: user.id,
        secret: speakeasy.generateSecret({}).base32,
        verifiedAt:
          options.withTotpProvider.isVerified !== false
            ? new Date()
            : undefined,
      });
    }

    if (options.withPermissions) {
      const [role] = await queries.roleInsert(sql, {
        identifier: uuid(),
      });

      const permissions = [];

      for (const permission of options.withPermissions.permissions ?? []) {
        let [permissionObject] = await queryPermission({
          where: {
            identifier: permission,
          },
        }).exec(sql);

        if (!permissionObject) {
          const [dbPermissionObject] = await queries.permissionInsert(sql, {
            identifier: permission,
          });
          permissionObject = dbPermissionObject;
        }

        permissions.push({ role: role.id, permission: permissionObject.id });
      }

      if (permissions.length > 0) {
        await queries.userRoleInsert(sql, { user: user.id, role: role.id });
        await queries.rolePermissionInsert(sql, permissions);
      }

      for (const role of options.withPermissions.roles ?? []) {
        const [dbRole] = await queryRole({
          where: {
            identifier: role,
          },
        }).exec(sql);

        if (dbRole) {
          await queries.userRoleInsert(sql, {
            user: user.id,
            role: dbRole.id,
          });
        }
      }
    }

    if (options.withMultitenant) {
      if (Array.isArray(options.withMultitenant.tenants)) {
        const tenants = await queryTenant({
          where: {
            nameIn: options.withMultitenant.tenants,
          },
        }).exec(sql);

        await queries.userTenantInsert(
          sql,
          tenants.map((it) => ({
            user: user.id,
            tenant: it.id,
          })),
        );
      }
    }

    const [dbUser] = await queryUser({
      ...userBuilder,
      where: {
        id: user.id,
      },
    }).exec(sql);

    return dbUser;
  });

  if (options.withPasswordBased) {
    // @ts-expect-error
    user.passwordLogin.password = authPlainPassword;
  }

  eventStop(event);

  return user;
}

/**
 * Require a user based on the passed in user information.
 * The preferred way is to pass in the context, this way we can automatically load the
 * session and go from there.. Another option is to pass in a custom where object, so you
 * can use the same user object consistently in your project.
 *
 * By default adds a check on the tenant. You can disable this by passing in 'undefined'
 * as the tenant.
 *
 * Customizable `eventKey` can be set to a string to use as an error prefix and event
 * name. Defaults to
 *   `auth.requireUser`. Should only be set when `authRequireUser` is used to fetch a
 *   user, outside the session context. For example, an admin that needs to update some
 *   setting for a specific user. The admin is required by calling `authRequireUser`
 * without custom 'eventKey' value, but the other user gets a custom `eventKey`.
 *
 * The following things are checked:
 * - If [options.skipSessionIsUserCheck=false] is true and the request context is passed
 * in, the session may be from a partially authenticated user. This is useful for routes
 * that can be fetched before verifying the two-step authentication.
 * - If [options.requireAnonymousBased=false] is true and the request context is passed
 * in, the 'session.loginType' should be 'anonymousBased'.
 * - If [options.requireDigidBased=false] is true and the request context is passed
 * in, the 'session.loginType' should be 'digidBased'.
 * - If [options.requireKeycloakBased=false] is true and the request context is passed
 * in, the 'session.loginType' should be 'keycloakBased'.
 * - If [options.requirePasswordBased=false] is true and the request context is passed
 * in, the 'session.loginType' should be 'passwordBased'.
 *
 * Errors:
 * - Inherits errors from `authLoadSession`
 * - `$eventKey.missingUserId` -> missing `userId` argument, most likely caused by
 *   a missing session
 * - `$eventKey.invalidUser` -> user can't be found for the provided `userId`
 * - `$eventKey.incorrectSessionType` -> The session is not in the user state yet.
 *   Most likely has two-step authentication enabled.
 * - `$eventKey.incorrectLoginType` -> User logged in via a provider that is not
 *   supported for this route.
 * - `$eventKey.missingPermissions` -> User does not have all permissions
 *   necessary.
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {QueryResultBackendTenant|undefined} tenant
 * @param {import("@compas/server").Context<any, any, any>
 *   |string|AuthUserWhere}  contextUserIdOrWhere
 * @param {AuthRequireUserOptions} [options]
 * @returns {Promise<QueryResultAuthUser>}
 */
export async function authRequireUser(
  event,
  sql,
  tenant,
  contextUserIdOrWhere,
  options = {},
) {
  const eventKey = options.eventKey ?? "auth.requireUser";

  // This function is used both for authorization as well as application logic.
  // When the eventKey is customized we expect it is application logic.
  const errorStatus = eventKey === "auth.requireUser" ? 401 : 400;

  eventStart(event, eventKey);

  /** @type {AuthUserWhere} */
  const where = {};

  if (tenant?.id) {
    where.viaTenants = {
      where: {
        tenant: tenant.id,
      },
    };
  }

  if (contextUserIdOrWhere?.headers) {
    contextUserIdOrWhere = await authLoadSession(
      newEventFromEvent(event),
      sql,
      contextUserIdOrWhere,
    );
  }

  if (typeof contextUserIdOrWhere === "string") {
    where.id = contextUserIdOrWhere;
  } else if (typeof contextUserIdOrWhere?.userId === "string") {
    where.id = contextUserIdOrWhere.userId;
  } else if (isPlainObject(contextUserIdOrWhere)) {
    Object.assign(where, contextUserIdOrWhere);
  } else {
    throw new AppError(`${eventKey}.missingUserId`, errorStatus);
  }

  const isSessionObject = !!contextUserIdOrWhere?.userId;

  const users = await queryUser({
    ...userBuilder,
    where,
  }).exec(sql);

  // Don't allow many results
  if (users.length !== 1) {
    throw new AppError(`${eventKey}.invalidUser`, errorStatus);
  }

  const user = users[0];

  if (options.skipSessionIsUserCheck !== true && isSessionObject) {
    if (contextUserIdOrWhere.type !== "user") {
      throw AppError.validationError(`${eventKey}.incorrectSessionType`, {
        expectedType: "user",
      });
    }
  }

  if (options.requireAnonymousBased === true && isSessionObject) {
    if (contextUserIdOrWhere.loginType !== "anonymousBased") {
      throw AppError.validationError(`${eventKey}.incorrectLoginType`, {
        expectedLoginType: "anonymousBased",
      });
    }
  }

  if (options.requireDigidBased === true && isSessionObject) {
    if (contextUserIdOrWhere.loginType !== "digidBased") {
      throw AppError.validationError(`${eventKey}.incorrectLoginType`, {
        expectedLoginType: "digidBased",
      });
    }
  }

  if (options.requireKeycloakBased === true && isSessionObject) {
    if (contextUserIdOrWhere.loginType !== "keycloakBased") {
      throw AppError.validationError(`${eventKey}.incorrectLoginType`, {
        expectedLoginType: "keycloakBased",
      });
    }
  }

  if (options.requirePasswordBased === true && isSessionObject) {
    if (contextUserIdOrWhere.loginType !== "passwordBased") {
      throw AppError.validationError(`${eventKey}.incorrectLoginType`, {
        expectedLoginType: "passwordBased",
      });
    }
  }

  if (
    options.requiredPermissions &&
    !Array.isArray(options.requiredPermissions)
  ) {
    throw AppError.serverError({
      message: "'requiredPermissions' should be an array!",
    });
  }

  if (
    Array.isArray(options.requiredPermissions) &&
    options.requiredPermissions.length > 0
  ) {
    const permissionSet = new Set();
    // @ts-expect-error
    for (const role of user.roles) {
      // @ts-expect-error
      for (const rolePermission of role.role.permissions) {
        permissionSet.add(rolePermission.permission.identifier);
      }
    }

    const missingPermissions = [];
    for (const requiredPermission of options.requiredPermissions) {
      if (!permissionSet.has(requiredPermission)) {
        missingPermissions.push(requiredPermission);
      }
    }

    if (missingPermissions.length > 0) {
      throw AppError.validationError(`${eventKey}.missingPermissions`, {
        missingPermissions,
      });
    }
  }

  eventStop(event);

  return user;
}

/**
 * Add all information from 'oldUser' to 'newUser'.
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {import("@compas/server").Context<any, any, any>} ctx
 * @param {QueryResultBackendTenant} tenant
 * @param {QueryResultAuthUser} newUser
 * @param {AuthCombineUserCallbacks|undefined} [callbacks]
 * @returns {Promise<QueryResultAuthUser>}
 */
export async function authCombineUsers(
  event,
  sql,
  ctx,
  tenant,
  newUser,
  callbacks,
) {
  eventStart(event, "auth.combineUsers");

  if (isNil(callbacks?.shouldCombineUsers)) {
    eventStop(event);
    return newUser;
  }

  const existingSession = await authLoadSessionOptionally(
    newEventFromEvent(event),
    sql,
    ctx,
  );

  if (isNil(existingSession)) {
    eventStop(event);
    return newUser;
  }

  let oldUser = undefined;

  try {
    oldUser = await authRequireUser(
      newEventFromEvent(event),
      sql,
      tenant,
      existingSession,
      {},
    );
  } catch {
    eventStop(event);
    return newUser;
  }

  if (oldUser.id === newUser.id) {
    // Skip combining users since it is already the same user
    eventStop(event);
    return newUser;
  }

  if (
    !(await callbacks?.shouldCombineUsers(
      newEventFromEvent(event),
      sql,
      existingSession,
      oldUser,
      newUser,
    ))
  ) {
    eventStop(event);
    return newUser;
  }

  if (callbacks?.beforeUserCombine) {
    await callbacks.beforeUserCombine(
      newEventFromEvent(event),
      sql,
      oldUser,
      newUser,
    );
  }

  const relations = await authQueries.listUserIdReferences().exec(sql);

  for (const relation of relations) {
    if (
      [
        "passwordLogin",
        "anonymousLogin",
        "digidLogin",
        "keycloakLogin",
        "totpSettings",
        "userRole",
        "userTenant",
      ].includes(relation.table)
    ) {
      continue;
    }

    await query(
      [
        `UPDATE "${relation.table}"
                   SET
                     "${relation.col[0]}" =`,
        `WHERE "${relation.col[0]}" = `,
        `;`,
      ],
      newUser.id,
      oldUser.id,
    ).exec(sql);
  }

  const refetchedOldUser = await authRequireUser(
    newEventFromEvent(event),
    sql,
    undefined,
    {
      id: oldUser.id,
    },
  );

  const refetchedNewUser = await authRequireUser(
    newEventFromEvent(event),
    sql,
    undefined,
    {
      id: newUser.id,
    },
  );

  if (callbacks?.afterUserCombine) {
    await callbacks.afterUserCombine(
      newEventFromEvent(event),
      sql,
      refetchedOldUser,
      refetchedNewUser,
    );
  }

  await queries.userDelete(sql, {
    id: oldUser.id,
  });

  eventStop(event);

  return newUser;
}

/**
 * List all users, with applied filtering
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {QueryResultBackendTenant} tenant
 * @param {AuthUserListBody} body
 * @returns {Promise<AuthUserListResponse>}
 */
export async function authUserList(event, sql, tenant, body) {
  eventStart(event, "auth.userList");

  /** @type {AuthUserQueryBuilder & {
   *   where: AuthUserWhereInput,
   * }}
   * */
  const builder = {
    ...userBuilder,
    where: {
      deletedAtIncludeNotNull: body.filters.includeSoftDeletedUsers,
      viaTenants: {
        where: {
          tenant: tenant.id,
        },
      },
    },
  };

  if (!isNil(body.filters.anonymousLoginExists)) {
    if (body.filters.anonymousLoginExists) {
      builder.where.viaAnonymousLogin = {};
    } else {
      builder.where.anonymousLoginNotExists = {};
    }
  }

  if (!isNil(body.filters.digidLoginExists)) {
    if (body.filters.digidLoginExists) {
      builder.where.viaDigidLogin = {};
    } else {
      builder.where.digidLoginNotExists = {};
    }
  }

  if (!isNil(body.filters.keycloakLoginExists)) {
    if (body.filters.keycloakLoginExists) {
      builder.where.viaKeycloakLogin = {};
    } else {
      builder.where.keycloakLoginNotExists = {};
    }
  }

  if (!isNil(body.filters.passwordLoginExists)) {
    if (body.filters.passwordLoginExists) {
      builder.where.viaPasswordLogin = {};
    } else {
      builder.where.passwordLoginNotExists = {};
    }
  }

  if (!isNil(body.search.name)) {
    builder.where.nameILike = body.search.name;
  }

  const dbUsers = await queryUser(builder).exec(sql);

  const users = [];

  for (const user of dbUsers) {
    if (
      body.filters.includeAnonymousTemporarySessions !== true &&
      user.anonymousLogin &&
      !user.passwordLogin &&
      !user.anonymousLogin.isAllowedToLogin
    ) {
      // Skip anonymous logins that are not allowed to login.
      // These are created for temporary user flows.
      continue;
    }

    users.push(authFormatUserSummary(user));
  }

  eventStop(event);

  return {
    users,
  };
}

/**
 * @param {QueryResultAuthUser} user
 * @returns {AuthUserSummary}
 */
export function authFormatUserSummary(user) {
  return {
    id: user.id,
    name: user.name,
    lastLogin: user.lastLogin,
    anonymousLogin: user.anonymousLogin
      ? {
          isAllowedToLogin: user.anonymousLogin.isAllowedToLogin,
          createdAt: user.anonymousLogin.createdAt,
        }
      : undefined,
    digidLogin: user.digidLogin
      ? {
          createdAt: user.digidLogin.createdAt,
        }
      : undefined,
    keycloakLogin: user.keycloakLogin
      ? {
          email: user.keycloakLogin.email,
          createdAt: user.keycloakLogin.createdAt,
        }
      : undefined,
    passwordLogin: user.passwordLogin
      ? {
          email: user.passwordLogin.email,
          createdAt: user.passwordLogin.createdAt,
          verifiedAt: user.passwordLogin.verifiedAt,
          otpEnabledAt: user.passwordLogin.otpEnabledAt,
        }
      : undefined,

    totpProvider:
      user.totpSettings && user.totpSettings.verifiedAt
        ? {
            enabledAt: user.totpSettings.verifiedAt,
          }
        : undefined,
    ...authPermissionUserSummary(user),
    createdAt: user.createdAt,
    deletedAt: user.deletedAt,
  };
}

/**
 * Update user properties
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {QueryResultAuthUser} user
 * @param {AuthUpdateUserBody} body
 * @returns {Promise<void>}
 */
export async function authUpdateUser(event, sql, user, body) {
  eventStart(event, "auth.updateUser");

  await queries.userUpdate(sql, {
    update: body,
    where: {
      id: user.id,
    },
  });

  eventStop(event);
}

/**
 * Activate or soft delete a user.
 *
 * If a user is soft deleted, we create a new job with the soft deleted user id.
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {BackendResolvedTenant} resolvedTenant
 * @param {QueryResultAuthUser} user
 * @param {AuthSetUserActiveBody} body
 * @returns {Promise<void>}
 */
export async function authSetUserActive(
  event,
  sql,
  resolvedTenant,
  user,
  body,
) {
  eventStart(event, "auth.setUserActive");

  if (body.active && user.deletedAt) {
    await queries.userUpdate(sql, {
      update: {
        deletedAt: null,
      },
      where: {
        id: user.id,
        deletedAtIncludeNotNull: true,
      },
    });
  } else if (!body.active && isNil(user.deletedAt)) {
    await queries.userUpdate(sql, {
      update: {
        deletedAt: new Date(),
      },
      where: {
        id: user.id,
      },
    });

    await queueWorkerAddJob(sql, {
      name: authEventNames.authUserSoftDeleted,
      priority: 4,
      data: {
        userId: user.id,
        metadata: {
          ...globalEventMetadata,
          tenant: {
            id: resolvedTenant.tenant.id,
            publicUrl: resolvedTenant.publicUrl,
            apiUrl: resolvedTenant.apiUrl,
          },
        },
      },
    });
  }

  eventStop(event);
}

/**
 * Add a tenant to a user, checking if the user can be added to the tenant.
 *
 * Note that if a user is linked to a tenant that exists in the database, but is disabled
 * in the tenant configuration, it still would violoate the 'enforceSingleTenant' option.
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {QueryResultAuthUser} user
 * @param {QueryResultBackendTenant} tenant
 * @param {{
 *   enforceSingleTenant?: boolean,
 * }} options
 * @returns {Promise<void>}
 */
export async function authUserAddTenant(event, sql, user, tenant, options) {
  eventStart(event, "auth.userAddTenant");

  // @ts-expect-error
  if (user.tenants.find((it) => it.tenant.id === tenant.id)) {
    eventStop(event);
    return;
  }

  // @ts-expect-error
  if (options.enforceSingleTenant && user.tenants.length > 0) {
    throw AppError.validationError(`${event.name}.enforceSingleTenant`);
  }

  await queries.userTenantInsert(sql, {
    user: user.id,
    tenant: tenant.id,
  });

  // @ts-expect-error
  user.tenants.push({
    user: user.id,
    tenant: tenant,
  });

  await authPasswordBasedCheckUnique(newEventFromEvent(event), sql, user);
  await authKeycloakBasedCheckUnique(newEventFromEvent(event), sql, user);

  eventStop(event);
}
