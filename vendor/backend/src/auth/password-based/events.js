import {
  AppError,
  eventStart,
  eventStop,
  isNil,
  newEventFromEvent,
  uuid,
} from "@compas/stdlib";
import { query, queueWorkerAddJob } from "@compas/store";
import bcrypt from "bcrypt";
import speakeasy from "speakeasy";
import { featureFlagGetDynamic } from "../../feature-flag/events.js";
import {
  passwordBasedForcePasswordResetAfterSixMonths,
  passwordBasedRollingLoginAttemptBlock,
  queries,
  queryUser,
  shouldPasswordBasedUpdatePasswordRemoveCurrentSession,
  sql as serviceSql,
  userBuilder,
} from "../../services.js";
import {
  authEventNames,
  authStringPrefixes,
  BCRYPT_DEFAULT_COST,
} from "../constants.js";

/**
 * Check if a user should be forced to update their password.
 *
 * @param {QueryResultAuthUser} user
 * @returns {Pick<AuthSession, "type">|{}}
 */
export function authPasswordBasedShouldUserUpdatePassword(user) {
  if (!passwordBasedForcePasswordResetAfterSixMonths) {
    return {};
  }

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  // @ts-expect-error
  if (user.passwordLogin.updatedAt < sixMonthsAgo) {
    return {
      type: "passwordBasedUpdatePassword",
    };
  }

  return {};
}

/**
 * Login checks, returns the logged in user.
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {BackendResolvedTenant} resolvedTenant
 * @param {AuthPasswordBasedLoginBody} body
 * @returns {Promise<QueryResultAuthUser>}
 */
export async function authPasswordBasedLogin(event, sql, resolvedTenant, body) {
  eventStart(event, "authPasswordBased.login");

  const [user] = await queryUser({
    ...userBuilder,
    where: {
      viaTenants: {
        where: {
          tenant: resolvedTenant.tenant.id,
        },
      },
      viaPasswordLogin: {
        where: {
          email: body.email,
        },
      },
    },
  }).exec(sql);

  const reduceErrorKeyInfoFlag = await featureFlagGetDynamic(
    newEventFromEvent(event),
    undefined,
    undefined,
    "__FEATURE_LPC_AUTH_REDUCE_ERROR_KEY_INFO",
  );

  if (isNil(user)) {
    if (reduceErrorKeyInfoFlag) {
      // Do some work to prevent time-base leaking that the user is known.
      await bcrypt.compare(
        "abcdefghijk",
        `$2b$${BCRYPT_DEFAULT_COST}$t7oxiwchWGHa/B9w0AzrYO2WH2rQbA86YSuQjSTmwIrpC/0ZXN7V2`,
      );
      throw AppError.validationError(
        "authPasswordBased.login.invalidEmailPasswordCombination",
      );
    } else {
      throw AppError.validationError("authPasswordBased.login.unknownEmail");
    }
  }

  if (passwordBasedRollingLoginAttemptBlock) {
    const fiveMinutesAgo = new Date();
    fiveMinutesAgo.setMinutes(fiveMinutesAgo.getMinutes() - 5);

    const attemptCount = await queries.passwordLoginAttemptCount(sql, {
      createdAtGreaterThan: fiveMinutesAgo,

      // @ts-expect-error
      passwordLogin: user.passwordLogin.id,
    });

    if (attemptCount >= 10) {
      // Register a failed password login attempt, even if it already exceeded.
      await queries.passwordLoginAttemptInsert(serviceSql, {
        // @ts-expect-error
        passwordLogin: user.passwordLogin.id,
      });

      throw AppError.validationError(`${event.name}.maxAttemptsExceeded`);
    }
  }

  const passwordCheck = await bcrypt.compare(
    body.password, // @ts-expect-error
    user.passwordLogin.password,
  );

  if (!passwordCheck) {
    // Register a failed password login attempt
    await queries.passwordLoginAttemptInsert(serviceSql, {
      // @ts-expect-error
      passwordLogin: user.passwordLogin.id,
    });

    throw AppError.validationError(
      "authPasswordBased.login.invalidEmailPasswordCombination",
    );
  }

  if (isNil(user.passwordLogin?.verifiedAt)) {
    throw AppError.validationError("authPasswordBased.login.emailNotVerified");
  }

  user.lastLogin = new Date();
  await queries.userUpdate(sql, {
    update: {
      lastLogin: new Date(),
    },
    where: {
      id: user.id,
    },
  });

  // @ts-expect-error
  if (!user.passwordLogin.otpEnabledAt) {
    eventStop(event);
    return user;
  }

  // @ts-expect-error
  if (!user.passwordLogin.otpSecret) {
    const secretObject = speakeasy.generateSecret({});

    await queries.passwordLoginUpdate(sql, {
      update: {
        otpSecret: secretObject.base32,
      },
      where: {
        // @ts-expect-error
        id: user.passwordLogin.id,
      },
    });
    // @ts-expect-error
    user.passwordLogin.otpSecret = secretObject.base32;
  }

  const otp = speakeasy.totp({
    // @ts-expect-error
    secret: user.passwordLogin.otpSecret,
    encoding: "base32",
    algorithm: "sha512",
  });

  await queueWorkerAddJob(sql, {
    name: authEventNames.authPasswordBasedRequestOtp,
    priority: 4,
    data: {
      userId: user.id, // @ts-expect-error
      passwordLoginId: user.passwordLogin.id,
      otp,
      metadata: {
        tenant: {
          id: resolvedTenant.tenant.id,
          publicUrl: resolvedTenant.publicUrl,
          apiUrl: resolvedTenant.apiUrl,
        },
      },
    },
  });

  eventStop(event);

  return user;
}

