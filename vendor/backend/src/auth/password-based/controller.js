import { AppError, newEventFromEvent } from "@compas/stdlib";
import {
  sessionStoreCreate,
  sessionStoreInvalidate,
  sessionStoreUpdate,
} from "@compas/store";
import { backendGetTenantAndUser } from "../../events.js";
import { multitenantRequireTenant } from "../../multitenant/events.js";
import {
  sessionDurationCallback,
  sessionStoreSettings,
  sql,
} from "../../services.js";
import {
  importProjectResource,
  normalizeSessionErrorsToUnauthorizedAndThrow,
} from "../../util.js";
import { sessionStoreObjectSymbol } from "../constants.js";
import { authSessionAppendDevice } from "../session/events.js";
import { authCombineUsers } from "../user.events.js";
import {
  authPasswordBasedForgotPassword,
  authPasswordBasedListEmails,
  authPasswordBasedLogin,
  authPasswordBasedResetPassword,
  authPasswordBasedShouldUserUpdatePassword,
  authPasswordBasedUpdateEmail,
  authPasswordBasedUpdatePassword,
  authPasswordBasedVerifyEmail,
  authPasswordBasedVerifyOtp,
} from "./events.js";

/**
 * @typedef {{}} PasswordBasedSettings
 */

/**
 * @typedef {PasswordBasedSettings & {
 *   determineTwoStepFunction: AuthDetermineTwoStepCheckFunction,
 *   combineUserCallbacks?: AuthCombineUserCallbacks,
 * }} InternalPasswordBasedSettings
 */

/**
 *
 * @param {InternalPasswordBasedSettings} settings
 * @returns {Promise<void>}
 */
