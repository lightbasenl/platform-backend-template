import { successResponse } from "../../structure.js";
import { authPermissions } from "../constants.js";

/**
 * Extend the app with the auth totp two-step capabilities
 *
 * @see extendWithBackendBase
 *
 * @param {import("@compas/code-gen").App} app
 * @returns {Promise<void>}
 */
export async function extendWithAuthTotpProvider(app) {
  const { TypeCreator } = await import("@compas/code-gen");
  const T = new TypeCreator("authTotpProvider");
  const R = T.router("/auth/totp-provider");

  const totp = T.string().min(6).max(6).pattern(/\d{6}/gi);

  app.add(
    R.get("/", "info")
      .docs(`Check if TOTP is set up and if the setup is verified.`)
      .response({
        isConfigured: T.bool(),
        isVerified: T.bool(),
      }),

    R.post("/setup", "setup")
      .docs(
        `Initiate the totp provider setup. The setup needs to be verified via
\`apiAuthTotpProviderSetupVerify\`. If an existing totp setup is not yet verified,
the original one is removed, and a new setup is initiated.

Errors:
- \`authTotpProvider.setup.alreadySetUp\` -> an existing totp setup exists, and is
  already verified.`,
      )
      .body({})
      .response({
        otpAuthUrl: T.string(),
        secret: T.string(),
        algorithm: "sha512",
      }),

    R.post("/setup/verify", "setupVerify")
      .docs(
        `Verify the initiated setup via \`apiAuthTotpProviderSetup\`.

Errors:
- \`authTotpProvider.setupVerify.totpNotConfigured\` -> \`setupVerify\` is called,
  but \`setup\` isn't. So nothing to verify.
- \`authTotpProvider.setupVerify.totpAlreadyVerified\` -> setup is already
  verified.
- \`authTotpProvider.setupVerify.invalidTotp\` -> invalid \`totp\` to verify the
  setup.`,
      )
      .body({
        totp,
      })
      .response(successResponse),

    R.post("/verify", "verify")
      .docs(
        `Call this when \`ctx.session.type === "checkTwoStep"\`. Advances the session to
\`type: user\` on a successful verification.

Errors:
- \`authTotpProvider.verify.totpNotConfigured\` -> verify is called, while no totp
  is configured for this user.
- \`authTotpProvider.verify.totpNotVerified\` -> totp is not verified, can only
  happen if multiple two-step providers are configured, and the wrong one is
  selected.
- \`authTotpProvider.verify.invalidTotp\` -> invalid \`totp\`, prompt user for a new
  totp.`,
      )
      .body({
        totp,
      })
      .response(successResponse),

    R.delete("/remove", "remove")
      .docs(
        `Remove the totp setup, we expect that users have short-lived sessions. So no
extra verification is required to remove the totp setup.

Errors:
- \`authTotpProvider.remove.totpNotConfigured\` -> remove is called, while no totp
  is configured for this user.`,
      )
      .response(successResponse),

    R.delete("/user/:user/remove", "removeForUser")
      .docs(
        `Remove the totp setup for the provided user.

Errors:
- Inherits \`authRequireUser\` errors with the \`authTotpProvider.removeForUser\`
  eventKey.
- \`authTotpProvider.removeForUser\` -> remove is called for a user that doesn't
  have totp configured.`,
      )
      .params({
        user: T.uuid(),
      })
      .response(successResponse)
      .tags(authPermissions.authTotpManage),
  );
}
