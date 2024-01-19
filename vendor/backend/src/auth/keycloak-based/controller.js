import { newEventFromEvent } from "@compas/stdlib";
import { sessionStoreCreate, sessionStoreInvalidate } from "@compas/store";
import { backendGetTenantAndUser } from "../../events.js";
import { multitenantRequireTenant } from "../../multitenant/events.js";
import {
  sessionDurationCallback,
  sessionStoreSettings,
  sql,
} from "../../services.js";
import {
  importProjectResource,
  normalizeSessionErrorsToUnauthorizedAndThrow,
} from "../../util.js";
import { authPermissions, sessionStoreObjectSymbol } from "../constants.js";
import { authSessionAppendDevice } from "../session/events.js";
import {
  authCombineUsers,
  authCreateUser,
  authFormatUserSummary,
  authRequireUser,
  authUserAddTenant,
} from "../user.events.js";
import {
  authKeycloakBasedCallGetSettingsFunction,
  authKeycloakBasedGetRedirectUrl,
  authKeycloakBasedLogin,
  authKeycloakBasedRegister,
  authKeycloakBasedUpdateUser,
} from "./events.js";

/**
 * @typedef {object} AuthKeycloakBasedSettings
 * @property {string} keycloakUrl
 * @property {string} publicUrl
 * @property {string} keycloakClientId
 * @property {string} keycloakClientSecret
 */

/**
 * @typedef {object} AuthKeycloakBasedGetSettingsOptions
 * @property {boolean|undefined} [dummy]
 */

/**
 * @typedef {(ctx: import("@compas/server").Context<any, any, any>, options:
 *   AuthKeycloakBasedGetSettingsOptions) => AuthKeycloakBasedSettings|
 *   Promise<AuthKeycloakBasedSettings>} AuthKeycloakBasedGetSettings
 */

/**
 * @typedef {object} KeycloakBasedSettings
 * @property {AuthKeycloakBasedGetSettings} getSettingsFunction
 * @property {{
 *    implicitlyCreateUsers?: boolean,
 *    tenantSettings: "global"|"singleTenant"|"multitenant"
 * }} options
 */

/**
 * @typedef {KeycloakBasedSettings & {
 *   determineTwoStepFunction: AuthDetermineTwoStepCheckFunction,
 *   combineUserCallbacks?: AuthCombineUserCallbacks,
 * }} InternalKeycloakBasedSettings
 */

/**
 *
 * @param {InternalKeycloakBasedSettings} settings
 * @returns {Promise<void>}
 */
export async function applyKeycloakBasedController(settings) {
  /**
   * @type {typeof
   *   import("../../../../../src/generated/application/authKeycloakBased/controller.js")}
   */
  const controller = await importProjectResource(
    "./src/generated/application/authKeycloakBased/controller.js",
  );

  controller.authKeycloakBasedHandlers.redirect = async (ctx, next) => {
    const keycloakSettings = await authKeycloakBasedCallGetSettingsFunction(
      ctx,
      settings.getSettingsFunction,
    );

    ctx.body = {
      redirectUrl: authKeycloakBasedGetRedirectUrl(
        newEventFromEvent(ctx.event),
        keycloakSettings,
      ),
    };

    if (next) {
      return next();
    }
  };

  controller.authKeycloakBasedHandlers.login = async (ctx, next) => {
    const { tenant } = await multitenantRequireTenant(
      newEventFromEvent(ctx.event),
      ctx,
    );

    await sql.begin(async (sql) => {
      const user = await sql.savepoint(async (sql) => {
        const keycloakConnectionSettings =
          await authKeycloakBasedCallGetSettingsFunction(
            ctx,
            settings.getSettingsFunction,
          );

        const user = await authKeycloakBasedLogin(
          newEventFromEvent(ctx.event),
          sql,
          tenant,
          keycloakConnectionSettings,
          settings.options,
          ctx.validatedBody.code,
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
        {
          ...sessionStoreSettings,
          tokenMaxAgeResolver: (sql, session) => {
            return sessionDurationCallback(session, user, {
              session: session.id,
              ...ctx.validatedBody.device,
            });
          },
        },
        {
          type: "user",
          loginType: "keycloakBased",
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

  controller.authKeycloakBasedHandlers.updateUser = async (ctx, next) => {
    const { resolvedTenant } = await backendGetTenantAndUser(ctx, {
      requiredPermissions: [authPermissions.authUserManage],
    });

    const user = await authRequireUser(
      newEventFromEvent(ctx.event),
      sql,
      resolvedTenant.tenant,
      {
        id: ctx.validatedParams.user,
        deletedAtIncludeNotNull: true,
      },
      {
        eventKey: "authKeycloakBased.updateUser.requireUser",
      },
    );

    await authKeycloakBasedUpdateUser(
      newEventFromEvent(ctx.event),
      sql,
      user,
      ctx.validatedBody,
    );

    ctx.body = {
      success: true,
    };

    if (next) {
      return next();
    }
  };

  controller.authKeycloakBasedHandlers.create = async (ctx, next) => {
    const { resolvedTenant } = await backendGetTenantAndUser(ctx, {
      requiredPermissions: [authPermissions.authKeycloakUserCreate],
    });

    const createdUser = await sql.begin(async (sql) => {
      const user = await authCreateUser(
        newEventFromEvent(ctx.event),
        sql,
        {},
        {
          withMultitenant: {
            syncUsersAcrossAllTenants:
              settings.options.tenantSettings === "global",
          },
        },
      );

      await authUserAddTenant(
        newEventFromEvent(ctx.event),
        sql,
        user,
        resolvedTenant.tenant,
        {},
      );

      return await authKeycloakBasedRegister(
        newEventFromEvent(ctx.event),
        sql,
        user,
        ctx.validatedBody,
      );
    });

    ctx.body = {
      user: authFormatUserSummary(createdUser),
    };

    if (next) {
      return next();
    }
  };
}
