import { newEventFromEvent } from "@compas/stdlib";
import { sessionStoreCreate, sessionStoreInvalidate } from "@compas/store";
import { multitenantRequireTenant } from "../../multitenant/events.js";
import { sessionStoreSettings, sql } from "../../services.js";
import {
  importProjectResource,
  normalizeSessionErrorsToUnauthorizedAndThrow,
} from "../../util.js";
import { sessionStoreObjectSymbol } from "../constants.js";
import { authSessionAppendDevice } from "../session/events.js";
import { authCombineUsers } from "../user.events.js";
import {
  authDigidBasedCallGetSettingsFunction,
  authDigidBasedFindByBsn,
  authDigidBasedFormatMetadata,
  authDigidBasedGetRedirectUrl,
  authDigidBasedResolveArtifact,
} from "./events.js";

/**
 * @typedef {object} AuthDigidBasedSettings
 * @property {AuthDigidBasedKeyPair} keyPair
 * @property {string} issuer
 */

/**
 * @typedef {object} AuthDigidBasedGetSettingsOptions
 * @property {boolean|undefined} [isMetadataRequest]
 */

/**
 * @typedef {(ctx: import("@compas/server").Context<any, any, any>, options:
 *   AuthDigidBasedGetSettingsOptions) => AuthDigidBasedSettings|
 *   Promise<AuthDigidBasedSettings>} AuthDigidBasedGetSettings
 */

/**
 * @typedef {object} DigidBasedSettings
 * @property {AuthDigidBasedGetSettings} getSettingsFunction
 */

/**
 * @typedef {DigidBasedSettings & {
 *   determineTwoStepFunction: AuthDetermineTwoStepCheckFunction,
 *   combineUserCallbacks?: AuthCombineUserCallbacks,
 * }} InternalDigidBasedSettings
 */

/**
 * @param {InternalDigidBasedSettings} settings
 * @returns {Promise<void>}
 */
export async function applyDigidBasedController(settings) {
  /**
   * @type {typeof
   *   import("../../../../../src/generated/application/authDigidBased/controller.js")}
   */
  const controller = await importProjectResource(
    "./src/generated/application/authDigidBased/controller.js",
  );

  controller.authDigidBasedHandlers.metadata = async (ctx, next) => {
    const { keyPair, issuer } = await authDigidBasedCallGetSettingsFunction(
      ctx,
      settings.getSettingsFunction,
      {
        isMetadataRequest: true,
      },
    );

    ctx.body = await authDigidBasedFormatMetadata(
      newEventFromEvent(ctx.event),
      keyPair,
      issuer,
    );

    if (next) {
      return next();
    }
  };

  controller.authDigidBasedHandlers.redirect = async (ctx, next) => {
    const { keyPair, issuer } = await authDigidBasedCallGetSettingsFunction(
      ctx,
      settings.getSettingsFunction,
    );

    ctx.body = {
      digidUrl: await authDigidBasedGetRedirectUrl(
        newEventFromEvent(ctx.event),
        keyPair,
        issuer,
      ),
    };

    if (next) {
      return next();
    }
  };

  controller.authDigidBasedHandlers.login = async (ctx, next) => {
    const { tenant } = await multitenantRequireTenant(
      newEventFromEvent(ctx.event),
      ctx,
    );

    const { keyPair, issuer } = await authDigidBasedCallGetSettingsFunction(
      ctx,
      settings.getSettingsFunction,
    );

    await sql.begin(async (sql) => {
      const user = await sql.savepoint(async (sql) => {
        const bsn = await authDigidBasedResolveArtifact(
          newEventFromEvent(ctx.event),
          keyPair,
          ctx.validatedBody.SAMLArt,
          issuer,
        );

        const user = await authDigidBasedFindByBsn(
          newEventFromEvent(ctx.event),
          sql,
          tenant,
          bsn,
        );

        return await authCombineUsers(
          newEventFromEvent(ctx.event),
          sql,
          ctx,
          tenant,
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

      const newSessionResult = await sessionStoreCreate(
        newEventFromEvent(ctx.event),
        sql,
        sessionStoreSettings,
        {
          type: "user",
          loginType: "digidBased",
          ...set2FACheck,
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
}