/**
 * Return emails for this user, with the verified checks
 *
 * @param {QueryResultAuthUser} user
 * @returns {AuthPasswordBasedListEmailsResponse}
 */
export function authPasswordBasedListEmails(user) {
  // Support the case that email login may be enabled but not be available for this user.
  if (isNil(user.passwordLogin)) {
    return {
      emails: [],
    };
  }

  return {
    emails: [
      {
        email: user.passwordLogin.email,
        isVerified: !isNil(user.passwordLogin.verifiedAt),
        verifiedAt: user.passwordLogin.verifiedAt,
        createdAt: user.passwordLogin.createdAt,
      },
    ],
  };
}

/**
 * Update the password for the provided user
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {BackendResolvedTenant} resolvedTenant
 * @param {QueryResultAuthUser} user
 * @param {QueryResultStoreSessionStore} ctxSession
 * @param {AuthPasswordBasedUpdatePasswordBody} body
 * @returns {Promise<void>}
 */
export async function authPasswordBasedUpdatePassword(
  event,
  sql,
  resolvedTenant,
  user,
  ctxSession,
  body,
) {
  eventStart(event, "authPasswordBased.updatePassword");

  await queries.passwordLoginUpdate(sql, {
    update: {
      password: await bcrypt.hash(body.password, BCRYPT_DEFAULT_COST),
    },
    where: {
      // @ts-expect-error
      id: user.passwordLogin.id,
    },
  });

  if (shouldPasswordBasedUpdatePasswordRemoveCurrentSession) {
    await queries.sessionStoreDelete(sql, {
      $raw: query`"data"->>'userId' =
      ${user.id}`,
    });
  } else {
    await queries.sessionStoreDelete(sql, {
      idNotEqual: ctxSession.id,
      $raw: query`"data"->>'userId' =
      ${user.id}`,
    });
  }

  await queueWorkerAddJob(sql, {
    name: authEventNames.authPasswordBasedPasswordUpdated,
    priority: 4,
    data: {
      // @ts-expect-error
      passwordLoginId: user.passwordLogin.id,
      metadata: {
        tenant: {
          id: resolvedTenant.tenant.id,
          publicUrl: resolvedTenant.publicUrl,
          apiUrl: resolvedTenant.apiUrl,
        },
      },
    },
  });

  eventStop(event);
}

/**
 * Update the email of the provided user
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {BackendResolvedTenant} resolvedTenant
 * @param {QueryResultAuthUser} user
 * @param {AuthPasswordBasedUpdateEmailBody} body
 * @returns {Promise<void>}
 */
export async function authPasswordBasedUpdateEmail(
  event,
  sql,
  resolvedTenant,
  user,
  body,
) {
  eventStart(event, "authPasswordBased.updateEmail");

  const expiresAt = new Date();
  expiresAt.setUTCDate(expiresAt.getUTCDate() + 1);

  await queries.passwordLoginUpdate(sql, {
    update: {
      email: body.email,
      verifiedAt: null,
    },
    where: {
      // @ts-expect-error
      id: user.passwordLogin.id,
    },
  });

  const [resetToken] = await queries.passwordLoginResetInsert(sql, {
    // @ts-expect-error
    login: user.passwordLogin.id,
    resetToken: `auth-verify-${uuid()}`,
    shouldSetPassword: false,
    expiresAt,
  });

  await queries.sessionStoreDelete(sql, {
    $raw: query`"data"->>'userId' =
    ${user.id}`,
  });

  await queueWorkerAddJob(sql, {
    name: authEventNames.authPasswordBasedEmailUpdated,
    priority: 4,
    data: {
      // @ts-expect-error
      previousEmail: user.passwordLogin.email, // @ts-expect-error
      passwordLoginId: user.passwordLogin.id,
      passwordLoginResetId: resetToken.id,
      metadata: {
        tenant: {
          id: resolvedTenant.tenant.id,
          publicUrl: resolvedTenant.publicUrl,
          apiUrl: resolvedTenant.apiUrl,
        },
      },
    },
  });

  const [refetchedUser] = await queryUser({
    ...userBuilder,
    where: {
      id: user.id,
    },
  }).exec(sql);

  await authPasswordBasedCheckUnique(
    newEventFromEvent(event),
    sql,
    refetchedUser,
  );

  eventStop(event);
}