export async function applyPasswordBasedController(settings) {
  /**
   * @type {typeof
   *   import("../../../../../src/generated/application/authPasswordBased/controller.js")}
   */
  const controller = await importProjectResource(
    "./src/generated/application/authPasswordBased/controller.js",
  );

  controller.authPasswordBasedHandlers.verifyOtp = async (ctx, next) => {
    const { user } = await backendGetTenantAndUser(ctx, {
      skipSessionIsUserCheck: true,
    });

    authPasswordBasedVerifyOtp(
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

  controller.authPasswordBasedHandlers.verifyEmail = async (ctx, next) => {
    const resolvedTenant = await multitenantRequireTenant(
      newEventFromEvent(ctx.event),
      ctx,
    );

    await sql.begin(async (sql) => {
      const user = await sql.savepoint(async (sql) => {
        const user = await authPasswordBasedVerifyEmail(
          newEventFromEvent(ctx.event),
          sql,
          resolvedTenant,
          ctx.validatedBody,
        );

        return await authCombineUsers(
          newEventFromEvent(ctx.event),
          sql,
          ctx,
          resolvedTenant.tenant,
          user,
          settings.combineUserCallbacks,
        );
      });

      if (ctx[sessionStoreObjectSymbol]) {
        const invalidateResult = await sessionStoreInvalidate(
          newEventFromEvent(ctx.event),
          sql,
          ctx[sessionStoreObjectSymbol],
        );

        if (invalidateResult.error) {
          normalizeSessionErrorsToUnauthorizedAndThrow(invalidateResult.error);
        }
      }

      const set2FACheck =
        typeof settings.determineTwoStepFunction === "function" &&
        (settings.determineTwoStepFunction(user) ?? {});
      const setUpdatePassword = authPasswordBasedShouldUserUpdatePassword(user);

      const newSessionResult = await sessionStoreCreate(
        newEventFromEvent(ctx.event),
        sql,
        {
          ...sessionStoreSettings,
          tokenMaxAgeResolver: (sql, session) => {
            return sessionDurationCallback(session, user, {
              session: session.id,
              ...ctx.validatedBody.device,
            });
          },
        },
        {
          type: "user",
          loginType: "passwordBased",
          ...set2FACheck,
          ...setUpdatePassword,
          userId: user.id,
        },
      );

      if (newSessionResult.error) {
        normalizeSessionErrorsToUnauthorizedAndThrow(newSessionResult.error);
      }

      await authSessionAppendDevice(
        newEventFromEvent(ctx.event),
        sql,
        user.id,
        newSessionResult.value.accessToken,
        ctx.validatedBody.device,
      );

      ctx.body = newSessionResult.value;
    });

    if (next) {
      return next();
    }
  };

  controller.authPasswordBasedHandlers.forgotPassword = async (ctx, next) => {
    const resolvedTenant = await multitenantRequireTenant(
      newEventFromEvent(ctx.event),
      ctx,
    );

    await sql.begin((sql) =>
      authPasswordBasedForgotPassword(
        newEventFromEvent(ctx.event),
        sql,
        resolvedTenant,
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

  controller.authPasswordBasedHandlers.resetPassword = async (ctx, next) => {
    const resolvedTenant = await multitenantRequireTenant(
      newEventFromEvent(ctx.event),
      ctx,
    );

    await sql.begin((sql) =>
      authPasswordBasedResetPassword(
        newEventFromEvent(ctx.event),
        sql,
        resolvedTenant,
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

  controller.authPasswordBasedHandlers.login = async (ctx, next) => {
    const resolvedTenant = await multitenantRequireTenant(
      newEventFromEvent(ctx.event),
      ctx,
    );

    await sql.begin(async (sql) => {
      const user = await sql.savepoint(async (sql) => {
        const user = await authPasswordBasedLogin(
          newEventFromEvent(ctx.event),
          sql,
          resolvedTenant,
          ctx.validatedBody,
        );

        return await authCombineUsers(
          newEventFromEvent(ctx.event),
          sql,
          ctx,
          resolvedTenant.tenant,
          user,
          settings.combineUserCallbacks,
        );
      });

      if (ctx[sessionStoreObjectSymbol]) {
        const invalidateResult = await sessionStoreInvalidate(
          newEventFromEvent(ctx.event),
          sql,
          ctx[sessionStoreObjectSymbol],
        );

        if (invalidateResult.error) {
          normalizeSessionErrorsToUnauthorizedAndThrow(invalidateResult.error);
        }
      }

      const set2FACheck =
        typeof settings.determineTwoStepFunction === "function" &&
        (settings.determineTwoStepFunction(user) ?? {});
      const setUpdatePassword = authPasswordBasedShouldUserUpdatePassword(user);

      const newSessionResult = await sessionStoreCreate(
        newEventFromEvent(ctx.event),
        sql,
        {
          ...sessionStoreSettings,
          tokenMaxAgeResolver: (sql, session) => {
            return sessionDurationCallback(session, user, {
              session: session.id,
              ...ctx.validatedBody.device,
            });
          },
        },
        {
          type: "user",
          loginType: "passwordBased",
          ...set2FACheck,
          ...setUpdatePassword,
          userId: user.id,
        },
      );

      if (newSessionResult.error) {
        normalizeSessionErrorsToUnauthorizedAndThrow(newSessionResult.error);
      }

      await authSessionAppendDevice(
        newEventFromEvent(ctx.event),
        sql,
        user.id,
        newSessionResult.value.accessToken,
        ctx.validatedBody.device,
      );

      ctx.body = newSessionResult.value;
    });

    if (next) {
      return next();
    }
  };

  controller.authPasswordBasedHandlers.listEmails = async (ctx, next) => {
    const { user } = await backendGetTenantAndUser(ctx);

    ctx.body = authPasswordBasedListEmails(user);

    if (next) {
      return next();
    }
  };

  controller.authPasswordBasedHandlers.updateEmail = async (ctx, next) => {
    const { resolvedTenant, user } = await backendGetTenantAndUser(ctx, {
      requirePasswordBased: true,
    });

    await sql.begin((sql) =>
      authPasswordBasedUpdateEmail(
        newEventFromEvent(ctx.event),
        sql,
        resolvedTenant,
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

  controller.authPasswordBasedHandlers.updatePassword = async (ctx, next) => {
    const { resolvedTenant, user } = await backendGetTenantAndUser(ctx, {
      requirePasswordBased: true,
      skipSessionIsUserCheck: true,
    });

    if (ctx.session.type === "checkTwoStep") {
      throw AppError.validationError(`auth.requireUser.incorrectSessionType`);
    }

    await sql.begin((sql) =>
      authPasswordBasedUpdatePassword(
        newEventFromEvent(ctx.event),
        sql,
        resolvedTenant,
        user,
        ctx[sessionStoreObjectSymbol],
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
}
