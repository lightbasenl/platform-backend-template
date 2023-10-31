import { AppError, eventStart, eventStop, isNil } from "@compas/stdlib";
import {
  queries,
  queryPermission,
  queryRole,
  queryUserRole,
} from "../../services.js";

/**
 * Require role editable based on the provided id
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {QueryResultBackendTenant} tenant
 * @param {string[]} staticRoleIds
 * @param {string|{ role: string}} roleObjectOrId
 * @returns {Promise<QueryResultAuthRole>}
 */
export async function authPermissionRequireRole(
  event,
  sql,
  tenant,
  staticRoleIds,
  roleObjectOrId,
) {
  eventStart(event, "authPermission.requireRole");
  // @ts-expect-error
  const roleId = roleObjectOrId?.role ?? roleObjectOrId;

  if (typeof roleId !== "string") {
    throw AppError.validationError(
      "authPermission.requireRole.invalidRoleObjectOrId",
    );
  }

  const [role] = await queryRole({
    permissions: {
      permission: {},
    },
    where: {
      id: roleId,
      tenant: tenant.id,
    },
  }).exec(sql);

  if (!role) {
    throw AppError.validationError("authPermission.requireRole.unknownRole");
  }

  if (staticRoleIds.includes(role.id)) {
    throw AppError.validationError("authPermission.requireRole.notEditable");
  }

  eventStop(event);

  return role;
}

/**
 * Update the 'Permission' table with the new values, removing unused permissions and
 * adding new permissions.
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {string[]} permissions
 * @returns {Promise<void>}
 */
export async function authPermissionSyncPermissions(event, sql, permissions) {
  eventStart(event, "authPermission.syncPermissions");

  if (!Array.isArray(permissions)) {
    throw new TypeError("Expecting 'permissions' to be an array of strings.");
  }

  if (new Set(permissions).size !== permissions.length) {
    throw new TypeError("Duplicate permission identifier found.");
  }

  const existingPermissions = await queryPermission({}).exec(sql);
  const existingPermissionLookup = {};

  const inserts = [];
  const deletions = [];

  for (const permission of existingPermissions) {
    if (!permissions.includes(permission.identifier)) {
      deletions.push(permission.id);
    } else {
      existingPermissionLookup[permission.identifier] = permission;
    }
  }

  for (const permission of permissions) {
    if (isNil(existingPermissionLookup[permission])) {
      inserts.push({ identifier: permission });
    }
  }

  await queries.permissionDelete(sql, { idIn: deletions });
  await queries.permissionInsert(sql, inserts);

  eventStop(event);
}

/**
 * Sync mandatory roles, ensuring that roles with the specified identifiers exist, and
 * that they have 'exactly' the provided permissions.
 *
 * Should run in a transaction
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {PermissionMandatoryRole[]} mandatoryRoles
 * @returns {Promise<{ staticRoleIds: string[] }>}
 */
