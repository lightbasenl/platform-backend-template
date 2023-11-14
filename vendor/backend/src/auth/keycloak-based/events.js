import {
  AppError,
  eventStart,
  eventStop,
  isNil,
  newEventFromEvent,
} from "@compas/stdlib";
import { queueWorkerAddJob } from "@compas/store";
import axios from "axios";
import { queries, queryUser, userBuilder } from "../../services.js";
import { authEventNames } from "../constants.js";
import { authCreateUser, authUserAddTenant } from "../user.events.js";

/**
 * Call the settings function and verify the result
 *
 * @param {import("@compas/server").Context<any, any, any>} ctx
 * @param {AuthKeycloakBasedGetSettings} getSettingsFn
 * @param {AuthKeycloakBasedGetSettingsOptions|undefined} [options]
 * @returns {Promise<AuthKeycloakBasedSettings>}
 */
export async function authKeycloakBasedCallGetSettingsFunction(
  ctx,
  getSettingsFn,
  options,
) {
  const settings = await getSettingsFn(ctx, options ?? {});

  if (
    typeof settings?.keycloakUrl !== "string" ||
    settings.keycloakUrl.length < 5
  ) {
    throw AppError.validationError(
      "authKeycloakBased.getSettings.invalidKeycloakUrl",
    );
  }

  if (!settings.keycloakUrl.includes("auth/realms")) {
    throw AppError.validationError(
      "authKeycloakBased.getSettings.invalidKeycloakUrl",
      {
        message: "Should include the '/auth/realms/:realm/' path",
      },
    );
  }

  if (settings.keycloakUrl.endsWith("/")) {
    settings.keycloakUrl = settings.keycloakUrl.substring(
      0,
      settings.keycloakUrl.length - 1,
    );
  }

  if (
    typeof settings?.publicUrl !== "string" ||
    settings.publicUrl.length < 5
  ) {
    throw AppError.validationError(
      "authKeycloakBased.getSettings.invalidPublicUrl",
    );
  }

  if (settings.publicUrl.endsWith("/")) {
    settings.publicUrl = settings.publicUrl.substring(
      0,
      settings.publicUrl.length - 1,
    );
  }

  if (
    typeof settings?.keycloakClientId !== "string" ||
    settings.keycloakClientId.length < 2
  ) {
    throw AppError.validationError(
      "authKeycloakBased.getSettings.invalidKeycloakClientId",
    );
  }
  if (
    typeof settings?.keycloakClientSecret !== "string" ||
    settings.keycloakClientSecret.length < 2
  ) {
    throw AppError.validationError(
      "authKeycloakBased.getSettings.invalidKeycloakClientSecret",
    );
  }

  return settings;
}

/**
 * Get the keycloak redirect url.
 * Keycloak will redirect back to the publicUrl/keycloak
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {AuthKeycloakBasedSettings} settings
 * @returns {string}
 */
export function authKeycloakBasedGetRedirectUrl(event, settings) {
  eventStart(event, "authKeycloakBased.getRedirectUrl");

  const url = `${settings.keycloakUrl}/protocol/openid-connect/auth?scope=openid&response_type=code&client_id=${settings.keycloakClientId}&redirect_uri=${settings.publicUrl}/keycloak`;

  eventStop(event);

  return url;
}

/**
 * Login by getting & verifying the ID token from Keycloak
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {QueryResultBackendTenant} tenant
 * @param {AuthKeycloakBasedSettings} connectionSettings
 * @param {KeycloakBasedSettings["options"]} options
 * @param {string} keycloakCode
 * @returns {Promise<QueryResultAuthUser>}
 */
export async function authKeycloakBasedLogin(
  event,
  sql,
  tenant,
  connectionSettings,
  options,
  keycloakCode,
) {
  eventStart(event, "authKeycloakBased.login");

  const idToken = await authKeycloakBasedResolveToken(
    newEventFromEvent(event),
    connectionSettings,
    keycloakCode,
  );

  const { email, name } = await authKeycloakBasedVerifyAndReadToken(
    newEventFromEvent(event),
    connectionSettings,
    idToken,
  );

  let [user] = await queryUser({
    ...userBuilder,
    where: {
      viaKeycloakLogin: {
        where: {
          email,
        },
      },
    },
    tenants: {},
  }).exec(sql);

  if (!user && options.implicitlyCreateUsers) {
    await sql.begin(async (sql) => {
      user = await authCreateUser(
        newEventFromEvent(event),
        sql,
        {
          name,
        },
        {
          withMultitenant: {
            syncUsersAcrossAllTenants: options.tenantSettings === "global",
          },
        },
      );

      user = await authKeycloakBasedRegister(
        newEventFromEvent(event),
        sql,
        user,
        {
          email,
          name,

          // @ts-expect-error
          eventMetadata: {
            tenant: tenant.id,
          },
        },
      );
    });
  }

  if (!user) {
    throw AppError.validationError("authKeycloakBased.login.unknownUser");
  }

  // @ts-expect-error
  const userHasTenant = user.tenants.find((it) => it.tenant === tenant.id);

  if (isNil(userHasTenant) && options.implicitlyCreateUsers) {
    await authUserAddTenant(newEventFromEvent(event), sql, user, tenant, {
      enforceSingleTenant: options.tenantSettings === "singleTenant",
    });
  } else if (isNil(userHasTenant)) {
    throw AppError.validationError("authKeycloakBased.login.unknownUser");
  }

  await queries.userUpdate(sql, {
    update: {
      lastLogin: new Date(),
      name: isNil(user.name) && !isNil(name) ? name : undefined,
    },
    where: {
      id: user.id,
    },
  });

  user.lastLogin = new Date();
  user.name = user.name ?? name;

  eventStop(event);

  return user;
}

