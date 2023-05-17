import { newEventFromEvent } from "@compas/stdlib";
import { sessionStoreUpdate } from "@compas/store";
import { backendGetTenantAndUser } from "../../events.js";
import { sql } from "../../services.js";
import {
  importProjectResource,
  normalizeSessionErrorsToUnauthorizedAndThrow,
} from "../../util.js";
import { authPermissions, sessionStoreObjectSymbol } from "../constants.js";
import { authRequireUser } from "../user.events.js";
import {
  authTotpProviderInfo,
  authTotpProviderRemove,
  authTotpProviderRemoveForUser,
  authTotpProviderSetup,
  authTotpProviderSetupVerify,
  authTotpProviderVerify,
} from "./events.js";

/**
 * @typedef {{}} TotpProviderSettings
 */

/**
 * @typedef {TotpProviderSettings} InternalTotpProviderSettings
 */

/**
 * @returns {Promise<void>}
 */
export async function applyTotpProviderController() {
  /**
   * @type {typeof
   *   import("../../../../../src/generated/application/authTotpProvider/controller.js")}
   */
  const controller = await importProjectResource(
    "./src/generated/application/authTotpProvider/controller.js",
  );

  controller.authTotpProviderHandlers.info = async (ctx, next) => {
    const { user } = await backendGetTenantAndUser(ctx);

    ctx.body = authTotpProviderInfo(user);

    if (next) {
      return next();
    }
  };

  controller.authTotpProviderHandlers.setup = async (ctx, next) => {
    const { user } = await backendGetTenantAndUser(ctx);

    ctx.body = await sql.begin((sql) =>
      authTotpProviderSetup(newEventFromEvent(ctx.event), sql, user),
    );

    if (next) {
      return next();
    }
  };

  controller.authTotpProviderHandlers.setupVerify = async (ctx, next) => {
    const { user } = await backendGetTenantAndUser(ctx, {
      skipSessionIsUserCheck: true,
    });

    await sql.begin((sql) =>
      authTotpProviderSetupVerify(
        newEventFromEvent(ctx.event),
        sql,
        user,
        ctx.validatedBody,
      ),
    );

    ctx.body = {
      success: true,
    };

    if (next) {
      return next();
    }
  };

  controller.authTotpProviderHandlers.verify = async (ctx, next) => {
    const { user } = await backendGetTenantAndUser(ctx, {
      skipSessionIsUserCheck: true,
    });

    authTotpProviderVerify(
      newEventFromEvent(ctx.event),
      user,
      ctx.validatedBody,
    );

    ctx.session.type = "user";

    const updateResult = await sessionStoreUpdate(
      newEventFromEvent(ctx.event),
      sql,
      ctx[sessionStoreObjectSymbol],
    );

    if (updateResult.error) {
      normalizeSessionErrorsToUnauthorizedAndThrow(updateResult.error);
    }

    ctx.body = {
      success: true,
    };

    if (next) {
      return next();
    }
  };

  controller.authTotpProviderHandlers.remove = async (ctx, next) => {
    const { user } = await backendGetTenantAndUser(ctx);

    await authTotpProviderRemove(newEventFromEvent(ctx.event), sql, user);

    ctx.body = {
      success: true,
    };

    if (next) {
      return next();
    }
  };

  controller.authTotpProviderHandlers.removeForUser = async (ctx, next) => {
    const { resolvedTenant } = await backendGetTenantAndUser(ctx, {
      requiredPermissions: [authPermissions.authTotpManage],
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
        eventKey: "authTotpProvider.removeForUser",
      },
    );

    await authTotpProviderRemoveForUser(
      newEventFromEvent(ctx.event),
      sql,
      user,
    );

    ctx.body = {
      success: true,
    };

    if (next) {
      return next();
    }
  };
}
