import { isNil } from "@compas/stdlib";
import { applyAnonymousBasedController } from "./anonymous-based/controller.js";
import { applyAuthController } from "./controller.js";
import { applyDigidBasedController } from "./digid-based/controller.js";
import { applyKeycloakBasedController } from "./keycloak-based/controller.js";
import { applyPasswordBasedController } from "./password-based/controller.js";
import { applyPermissionController } from "./permissions/controller.js";
import { applySessionController } from "./session/controller.js";
import { applyTotpProviderController } from "./totp-provider/controller.js";

/**
 * @typedef {{
 *   type: "checkTwoStep",
 *   twoStepType: string,
 * }|undefined} AuthDetermineTwoStepResult
 */

/**
 * @typedef {(
 *     user: QueryResultAuthUser
 *   ) => AuthDetermineTwoStepResult} AuthDetermineTwoStepCheckFunction
 */

/**
 * Apply the auth package with the provided settings.
 * Make sure to call `routerClearMemoizedHandlers` when calling `applyAuth` again on the
 * same controller.
 *
 * @param {BackendAuthConfig} options
 * @returns {Promise<void>}
 */
export async function applyAuth({
  combineUserCallbacks,
  permission,
  anonymousBased,
  digidBased,
  keycloakBased,
  passwordBased,
  totpProvider,
}) {
  /**
   * @type {AuthDetermineTwoStepCheckFunction}
   */
  const determineTwoStepFunction = (user) => {
    if (!isNil(user?.totpSettings?.verifiedAt)) {
      return {
        type: "checkTwoStep",
        twoStepType: "totpProvider",
      };
    } else if (!isNil(user?.passwordLogin?.otpEnabledAt)) {
      // TODO: what should happen if the user didn't login via passwordLogin?
      return {
        type: "checkTwoStep",
        twoStepType: "passwordBasedOtp",
      };
    }
  };

  await applyAuthController();
  await applySessionController({});

  if (permission) {
    await applyPermissionController({
      ...permission,
    });
  }

  if (anonymousBased) {
    await applyAnonymousBasedController({
      ...anonymousBased,
      determineTwoStepFunction,
      combineUserCallbacks,
    });
  }

  if (digidBased) {
    await applyDigidBasedController({
      ...digidBased,
      determineTwoStepFunction,
      combineUserCallbacks,
    });
  }

  if (keycloakBased) {
    await applyKeycloakBasedController({
      ...keycloakBased,
      determineTwoStepFunction,
      combineUserCallbacks,
    });
  }

  if (passwordBased) {
    await applyPasswordBasedController({
      ...passwordBased,
      determineTwoStepFunction,
      combineUserCallbacks,
    });
  }

  if (totpProvider) {
    await applyTotpProviderController();
  }
}