/**
 * Update a keycloak based login for the passed in user
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {QueryResultAuthUser} user
 * @param {AuthKeycloakBasedUpdateUserBody} body
 * @returns {Promise<void>}
 */
export async function authKeycloakBasedUpdateUser(event, sql, user, body) {
  eventStart(event, "authKeycloakBased.updateUser");

  if (isNil(user.keycloakLogin)) {
    throw AppError.validationError(
      "authKeycloakBased.updateUser.missingKeycloakLogin",
    );
  }

  if (!isNil(body.email)) {
    const [existingUser] = await queryUser({
      where: {
        viaKeycloakLogin: {
          where: {
            email: body.email,
          },
        },
      },
    }).exec(sql);

    if (!isNil(existingUser) && existingUser.id !== user.id) {
      throw AppError.validationError(
        "authKeycloakBased.updateUser.emailAlreadyUsed",
      );
    }
  }

  await queries.keycloakLoginUpdate(sql, {
    update: body,
    where: {
      id: user.keycloakLogin.id,
    },
  });

  eventStop(event);
}

/**
 * Register a keycloak based user
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {QueryResultAuthUser} dbUser
 * @param {AuthKeycloakBasedCreateBody} body
 * @returns {Promise<QueryResultAuthUser>}
 */
export async function authKeycloakBasedRegister(event, sql, dbUser, body) {
  eventStart(event, "authKeycloakBased.register");

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

  if (isNil(dbUser.name) && !isNil(body.name)) {
    dbUser.name = body.name;
    await queries.userUpdate(sql, {
      update: {
        name: body.name,
      },
      where: {
        id: dbUser.id,
      },
    });
  }

  const [keycloakLogin] = await queries.keycloakLoginInsert(sql, {
    user: dbUser.id,
    email: body.email,
  });

  await queueWorkerAddJob(sql, {
    name: authEventNames.authKeycloakBasedUserRegistered,
    priority: 4,
    data: {
      keycloakLoginId: keycloakLogin.id,
      metadata: {
        // @ts-expect-error
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

  await authKeycloakBasedCheckUnique(newEventFromEvent(event), sql, user);

  eventStop(event);

  return user;
}

/**
 * Hit the '/token' endpoint to get the access token
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {AuthKeycloakBasedSettings} settings
 * @param {string} code
 * @returns {Promise<string>}
 */
async function authKeycloakBasedResolveToken(event, settings, code) {
  eventStart(event, "authKeycloakBased.resolveToken");

  try {
    const response = await axios.request({
      method: "POST",
      url: `${settings.keycloakUrl}/protocol/openid-connect/token`,
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${settings.keycloakClientId}:${settings.keycloakClientSecret}`,
        ).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      data: `grant_type=authorization_code&code=${code}&redirect_uri=${settings.publicUrl}/keycloak`,
    });

    eventStop(event);

    return response.data.access_token ?? "";
  } catch (/** @type {any} */ e) {
    throw AppError.validationError(
      "authKeycloakBased.resolveToken.invalidCode",
      {},
      e,
    );
  }
}

/**
 * Verify and get data from the passed in access token
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {AuthKeycloakBasedSettings} settings
 * @param {string} token
 * @returns {Promise<{ email: string, name?: string }>}
 */
export async function authKeycloakBasedVerifyAndReadToken(
  event,
  settings,
  token,
) {
  eventStart(event, "authKeycloakBased.verifyAndReadToken");

  try {
    // Using the /userinfo endpoint for simplicity.
    // The other way would be to fetch the certs, check signatures issue dates etc.
    const response = await axios.request({
      method: "GET",
      url: `${settings.keycloakUrl}/protocol/openid-connect/userinfo`,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    //     sub: 'cc52b9f8-dcc8-4712-bb3d-a1340b46d423',
    //     email_verified: true,
    //     name: 'Dirk de Visser',
    //     preferred_username: 'dirk',
    //     given_name: 'Dirk',
    //     family_name: 'de Visser',
    //     email: 'dirk@lightbase.nl'

    eventStop(event);

    return {
      email: response.data.email,
      name: response.data.name,
    };
  } catch (e) {
    throw AppError.validationError(
      "authKeycloakBased.verifyAndReadToken.invalidToken",
    );
  }
}

/**
 * Enforce the unique email constraint for this tenant
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {QueryResultAuthUser} user
 * @returns {Promise<void>}
 */
export async function authKeycloakBasedCheckUnique(event, sql, user) {
  eventStart(event, "authKeycloakBased.checkUnique");

  // @ts-expect-error
  //
  // SQL should be in a transaction
  if (typeof sql.savepoint !== "function") {
    throw AppError.serverError({
      message: "Function should be called inside a sql transaction.",
    });
  }

  if (!user.keycloakLogin) {
    // User doesn't have a keycloak login

    eventStop(event);
    return;
  }

  if (!Array.isArray(user.tenants)) {
    throw AppError.serverError({
      message: `'${event.name}' needs to be called with a user that has tenants joined.`,
    });
  }

  const existingUsers = (
    await Promise.all(
      user.tenants.map((it) =>
        queryUser({
          where: {
            idNotEqual: user.id,
            viaKeycloakLogin: {
              where: {
                // @ts-expect-error
                email: user.keycloakLogin.email,
              },
            },
            viaTenants: {
              where: {
                // @ts-expect-error
                tenant: it.tenant.id,
              },
            },
          },
        }).exec(sql),
      ),
    )
  ).flat();

  if (existingUsers.length > 0) {
    throw AppError.validationError(`${event.name}.duplicateEmail`);
  }

  eventStop(event);
}