export async function authPermissionSyncMandatoryRoles(
  event,
  sql,
  mandatoryRoles,
) {
  eventStart(event, "authPermission.syncMandatoryRoles");

  /** @type {PermissionMandatoryRole[]} */
  const globalRoles = [];
  /** @type {Record<string, import("./controller").PermissionMandatoryRole[]>} */
  const byTenant = {};

  for (const role of mandatoryRoles) {
    if (isNil(role.tenantId)) {
      globalRoles.push(role);
    } else {
      if (isNil(byTenant[role.tenantId])) {
        byTenant[role.tenantId] = [];
      }

      byTenant[role.tenantId].push(role);
    }
  }

  if (
    new Set(globalRoles.map((it) => it.identifier)).size !== globalRoles.length
  ) {
    throw AppError.serverError({
      message:
        "Identifiers of mandatory roles without tenant should be unique. Found a duplicate.",
    });
  }

  for (const roles of Object.values(byTenant)) {
    if (new Set(roles.map((it) => it.identifier)).size !== roles.length) {
      throw AppError.serverError({
        message: `Identifiers of mandatory roles for one tenant should be unique. Found a duplicate.`,
      });
    }
  }

  // Keep a list of role ids that are 'mandatory' so we can pass this to the permission
  // controller and make sure that these are not editable
  const staticRoleIds = [];

  for (const mandatory of mandatoryRoles) {
    let [dbRole] = await queryRole({
      where: {
        identifier: mandatory.identifier,
        ...(mandatory.tenantId
          ? {
              tenant: mandatory.tenantId,
            }
          : {
              tenantIsNull: true,
            }),
      },
      tenant: {},
    }).exec(sql);

    if (isNil(dbRole)) {
      const [newRole] = await queries.roleInsert(sql, {
        identifier: mandatory.identifier,
        tenant: mandatory.tenantId,
      });

      dbRole = newRole;
    } else {
      // Remove existing permissions. Makes it easier to insert new ones
      await queries.rolePermissionDelete(sql, {
        role: dbRole.id,
      });
    }

    staticRoleIds.push(dbRole.id);

    const dbPermissions = await queryPermission({
      where: {
        identifierIn: mandatory.permissions,
      },
    }).exec(sql);

    if (dbPermissions.length !== mandatory.permissions.length) {
      throw AppError.validationError(
        "authPermission.syncMandatoryRoles.invalidPermissions",
        {
          message:
            "Mismatch in permissions. Did you forgot to call 'authPermissionSyncPermissions()'?",
          requiredPermissions: mandatory.permissions,
          foundPermissions: dbPermissions.map((it) => it.identifier),
        },
      );
    }

    await queries.rolePermissionInsert(
      sql,
      dbPermissions.map((it) => ({
        role: dbRole.id,
        permission: it.id,
      })),
    );
  }

  eventStop(event);

  return {
    staticRoleIds,
  };
}

/**
 * List known permissions
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @returns {Promise<AuthPermissionPermissionListResponse>}
 */
export async function authPermissionPermissionList(event, sql) {
  eventStart(event, "authPermission.permissionList");

  const permissions = await queryPermission({
    orderBy: ["identifier"],
  }).exec(sql);

  eventStop(event);

  return {
    // @ts-expect-error
    permissions,
  };
}

/**
 * List roles with permissions
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {QueryResultBackendTenant} tenant
 * @param {string[]} staticRoleIds
 * @returns {Promise<AuthPermissionRoleListResponse>}
 */
export async function authPermissionRoleList(
  event,
  sql,
  tenant,
  staticRoleIds,
) {
  eventStart(event, "authPermission.roleList");

  const dbRoles = await queryRole({
    where: {
      $or: [
        {
          tenant: tenant.id,
        },
        {
          tenantIsNull: true,
        },
      ],
    },
    permissions: {
      permission: {},
    },
  }).exec(sql);

  const roles = [];

  for (const role of dbRoles) {
    const pushIndex =
      roles.push({
        id: role.id,
        identifier: role.identifier,
        isEditable: !staticRoleIds.includes(role.id) && !isNil(role.tenant),
        permissions: [],
      }) - 1;

    for (const rolePermission of role?.permissions ?? []) {
      // @ts-expect-error
      roles[pushIndex].permissions.push(rolePermission.permission.identifier);
    }

    roles[pushIndex].permissions.sort();
  }

  eventStop(event);

  return {
    roles,
  };
}

/**
 * Create a new role, checking for duplicate role identifiers
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {QueryResultBackendTenant} tenant
 * @param {AuthPermissionCreateRoleBody} body
 * @returns {Promise<AuthPermissionCreateRoleResponse>}
 */
export async function authPermissionCreateRole(event, sql, tenant, body) {
  eventStart(event, "authPermission.createRole");

  const [existingRole] = await queryRole({
    where: {
      identifier: body.identifier,
      tenant: tenant.id,
    },
  }).exec(sql);

  if (existingRole) {
    throw AppError.validationError(
      "authPermission.createRole.duplicateIdentifier",
    );
  }

  const [role] = await queries.roleInsert(sql, {
    identifier: body.identifier,
    tenant: tenant.id,
  });

  eventStop(event);

  return {
    role: {
      id: role.id,
      identifier: role.identifier,
    },
  };
}

