import {
  AppError,
  eventStart,
  eventStop,
  isNil,
  newEventFromEvent,
} from "@compas/stdlib";
import { managementConstants } from "../management/constants.js";
import {
  queryTenant,
  setSessionTransportAndStore,
  tenantBuilder,
} from "../services.js";
import { applyAuth } from "./apply.js";
import {
  authPermissionSyncMandatoryRoles,
  authPermissionSyncPermissions,
} from "./permissions/events.js";

/**
 * Initialize auth system.
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {BackendConfig} config
 * @returns {Promise<void>}
 */
export async function authInit(event, sql, config) {
  eventStart(event, "auth.init");

  if (isNil(config.auth)) {
    throw AppError.serverError({
      message: `BackendInit should have auth settings object.`,
    });
  }

  setSessionTransportAndStore(config.auth.sessionTransportSettings);

  const permissionList = config.auth.permissionIdentifiers ?? [];
  if (!permissionList.includes(managementConstants.permission)) {
    permissionList.push(managementConstants.permission);
  }

  await authPermissionSyncPermissions(
    newEventFromEvent(event),
    sql,
    permissionList,
  );

  const tenants = await queryTenant({
    ...tenantBuilder,
    roles: {},
  }).exec(sql);

  const result = await authPermissionSyncMandatoryRoles(
    newEventFromEvent(event),
    sql,
    (config.auth.mandatoryRoles?.(tenants) ?? []).concat({
      identifier: managementConstants.role,
      permissions: [managementConstants.permission],
    }),
  );

  if (config.auth.permission) {
    config.auth.permission.staticRoleIds = result.staticRoleIds ?? [];
  }

  await applyAuth(config.auth);

  eventStop(event);
}
