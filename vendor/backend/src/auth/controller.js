import { newEventFromEvent } from "@compas/stdlib";
import { sessionStoreRefreshTokens } from "@compas/store";
import { backendGetTenantAndUser } from "../events.js";
import { queries, sessionStoreSettings, sql } from "../services.js";
import {
  importProjectResource,
  normalizeSessionErrorsToUnauthorizedAndThrow,
} from "../util.js";
import { authPermissions, sessionStoreObjectSymbol } from "./constants.js";
import { authLoadSessionOptionally } from "./events.js";
import {
  authFormatUserSummary,
  authRequireUser,
  authSetUserActive,
  authUpdateUser,
  authUserList,
} from "./user.events.js";

/**
 * Apply auth controller, always available
 *
 * @returns {Promise<void>}
 */
export async function applyAuthController() {
  /**
   * @type {typeof import("../../../../src/generated/application/auth/controller.js")}
   */
  const controller = await importProjectResource(
    "./src/generated/application/auth/controller.js",
  );

  controller.authHandlers.me = async (ctx, next) => {
    const { user } = await backendGetTenantAndUser(ctx, {
      skipSessionIsUserCheck: true,
    });

    ctx.body = {
      session: ctx.session,
      user:
        ctx.session.type === "user" ? authFormatUserSummary(user) : undefined,
    };

    if (next) {
      return next();
    }
  };

  controller.authHandlers.refreshTokens = async (ctx, next) => {
    const refreshResult = await sessionStoreRefreshTokens(
      newEventFromEvent(ctx.event),
      sql,
      sessionStoreSettings,
      ctx.validatedBody.refreshToken,
    );

    if (refreshResult.error) {
      normalizeSessionErrorsToUnauthorizedAndThrow(refreshResult.error);
    }

    ctx.body = refreshResult.value;

    if (next) {
      return next();
    }
  };

  controller.authHandlers.logout = async (ctx, next) => {
    await authLoadSessionOptionally(newEventFromEvent(ctx.event), sql, ctx);
    if (ctx[sessionStoreObjectSymbol]) {
      await queries.sessionStoreDelete(sql, {
        id: ctx[sessionStoreObjectSymbol].id,
      });
    }

    ctx.body = {
      success: true,
    };

    if (next) {
      return next();
    }
  };

  controller.authHandlers.userList = async (ctx, next) => {
    const { resolvedTenant } = await backendGetTenantAndUser(ctx, {
      requiredPermissions: [authPermissions.authUserList],
    });

    ctx.body = await authUserList(
      newEventFromEvent(ctx.event),
      sql,
      resolvedTenant.tenant,
      ctx.validatedBody,
    );

    if (next) {
      return next();
    }
  };

  controller.authHandlers.getUser = async (ctx, next) => {
    const { resolvedTenant } = await backendGetTenantAndUser(ctx, {
      requiredPermissions: [authPermissions.authUserList],
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
        eventKey: "auth.getUser",
      },
    );

    ctx.body = {
      user: authFormatUserSummary(user),
    };

    if (next) {
      return next();
    }
  };

  controller.authHandlers.updateUser = async (ctx, next) => {
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
        eventKey: "auth.updateUser.requireUser",
      },
    );

    await authUpdateUser(
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

  controller.authHandlers.setUserActive = async (ctx, next) => {
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
        eventKey: "auth.setUserActive.requireUser",
      },
    );

    await authSetUserActive(
      newEventFromEvent(ctx.event),
      sql,
      resolvedTenant,
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
}