/**
 * Remove a role
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {AuthRole} role
 * @returns {Promise<void>}
 */
export async function authPermissionRemoveRole(event, sql, role) {
  eventStart(event, "authPermission.removeRole");

  await queries.roleDelete(sql, {
    id: role.id,
  });

  eventStop(event);
}

/**
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {QueryResultAuthRole} role
 * @param {AuthPermissionRoleAddPermissionsBody} body
 * @returns {Promise<void>}
 */
export async function authPermissionRoleAddPermissions(event, sql, role, body) {
  eventStart(event, "authPermission.roleAddPermissions");

  const dbPermissions = await queryPermission({
    where: {
      identifierIn: body.permissions,
    },
  }).exec(sql);

  if (
    dbPermissions.length === 0 ||
    dbPermissions.length !== body.permissions.length
  ) {
    throw AppError.validationError(
      "authPermission.roleAddPermissions.unknownPermission",
    );
  }

  const inserts = [];

  for (const permission of dbPermissions) {
    // @ts-expect-error
    if (!role.permissions.find((it) => it.permission.id === permission.id)) {
      inserts.push({
        role: role.id,
        permission: permission.id,
      });
    }
  }

  await queries.rolePermissionInsert(sql, inserts);

  eventStop(event);
}

/**
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {QueryResultAuthRole} role
 * @param {AuthPermissionRoleRemovePermissionsBody} body
 * @returns {Promise<void>}
 */
export async function authPermissionRoleRemovePermissions(
  event,
  sql,
  role,
  body,
) {
  eventStart(event, "authPermission.roleRemovePermissions");

  const rolePermissionIds = [];

  for (const permission of body.permissions) {
    // @ts-expect-error
    const foundRolePermission = role.permissions.find(
      // @ts-expect-error
      (it) => it.permission.identifier === permission,
    );

    if (!foundRolePermission) {
      throw AppError.validationError(
        "authPermission.roleRemovePermissions.permissionNotAssigned",
        {
          permission,
        },
      );
    }

    rolePermissionIds.push(foundRolePermission.id);
  }

  await queries.rolePermissionDelete(sql, {
    idIn: rolePermissionIds,
  });

  eventStop(event);
}

/**
 * Return the roles and deduplicated permissions for a user
 *
 * @param {QueryResultAuthUser} user
 * @returns {AuthPermissionUserSummaryResponse}
 */
export function authPermissionUserSummary(user) {
  const permissions = new Set();
  const roles = [];

  // @ts-expect-error
  for (const role of user.roles) {
    roles.push({
      // @ts-expect-error
      id: role.role.id,
      // @ts-expect-error
      identifier: role.role.identifier,
    });

    // @ts-expect-error
    for (const rolePermission of role.role.permissions) {
      permissions.add(rolePermission.permission.identifier);
    }
  }

  return {
    roles: roles.sort((a, b) => a.identifier.localeCompare(b.identifier)),
    permissions: [...permissions].sort(),
  };
}

/**
 * Add a role to the provided user
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {QueryResultBackendTenant} tenant
 * @param {QueryResultAuthUser} user
 * @param {AuthPermissionUserAssignRoleBody} body
 * @returns {Promise<void>}
 */
export async function authPermissionUserAssignRole(
  event,
  sql,
  tenant,
  user,
  body,
) {
  eventStart(event, "authPermission.userAssignRole");

  // @ts-expect-error
  if (user.roles.find((it) => it.role.id === body.role)) {
    throw AppError.validationError("authPermission.userAssignRole.userHasRole");
  }

  const [role] = await queryRole({
    where: {
      id: body.role,
      $or: [
        {
          tenantIsNull: true,
        },
        { tenant: tenant.id },
      ],
    },
  }).exec(sql);

  if (isNil(role) || typeof body.role !== "string") {
    throw AppError.validationError("authPermission.userAssignRole.unknownRole");
  }

  await queries.userRoleInsert(sql, {
    user: user.id,
    role: role.id,
  });

  eventStop(event);
}