/**
 * Verify the OTP that was send out to the user.
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {QueryResultAuthUser} user
 * @param {AuthPasswordBasedVerifyOtpBody} body
 * @returns {void}
 */
export function authPasswordBasedVerifyOtp(event, user, body) {
  eventStart(event, "authPasswordBased.verifyOtp");

  if (!user.passwordLogin?.otpEnabledAt) {
    throw AppError.validationError("authPasswordBased.verifyOtp.notEnabled");
  }

  // Allow a 5m30s window for this OTP, giving the user room to find their email, etc.
  const tokenValid = speakeasy.totp.verify({
    secret: user.passwordLogin.otpSecret,
    encoding: "base32",
    token: body.otp,
    window: 11,
    algorithm: "sha512",
  });

  if (!tokenValid) {
    throw AppError.validationError("authPasswordBased.verifyOtp.invalid");
  }

  eventStop(event);
}

/**
 * Verify an email based on the verify token
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {BackendResolvedTenant} resolvedTenant
 * @param {AuthPasswordBasedVerifyEmailBody} body
 * @returns {Promise<QueryResultAuthUser>}
 */
export async function authPasswordBasedVerifyEmail(
  event,
  sql,
  resolvedTenant,
  body,
) {
  eventStart(event, "authPasswordBased.verifyEmail");

  const [user] = await queryUser({
    ...userBuilder,
    where: {
      viaPasswordLogin: {
        where: {
          viaResetTokens: {
            where: {
              resetToken: body.verifyToken,
              expiresAtGreaterThan: new Date(),
            },
          },
        },
      },
    },
  }).exec(sql);

  if (isNil(user)) {
    throw AppError.validationError(
      "authPasswordBased.verifyEmail.invalidVerifyToken",
    );
  }

  // @ts-expect-error
  const token = user.passwordLogin.resetTokens.find(
    (it) => it.resetToken === body.verifyToken,
  );

  const reduceErrorKeyInfoFlag = await featureFlagGetDynamic(
    newEventFromEvent(event),
    undefined,
    undefined,
    "__FEATURE_LPC_AUTH_REDUCE_ERROR_KEY_INFO",
  );

  if (token?.shouldSetPassword) {
    if (reduceErrorKeyInfoFlag) {
      throw AppError.validationError(
        "authPasswordBased.verifyEmail.invalidVerifyToken",
      );
    } else {
      throw AppError.validationError(
        "authPasswordBased.verifyEmail.useResetPassword",
      );
    }
  }

  // @ts-expect-error
  if (isNil(user.passwordLogin.verifiedAt)) {
    const [{ verifiedAt }] = await queries.passwordLoginUpdate(sql, {
      update: {
        verifiedAt: new Date(),
      },
      where: {
        // @ts-expect-error
        id: user.passwordLogin.id,
      },
      returning: ["verifiedAt"],
    });

    // @ts-expect-error
    user.passwordLogin.verifiedAt = verifiedAt;

    await queueWorkerAddJob(sql, {
      name: authEventNames.authPasswordBasedLoginVerified,
      priority: 4,
      data: {
        // @ts-expect-error
        passwordLoginId: user.passwordLogin.id,
        metadata: {
          tenant: {
            id: resolvedTenant.tenant.id,
            publicUrl: resolvedTenant.publicUrl,
            apiUrl: resolvedTenant.apiUrl,
          },
        },
      },
    });
  }

  eventStop(event);

  return user;
}

/**
 * Reset the password for the provided resetToken
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {BackendResolvedTenant} resolvedTenant
 * @param {AuthPasswordBasedResetPasswordBody} body
 * @returns {Promise<void>}
 */
