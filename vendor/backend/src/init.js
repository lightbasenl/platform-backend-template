import {
  AppError,
  environment,
  eventStart,
  eventStop,
  isNil,
  newEventFromEvent,
} from "@compas/stdlib";
import { query } from "@compas/store";
import { authInit } from "./auth/init.js";
import { featureFlagInit } from "./feature-flag/init.js";
import { managementInit } from "./management/init.js";
import { multitenantLoadConfig } from "./multitenant/config.js";
import { multitenantInit } from "./multitenant/init.js";
import { rateLimitInject } from "./ratelimit/events.js";
import { sql } from "./services.js";

/**
 * @typedef {object} BackendConfig
 * @property {BackendAuthConfig} auth Configure the authentication part
 * @property {BackendMultitenantConfig} multitenant Configure multitenant settings
 * @property {BackendFeatureFlagConfig} featureFlag Configure the feature flag part
 * @property {BackendManagementConfig} management Configure the management system
 */

/**
 * @typedef {object} BackendMultitenantConfig
 * @property {boolean} [syncUsersAcrossAllTenants] Specify how user handling should
 *   happen. If this is set to `true`, backendInit will add all users to all tenants.
 *   This allows you to add tenants without worrying if all users have access or not.
 */

/**
 * @typedef {{}} BackendManagementConfig
 */

/**
 * @typedef {{}} BackendFeatureFlagConfig
 */

/**
 * @typedef {object} BackendAuthConfig
 *
 * Setup auth permissions + roles and inject the controllers based on the provided
 *   settings. If for example `permission` is not provided, the permission routes are not
 *   loaded. In general, you always want to enable `anonymousLogin` to make testing
 *   easier and faster. Since none of the routes have a 'register' route it is generally
 *   safe to apply them all, however this may be confusing for your API users.
 * @property {import("@compas/store").SessionTransportSettings & {
 *     sessionStoreSettings: (import("@compas/store").SessionStoreSettings & {
 *   signingKey?: string|undefined })
 *   }} sessionTransportSettings Compas session transport and store settings. The signing
 *   key is injected in development and on production it defaults to
 *   'environment.APP_KEYS'.
 * @property {string[]} [permissionIdentifiers]
 * @property {AuthCombineUserCallbacks} [combineUserCallbacks] Combine users on login,
 *   for example to upgrade anonymous user to password based user and keep things like a
 *   shopping cart.
 * @property {PermissionBuildMandatoryRoles} [mandatoryRoles]
 * @property {PermissionSettings} [permission]
 *   Turn on permission controller and set permission settings
 * @property {import("./auth/anonymous-based/controller")
 *  .AnonymousBasedSettings} [anonymousBased] Inject anonymous based login with options
 * @property {import("./auth/digid-based/controller")
 * .DigidBasedSettings} [digidBased] Inject digid based login with options
 * @property {import("./auth/keycloak-based/controller")
 * .KeycloakBasedSettings} [keycloakBased] Inject keycloak based login with options
 * @property {import("./auth/password-based/controller")
 * .PasswordBasedSettings} [passwordBased] Inject password-based login with options
 * @property {import("./auth/totp-provider/controller")
 * .TotpProviderSettings} [totpProvider] Inject totp provider with options
 */

/**
 * Init LPC backend. Requires that {@link backendInitServices} is called before invoking
 * this function.
 *
 * - Append + update only sync tenants from `config/tenants.js` to the database.
 * - Injects the `config.multitenant.controller` if provided.
 * - Gives existing users access to the enabled tenants if
 * `config.multitenant.syncUsersAcrossAllTenants` is set.
 * - Full sync of `config.auth.permissions` to the database, and thus removing
 * permissions if not provided.
 * - Append + update only sync of `config.auth.mandatoryRoles`, while full syncing the
 * permissions belonging to a role.
 * - Injects all controllers on `config.auth` if they are provided.
 *
 * This function utilizes a Postgres lock to prevent multiple backend instances starting
 * up at the same time from syncing state to the database. So it may happen that your api
 * instance is a bit slower in starting up because of the queue instance locking the
 * database for a bit while this function executes.
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {BackendConfig} config
 * @returns {Promise<void>}
 */
export async function backendInit(event, config) {
  eventStart(event, "backend.init");

  if (isNil(sql)) {
    throw AppError.serverError({
      message:
        "Make sure to call 'backendInitServices', before calling 'backendInit'.",
    });
  }

  rateLimitInject();

  await sql.begin(async (sql) => {
    // Obtain an exclusive lock for the live time of this transaction. This ensures that
    // processes trying to execute this lock will have to wait till this sync is done,
    // preventing conflicts and unnecessary inserts and updates.
    await query`SELECT pg_advisory_xact_lock(-333333)`.exec(sql);

    await managementInit(newEventFromEvent(event));
    await multitenantInit(newEventFromEvent(event), sql, config);
    await featureFlagInit(newEventFromEvent(event), sql);
    await authInit(newEventFromEvent(event), sql, config);
  });

  eventStop(event);
}

/**
 * Get options that are necessary to init a backend, but depend on @lightbasenl/backend
 * configuration files. This can be called without any other part of the init sequence.
 *
 * @example
 * ```js
 * const { corsOrigin } = await backendGetConfig();
 * const app = getApp({
 *   headers: {
 *     cors: {
 *       origin: corsOrigin,
 *     }
 *   }
 * });
 * ```
 * @returns {Promise<{
 *   corsOrigin: ((any) => (string|undefined)),
 *  }>}
 */
export async function backendGetConfig() {
  const { tenantsByPublicUrl } = await multitenantLoadConfig();

  const corsUrls = Object.keys(tenantsByPublicUrl).map((it) => {
    if (it.startsWith("localhost")) {
      return `http://${it}`;
    }
    return `https://${it}`;
  });

  return {
    corsOrigin: (ctx) => {
      const header = ctx.get("origin");

      if (corsUrls.includes(header)) {
        return header;
      }

      if (
        (environment.LPC_BACKEND_ENVIRONMENT === "development" ||
          environment.LPC_BACKEND_ENVIRONMENT === "acceptance") &&
        header.startsWith("http://localhost:")
      ) {
        return header;
      }

      return undefined;
    },
  };
}
