import { AppError, environment, eventStart, eventStop } from "@compas/stdlib";
import speakeasy from "speakeasy";
import { queries } from "../../services.js";

/**
 * Get information about the totp settings for the provided user.
 */
export function authTotpProviderInfo(user) {
  return {
    isConfigured: !!user?.totpSettings,
    isVerified: !!user?.totpSettings?.verifiedAt,
  };
}

/**
 * Setup totp for the specified user. Needs to be verified to complete the setup.
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {QueryResultAuthUser} user
 * @returns {Promise<AuthTotpProviderSetupResponse>}
 */
export async function authTotpProviderSetup(event, sql, user) {
  eventStart(event, "authTotpProvider.setup");

  if (user.totpSettings?.verifiedAt) {
    throw AppError.validationError("authTotpProvider.setup.alreadyConfigured");
  } else if (user.totpSettings) {
    await queries.totpSettingsDelete(sql, {
      id: user.totpSettings.id,
    });
  }

  const secretObject = speakeasy.generateSecret({});
  const otpAuthUrl = speakeasy.otpauthURL({
    secret: secretObject.base32,
    algorithm: "sha512",
    encoding: "base32",
    label: environment.APP_NAME,
  });

  await queries.totpSettingsInsert(sql, {
    user: user.id,
    secret: secretObject.base32,
  });

  eventStop(event);

  return {
    otpAuthUrl,
    secret: secretObject.base32,
    algorithm: "sha512",
  };
}

/**
 * Verify and enable the totp setup
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {QueryResultAuthUser} user
 * @param {AuthTotpProviderSetupVerifyBody} body
 * @returns {Promise<void>}
 */
export async function authTotpProviderSetupVerify(event, sql, user, body) {
  eventStart(event, "authTotpProvider.setupVerify");

  if (!user.totpSettings) {
    throw AppError.validationError(
      "authTotpProvider.setupVerify.totpNotConfigured",
    );
  }

  if (user.totpSettings.verifiedAt) {
    throw AppError.validationError(
      "authTotpProvider.setupVerify.totpAlreadyVerified",
    );
  }

  const tokenValid = speakeasy.totp.verify({
    secret: user.totpSettings.secret,
    encoding: "base32",
    token: body.totp,
    window: 1,
    algorithm: "sha512",
  });

  if (!tokenValid) {
    throw AppError.validationError("authTotpProvider.setupVerify.invalidTotp");
  }

  await queries.totpSettingsUpdate(sql, {
    update: {
      verifiedAt: new Date(),
    },
    where: {
      id: user.totpSettings.id,
    },
  });

  eventStop(event);
}

/**
 * Verify totp token
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {QueryResultAuthUser} user
 * @param {AuthTotpProviderSetupVerifyBody} body
 * @returns {void}
 */
export function authTotpProviderVerify(event, user, body) {
  eventStart(event, "authTotpProvider.verify");

  if (!user.totpSettings) {
    throw AppError.validationError("authTotpProvider.verify.totpNotConfigured");
  }

  if (!user.totpSettings.verifiedAt) {
    throw AppError.validationError("authTotpProvider.verify.totpNotVerified");
  }

  const tokenValid = speakeasy.totp.verify({
    secret: user.totpSettings.secret,
    encoding: "base32",
    token: body.totp,
    window: 1,
    algorithm: "sha512",
  });

  if (!tokenValid) {
    throw AppError.validationError("authTotpProvider.verify.invalidTotp");
  }

  eventStop(event);
}

/**
 * Verify totp token
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {QueryResultAuthUser} user
 * @returns {Promise<void>}
 */
export async function authTotpProviderRemove(event, sql, user) {
  eventStart(event, "authTotpProvider.remove");

  if (!user.totpSettings) {
    throw AppError.validationError("authTotpProvider.remove.totpNotConfigured");
  }

  await queries.totpSettingsDelete(sql, {
    id: user.totpSettings.id,
  });

  eventStop(event);
}

/**
 * Remove the totp settings for the provided user.
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param { QueryResultAuthUser} user
 * @returns {Promise<void>}
 */
export async function authTotpProviderRemoveForUser(event, sql, user) {
  eventStart(event, "authTotpProvider.removeForUser");

  if (!user.totpSettings) {
    throw AppError.validationError(
      "authTotpProvider.removeForUser.totpNotConfigured",
    );
  }

  await queries.totpSettingsDelete(sql, {
    id: user.totpSettings.id,
  });

  eventStop(event);
}