export async function authPasswordBasedResetPassword(
  event,
  sql,
  resolvedTenant,
  body,
) {
  eventStart(event, "authPasswordBased.resetPassword");

  const [user] = await queryUser({
    ...userBuilder,
    where: {
      viaPasswordLogin: {
        where: {
          viaResetTokens: {
            where: {
              resetToken: body.resetToken,
              expiresAtGreaterThan: new Date(),
            },
          },
        },
      },
    },
  }).exec(sql);

  if (isNil(user)) {
    throw AppError.validationError(
      "authPasswordBased.resetPassword.invalidResetToken",
    );
  }

  // @ts-expect-error
  const token = user.passwordLogin.resetTokens.find(
    (it) => it.resetToken === body.resetToken,
  );

  const reduceErrorKeyInfoFlag = await featureFlagGetDynamic(
    newEventFromEvent(event),
    undefined,
    undefined,
    "__FEATURE_LPC_AUTH_REDUCE_ERROR_KEY_INFO",
  );

  if (!token?.shouldSetPassword) {
    if (reduceErrorKeyInfoFlag) {
      throw AppError.validationError(
        "authPasswordBased.resetPassword.invalidResetToken",
      );
    } else {
      throw AppError.validationError(
        "authPasswordBased.resetPassword.useVerifyEmail",
      );
    }
  }

  await queries.passwordLoginUpdate(sql, {
    update: {
      password: await bcrypt.hash(body.password, BCRYPT_DEFAULT_COST), // @ts-expect-error
      verifiedAt: user.passwordLogin.verifiedAt ?? new Date(),
    },
    where: {
      // @ts-expect-error
      id: user.passwordLogin.id,
    },
  });
  await queries.passwordLoginResetDelete(sql, {
    id: token.id,
  });

  await queueWorkerAddJob(sql, {
    name: authEventNames.authPasswordBasedPasswordReset,
    priority: 4,
    data: {
      // @ts-expect-error
      passwordLoginId: user.passwordLogin.id,
      metadata: {
        tenant: {
          id: resolvedTenant.tenant.id,
          publicUrl: resolvedTenant.publicUrl,
          apiUrl: resolvedTenant.apiUrl,
        },
      },
    },
  });

  eventStop(event);
}

/**
 * Create a forgot password token for the provided email
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {BackendResolvedTenant} resolvedTenant
 * @param {AuthPasswordBasedForgotPasswordBody} body
 * @returns {Promise<void>}
 */
export async function authPasswordBasedForgotPassword(
  event,
  sql,
  resolvedTenant,
  body,
) {
  eventStart(event, "authPasswordBased.forgotPassword");

  const [user] = await queryUser({
    ...userBuilder,
    where: {
      viaTenants: {
        where: {
          tenant: resolvedTenant.tenant.id,
        },
      },
      viaPasswordLogin: {
        where: {
          email: body.email,
        },
      },
    },
  }).exec(sql);

  const reduceErrorKeyInfoFlag = await featureFlagGetDynamic(
    newEventFromEvent(event),
    undefined,
    undefined,
    "__FEATURE_LPC_AUTH_REDUCE_ERROR_KEY_INFO",
  );

  if (isNil(user)) {
    if (reduceErrorKeyInfoFlag) {
      // Silently ignore, we may want to do some work here still. However, the timing
      // diff won't be that obvious like with password comparing.
      eventStop(event);
      return;
    }

    throw AppError.validationError(
      "authPasswordBased.forgotPassword.unknownEmail",
    );
  }

  const expiresAt = new Date();
  expiresAt.setUTCDate(expiresAt.getUTCDate() + 1);

  const [resetToken] = await queries.passwordLoginResetInsert(sql, {
    // @ts-expect-error
    login: user.passwordLogin.id,
    resetToken: `${authStringPrefixes.passwordResetToken}-${uuid()}`,
    shouldSetPassword: true,
    expiresAt,
  });

  await queueWorkerAddJob(sql, {
    name: authEventNames.authPasswordBasedForgotPassword,
    priority: 4,
    data: {
      // @ts-expect-error
      passwordLoginId: user.passwordLogin.id,
      passwordLoginResetId: resetToken.id,
      metadata: {
        tenant: {
          id: resolvedTenant.tenant.id,
          publicUrl: resolvedTenant.publicUrl,
          apiUrl: resolvedTenant.apiUrl,
        },
      },
    },
  });

  eventStop(event);
}

let _randomPasswordHash;

/**
 * @typedef {object} AuthPasswordBasedRegisterBody
 * @property {string} email
 * @property {string|undefined} [password]
 * @property {boolean|undefined} [randomPassword]
 * @property {Date|undefined} [verifiedAt]
 * @property {Date|undefined} [otpEnabledAt]
 * @property {object|undefined} [eventMetadata]
 */