/**
 * Remove a role from the provided user
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {QueryResultAuthUser} user
 * @param {AuthPermissionUserRemoveRoleBody} body
 * @returns {Promise<void>}
 */
export async function authPermissionUserRemoveRole(event, sql, user, body) {
  eventStart(event, "authPermission.userRemoveRole");

  // @ts-expect-error
  const foundRole = user.roles.find((it) => it.role.id === body.role);

  if (!foundRole) {
    throw AppError.validationError(
      "authPermission.userRemoveRole.roleNotAssigned",
    );
  }

  await queries.userRoleDelete(sql, {
    id: foundRole.id,
  });

  eventStop(event);
}

/**
 * @typedef {object} AuthPermissionUserSyncRolesOptions
 * @property {string[]|undefined} [idIn]
 * @property {string[]|undefined} [identifierIn]
 */

/**
 * Sync roles for the provided user.
 *
 * Identifiers should either be an array of role id's or an array of role identifiers.
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {QueryResultAuthUser} user
 * @param {AuthPermissionUserSyncRolesOptions} identifiers
 * @returns {Promise<QueryResultAuthUser>}
 */
export async function authPermissionUserSyncRoles(
  event,
  sql,
  user,
  { idIn, identifierIn },
) {
  eventStart(event, "authPermission.userSyncRoles");

  if (isNil(user?.id)) {
    throw AppError.validationError("authPermission.userSyncRoles.invalidUser");
  }

  if (!isNil(idIn) && !isNil(identifierIn)) {
    throw AppError.validationError(
      "authPermission.userSyncRoles.invalidArgument",
      {
        message: "Only one of idIn or identifierIn can be supplied",
      },
    );
  }

  const identifiers = idIn ?? identifierIn ?? [];
  const isIdIn = isNil(identifierIn);

  if (identifiers.length === 0) {
    // Delete all existing roles and return
    await queries.userRoleDelete(sql, {
      user: user.id,
    });

    user.roles = [];

    eventStop(event);
    return user;
  }

  const { roles } = authPermissionUserSummary(user);
  // @ts-expect-error
  const existingRoleIds = roles.map((it) => it.id);
  // @ts-expect-error
  const existingRoleIdentifiers = roles.map((it) => it.identifier);

  const removedRoles = [];
  const newRoles = [];

  // @ts-expect-error
  for (const role of roles) {
    if (isIdIn && !identifiers.includes(role.id)) {
      removedRoles.push(role);
    }

    if (!isIdIn && !identifiers.includes(role.identifier)) {
      removedRoles.push(role);
    }
  }

  for (const identifier of identifiers) {
    if (isIdIn && !existingRoleIds.includes(identifier)) {
      newRoles.push(identifier);
    }
    if (!isIdIn && !existingRoleIdentifiers.includes(identifier)) {
      newRoles.push(identifier);
    }
  }

  if (removedRoles.length !== 0) {
    await queries.userRoleDelete(sql, {
      user: user.id,
      roleIn: removedRoles.map((it) => it.id),
    });
  }

  if (newRoles.length !== 0) {
    const dbRoles = await queryRole({
      where: {
        ...(isIdIn ? { idIn: newRoles } : { identifierIn: newRoles }),
      },
    }).exec(sql);

    if (dbRoles.length !== newRoles.length) {
      throw AppError.validationError(
        "authPermission.userSyncRoles.unknownRoleIdentifier",
        {
          identifiers,
        },
      );
    }

    await queries.userRoleInsert(
      sql,
      dbRoles.map((it) => ({
        user: user.id,
        role: it.id,
      })),
    );
  }

  user.roles = await queryUserRole({
    where: {
      user: user.id,
    },
    role: {
      permissions: {
        permission: {},
      },
    },
  }).exec(sql);

  eventStop(event);

  return user;
}
