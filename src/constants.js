import { authPermissions } from "@lightbasenl/backend";

/**
 * @type {BackendFeatureFlagDefinitionInput}
 */
export const featureFlagDefinition = {
  availableFlags: [],
};

/**
 * Static permission object
 *
 * Example permission:
 * ```json
 * {
 *   "scaffoldDummyCreate": "scaffold:dummy:create"
 * }
 * ```
 *
 * @type {Record<string, AuthPermissionIdentifier>}
 */
export const permissions = {};

/** @type {PermissionBuildMandatoryRoles} */
export const buildMandatoryRoles = (tenants) => {
  return tenants.map((it) => ({
    identifier: "admin",
    tenantId: it.id,
    permissions: [...Object.values(authPermissions)],
  }));
};