/**
 * Adds a password login to the provided user and returns the user with everything
 * auth related joined.
 *
 * Errors:
 * - `authPasswordBased.register.invalidEmail` -> email argument is missing. For a
 *   good validator use `T.reference("auth", "email")`
 * - `authPasswordBased.register.invalidPassword` -> password argument is missing.
 * - `authPasswordBased.checkUnique.duplicateEmail` -> email is already in use
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {AuthUser|undefined} dbUser
 * @param {AuthPasswordBasedRegisterBody} body
 * @returns {Promise<QueryResultAuthUser>}
 */
export async function authPasswordBasedRegister(event, sql, dbUser, body) {
  eventStart(event, "authPasswordBased.register");

  if (typeof body?.email !== "string") {
    throw AppError.validationError("authPasswordBased.register.invalidEmail");
  }

  if (typeof body?.password !== "string" && body.randomPassword !== true) {
    throw AppError.validationError(
      "authPasswordBased.register.invalidPassword",
    );
  }

  // @ts-expect-error
  //
  // SQL should be in a transaction
  if (typeof sql.savepoint !== "function") {
    throw AppError.serverError({
      message: "Function should be called inside a sql transaction.",
    });
  }

  if (isNil(dbUser?.id)) {
    throw AppError.validationError(`${event.name}.missingUser`);
  }

  if (body.randomPassword && isNil(_randomPasswordHash)) {
    _randomPasswordHash = await bcrypt.hash(uuid(), 6);
  }

  const expiresAt = new Date();
  expiresAt.setUTCDate(expiresAt.getUTCDate() + 1);

  const password =
    body.randomPassword === true
      ? _randomPasswordHash
      : await bcrypt.hash(body.password, BCRYPT_DEFAULT_COST);
  const verifiedAt =
    body.verifiedAt ?? (body.randomPassword === true ? new Date() : null);

  const [passwordLogin] = await queries.passwordLoginInsert(sql, {
    email: body.email,
    password, // @ts-expect-error
    user: dbUser.id,
    verifiedAt,
    otpEnabledAt: body.otpEnabledAt,
  });

  const token =
    body.randomPassword === true
      ? `${authStringPrefixes.passwordResetToken}-${uuid()}`
      : `${authStringPrefixes.passwordVerifyToken}-${uuid()}`;

  const [resetToken] = await queries.passwordLoginResetInsert(sql, {
    login: passwordLogin.id,
    resetToken: token,
    shouldSetPassword: body.randomPassword === true,
    expiresAt,
  });

  await queueWorkerAddJob(sql, {
    name: authEventNames.authPasswordBasedUserRegistered,
    priority: 4,
    data: {
      passwordLoginId: passwordLogin.id,
      passwordLoginResetId: resetToken.id,
      metadata: {
        ...(body.eventMetadata ?? {}),
      },
    },
  });

  const [user] = await queryUser({
    ...userBuilder,
    where: {
      // @ts-expect-error
      id: dbUser.id,
    },
  }).exec(sql);

  await authPasswordBasedCheckUnique(newEventFromEvent(event), sql, user);

  eventStop(event);

  return user;
}

/**
 * Enforce the unique email constraint for this tenant
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {QueryResultAuthUser} user
 * @returns {Promise<void>}
 */
export async function authPasswordBasedCheckUnique(event, sql, user) {
  eventStart(event, "authPasswordBased.checkUnique");

  // @ts-expect-error
  //
  // SQL should be in a transaction
  if (typeof sql.savepoint !== "function") {
    throw AppError.serverError({
      message: "Function should be called inside a sql transaction.",
    });
  }

  if (!user.passwordLogin) {
    // User doesn't have a password login

    eventStop(event);
    return;
  }

  if (!Array.isArray(user.tenants)) {
    throw AppError.serverError({
      message: `'${event.name}' needs to be called with a user that has tenants joined.`,
    });
  }

  const existingUsers = (
    await Promise.all(
      user.tenants.map((it) =>
        queryUser({
          where: {
            idNotEqual: user.id,
            viaPasswordLogin: {
              where: {
                // @ts-expect-error
                email: user.passwordLogin.email,
              },
            },
            viaTenants: {
              where: {
                // @ts-expect-error
                tenant: it.tenant.id,
              },
            },
          },
        }).exec(sql),
      ),
    )
  ).flat();

  if (existingUsers.length > 0) {
    throw AppError.validationError(`${event.name}.duplicateEmail`);
  }

  eventStop(event);
}
