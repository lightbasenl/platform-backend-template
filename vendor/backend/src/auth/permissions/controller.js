import { newEventFromEvent } from "@compas/stdlib";
import { backendGetTenantAndUser } from "../../events.js";
import { sql } from "../../services.js";
import { importProjectResource } from "../../util.js";
import { authPermissions } from "../constants.js";
import { authRequireUser } from "../user.events.js";
import {
  authPermissionCreateRole,
  authPermissionPermissionList,
  authPermissionRemoveRole,
  authPermissionRequireRole,
  authPermissionRoleAddPermissions,
  authPermissionRoleList,
  authPermissionRoleRemovePermissions,
  authPermissionUserAssignRole,
  authPermissionUserRemoveRole,
  authPermissionUserSummary,
} from "./events.js";

/**
 * @typedef {(tenants:
 *   QueryResultBackendTenant[]) =>
 *   PermissionMandatoryRole[]} PermissionBuildMandatoryRoles
 */

/**
 * @typedef {object} PermissionMandatoryRole
 * @property {string} [tenantId] Optional tenant. If not provided, the role is usable
 *   across tenants
 * @property {string} identifier Required role name, should be unique across global roles
 *   and across roles in a single tenant
 * @property {AuthPermissionIdentifier[]} permissions The permissions linked to this role
 */

/**
 * @typedef {object} PermissionSettings
 * @property {string[]} staticRoleIds
 */

/**
 * Apply permission controller. By checking if a handler is generated we know
 * that the `addManagementRoutes` was true when applying the structure.
 *
 * @param {PermissionSettings} settings
 * @returns {Promise<void>}
 */
export async function applyPermissionController(settings) {
  /**
   * @type {typeof
   *   import("../../../../../src/generated/application/authPermission/controller.js")}
   */
  const controller = await importProjectResource(
    "./src/generated/application/authPermission/controller.js",
  );

  controller.authPermissionHandlers.summary = async (ctx, next) => {
    const { user } = await backendGetTenantAndUser(ctx);

    ctx.body = authPermissionUserSummary(user);

    if (next) {
      return next();
    }
  };

  // Management routes are enabled
  if (controller.authPermissionHandlers.roleList) {
    controller.authPermissionHandlers.permissionList = async (ctx, next) => {
      await backendGetTenantAndUser(ctx, {
        requiredPermissions: [authPermissions.authPermissionManage],
      });

      ctx.body = await authPermissionPermissionList(
        newEventFromEvent(ctx.event),
        sql,
      );

      if (next) {
        return next();
      }
    };

    controller.authPermissionHandlers.roleList = async (ctx, next) => {
      const { resolvedTenant } = await backendGetTenantAndUser(ctx, {
        requiredPermissions: [authPermissions.authPermissionManage],
      });

      ctx.body = await authPermissionRoleList(
        newEventFromEvent(ctx.event),
        sql,
        resolvedTenant.tenant,
        settings.staticRoleIds,
      );

      if (next) {
        return next();
      }
    };

    controller.authPermissionHandlers.createRole = async (ctx, next) => {
      const { resolvedTenant } = await backendGetTenantAndUser(ctx, {
        requiredPermissions: [authPermissions.authPermissionManage],
      });

      ctx.body = await authPermissionCreateRole(
        newEventFromEvent(ctx.event),
        sql,
        resolvedTenant.tenant,
        ctx.validatedBody,
      );

      if (next) {
        return next();
      }
    };

    controller.authPermissionHandlers.removeRole = async (ctx, next) => {
      const { resolvedTenant } = await backendGetTenantAndUser(ctx, {
        requiredPermissions: [authPermissions.authPermissionManage],
      });

      const role = await authPermissionRequireRole(
        newEventFromEvent(ctx.event),
        sql,
        resolvedTenant.tenant,
        settings.staticRoleIds,
        ctx.validatedParams,
      );

      // @ts-expect-error
      await authPermissionRemoveRole(newEventFromEvent(ctx.event), sql, role);

      ctx.body = {
        success: true,
      };

      if (next) {
        return next();
      }
    };

    controller.authPermissionHandlers.roleAddPermissions = async (
      ctx,
      next,
    ) => {
      const { resolvedTenant } = await backendGetTenantAndUser(ctx, {
        requiredPermissions: [authPermissions.authPermissionManage],
      });

      const role = await authPermissionRequireRole(
        newEventFromEvent(ctx.event),
        sql,
        resolvedTenant.tenant,
        settings.staticRoleIds,
        ctx.validatedParams,
      );

      await authPermissionRoleAddPermissions(
        newEventFromEvent(ctx.event),
        sql,
        role,
        ctx.validatedBody,
      );

      ctx.body = {
        success: true,
      };

      if (next) {
        return next();
      }
    };

    controller.authPermissionHandlers.roleRemovePermissions = async (
      ctx,
      next,
    ) => {
      const { resolvedTenant } = await backendGetTenantAndUser(ctx, {
        requiredPermissions: [authPermissions.authPermissionManage],
      });

      const role = await authPermissionRequireRole(
        newEventFromEvent(ctx.event),
        sql,
        resolvedTenant.tenant,
        settings.staticRoleIds,
        ctx.validatedParams,
      );

      await authPermissionRoleRemovePermissions(
        newEventFromEvent(ctx.event),
        sql,
        role,
        ctx.validatedBody,
      );

      ctx.body = {
        success: true,
      };

      if (next) {
        return next();
      }
    };

    controller.authPermissionHandlers.userSummary = async (ctx, next) => {
      const { resolvedTenant } = await backendGetTenantAndUser(ctx, {
        requiredPermissions: [authPermissions.authPermissionManage],
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
          eventKey: "authPermission.requireUser",
        },
      );

      ctx.body = authPermissionUserSummary(user);

      if (next) {
        return next();
      }
    };

    controller.authPermissionHandlers.userAssignRole = async (ctx, next) => {
      const { resolvedTenant } = await backendGetTenantAndUser(ctx, {
        requiredPermissions: [authPermissions.authPermissionManage],
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
          eventKey: "authPermission.requireUser",
        },
      );

      await authPermissionUserAssignRole(
        newEventFromEvent(ctx.event),
        sql,
        resolvedTenant.tenant,
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

    controller.authPermissionHandlers.userRemoveRole = async (ctx, next) => {
      const { resolvedTenant } = await backendGetTenantAndUser(ctx, {
        requiredPermissions: [authPermissions.authPermissionManage],
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
          eventKey: "authPermission.requireUser",
        },
      );

      await authPermissionUserRemoveRole(
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
  }
}
