import {
  authTokenPairType,
  emailType,
  successResponse,
} from "../../structure.js";
import { authPermissions } from "../constants.js";

/**
 * Extend the app with the keycloak based login capabilities.
 * When creating users implicitly is true, management routes are disabled
 *
 * @see extendWithBackendBase
 *
 * @param {import("@compas/code-gen").App} app
 * @param {{
 *    createUsersImplicitly?: boolean
 * }} [options={}]
 * @returns {Promise<void>}
 */
export async function extendWithAuthKeycloakBased(app, options = {}) {
  const { TypeCreator } = await import("@compas/code-gen");
  const T = new TypeCreator("authKeycloakBased");
  const R = T.router("/auth/keycloak-based");

  app.add(
    T.object("userRegisteredEventMetadata").keys({}),
    T.object("userRegisteredEventData").keys({
      keycloakLoginId: T.uuid(),
      metadata: T.reference("authKeycloakBased", "userRegisteredEventMetadata"),
    }),

    R.post("/redirect", "redirect")
      .docs(
        `Get the redirect url to let the user authorize via Keycloak. Keycloak will redirect the
user back to \`$publicUrl/keycloak\`.`,
      )
      .response({
        redirectUrl: T.string(),
      }),

    R.post("/login", "login")
      .docs(
        `Log the user in with the code from \`$publicUrl/keycloak?code=xxx-xxx\`. Is able
to automatically create a user when the \`implicitlyCreateUsers\` setting is
\`true\`. When the current user has no name, but the data from Keycloak contains a
name, it is set as \`user.name\`. Responds with an access and refresh token.

Errors:
- \`authKeycloakBased.resolveToken.invalidCode\` -> the provided \`code\` is invalid
- \`authKeycloakBased.verifyAndReadToken.invalidToken\` -> the fetched access
  token is invalid
- \`authKeycloakBased.login.unknownUser\` -> when no user is found with the email
  returned from Keycloak`,
      )
      .body({
        code: T.string().min(10),
        device: T.reference("session", "loginDevice").optional(),
      })
      .response(authTokenPairType(T)),

    R.post("/user/:user/update", "updateUser")
      .docs(
        `Update keycloak login properties for the specified user

Errors:
- Inherits \`authRequireUser\` errors with the
  \`authKeycloakBased.updateUser.requireUser\` eventKey.
- \`authKeycloakBased.updateUser.missingKeycloakLogin\` -> the specified user
  does not have a keycloak login.
- \`authKeycloakBased.updateUser.emailAlreadyUsed\` -> another user has the
  specified email address used as a keycloak login.`,
      )
      .params({
        user: T.uuid(),
      })
      .body({
        email: T.string().optional(),
      })
      .response(successResponse)
      .tags(authPermissions.authUserManage),
  );

  if (!options.createUsersImplicitly) {
    app.add(
      R.post("/create", "create")
        .docs(
          `Create a new user with a Keycloak login. Returns the created user.`,
        )
        .body({
          name: T.string().optional(),
          email: emailType(T),
        })
        .response({
          user: T.reference("auth", "userSummary"),
        })
        .tags(authPermissions.authKeycloakUserCreate),
    );
  }
}
