/**
 * Store the session store object including `id`, and `checksum` on a symbol, since
 * platforms shouldn't access it directly.
 *
 * @type {symbol}
 */
export const sessionStoreObjectSymbol = Symbol(
  "lightbase.backend.sessionStoreObject",
);

/**
 * Bcrypt cost factor. When single core computation capabilities increase, this number
 * should be increased as well.
 *
 * @type {number}
 */
export const BCRYPT_DEFAULT_COST = 13;

/**
 * This object contains all event names that are fired in the loaded events. It
 * uses the 'job-queue' as a basis for a message bus. The events are added with a
 * low priority. This can be used to send emails or do other business logic based
 * on an event in the auth systems. The specific routes firing these events, describe
 * what kind of metadata is added.
 *
 * @readonly
 * @enum {string}
 */
export const authEventNames = {
  authUserSoftDeleted: "auth.user.softDeleted",
  authAnonymousBasedUserRegistered: "auth.anonymousBased.userRegistered",
  authDigidBasedUserRegistered: "auth.digidBased.userRegistered",
  authKeycloakBasedUserRegistered: "auth.keycloakBased.userRegistered",
  authPasswordBasedRequestOtp: "auth.passwordBased.requestOtp",
  authPasswordBasedPasswordUpdated: "auth.passwordBased.passwordUpdated",
  authPasswordBasedEmailUpdated: "auth.passwordBased.emailUpdated",
  authPasswordBasedLoginVerified: "auth.passwordBased.loginVerified",
  authPasswordBasedPasswordReset: "auth.passwordBased.passwordReset",
  authPasswordBasedForgotPassword: "auth.passwordBased.forgotPassword",
  authPasswordBasedUserRegistered: "auth.passwordBased.userRegistered",
};

/**
 * Keys for all jobs that the auth system uses. It isn't mandatory to use this key, since
 * the job should be registered by the platform user. However it makes for consistent
 * usage over platforms.
 *
 * @readonly
 * @enum {string}
 */
export const authJobNames = {
  authPasswordBasedInvalidateResetTokens:
    "auth.passwordBased.invalidateResetTokens",
};

export const authStringPrefixes = {
  anonymousToken: `auth-anonymous`,
  passwordVerifyToken: `auth-verify`,
  passwordResetToken: `auth-reset`,
};

/**
 * Permissions to supply to `extendWithAuthPermission` when you want to enable the
 * 'management' routes.
 *
 * @type {Record<string, AuthPermissionIdentifier>}
 */
export const authPermissions = {
  /**
   * Allow user to list all users
   */
  authUserList: "auth:user:list",

  /**
   * Allow user to manage base settings of all users
   */
  authUserManage: "auth:user:manage",

  /**
   * Allow user to manager roles and permissions
   */
  authPermissionManage: "auth:permission:manage",

  /**
   * Create Keycloak users
   */
  authKeycloakUserCreate: "auth:keycloak:user:create",

  /**
   * Allow user to reset totp of all users
   */
  authTotpManage: "auth:totp:manage",
};
