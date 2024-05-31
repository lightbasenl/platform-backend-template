export { extendWithBackendBase } from "./structure.js";

export { backendInitServices } from "./services.js";
export { backendGetConfig, backendInit } from "./init.js";
export { backendGetTenantAndUser } from "./events.js";

export { extendWithManagement } from "./management/structure.js";
export { managementInvalidateUsers } from "./management/jobs.js";

export { tenantCache } from "./multitenant/cache.js";
export {
  multitenantConfigForTenant,
  multitenantEnabledTenantNames,
} from "./multitenant/config.js";
export {
  multitenantRequireTenant,
  multitenantInjectAxios,
} from "./multitenant/events.js";

export { extendWithFeatureFlag } from "./feature-flag/structure.js";
export { featureFlagCache } from "./feature-flag/cache.js";
export {
  featureFlagGetDynamic,
  featureFlagSetDynamic,
} from "./feature-flag/events.js";

export {
  authEventNames,
  authJobNames,
  authPermissions,
} from "./auth/constants.js";

export {
  authIpCheck,
  authLoadSession,
  authLoadSessionOptionally,
  authSaveSession,
  authInjectTokenInterceptors,
} from "./auth/events.js";

export {
  authImpersonateStartSession,
  authImpersonateIsInSession,
} from "./auth/impersonate.events.js";

export {
  authRequireUser,
  authCreateUser,
  authTestCreateUser,
  authUserAddTenant,
} from "./auth/user.events.js";

export { extendWithAuthPermission } from "./auth/permissions/structure.js";
export {
  authPermissionRoleList,
  authPermissionUserSummary,
  authPermissionUserSyncRoles,
  authPermissionUserAssignRole,
  authPermissionUserRemoveRole,
  authPermissionRoleAddPermissions,
  authPermissionRoleRemovePermissions,
} from "./auth/permissions/events.js";

export { extendWithAuthAnonymousBased } from "./auth/anonymous-based/structure.js";
export {
  authAnonymousBasedGetSessionForUser,
  authAnonymousBasedRegister,
} from "./auth/anonymous-based/events.js";

export { extendWithAuthDigiDBased } from "./auth/digid-based/structure.js";
export {
  authDigidBasedRegister,
  authDigidBasedVerifyKeyPair,
} from "./auth/digid-based/events.js";

export { extendWithAuthKeycloakBased } from "./auth/keycloak-based/structure.js";
export { authKeycloakBasedRegister } from "./auth/keycloak-based/events.js";

export { extendWithAuthPasswordBased } from "./auth/password-based/structure.js";
export {
  authPasswordBasedRegister,
  authPasswordBasedVerifyEmail,
} from "./auth/password-based/events.js";
export { authPasswordBasedInvalidateResetTokens } from "./auth/password-based/jobs.js";

export { extendWithAuthTotpProvider } from "./auth/totp-provider/structure.js";
