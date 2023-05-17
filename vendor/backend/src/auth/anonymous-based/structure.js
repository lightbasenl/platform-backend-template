import { authTokenPairType } from "../../structure.js";

/**
 * Extend the app with the auth password based login capabilities.
 *
 * @see extendWithBackendBase
 *
 * @param {import("@compas/code-gen").App} app
 * @returns {Promise<void>}
 */
export async function extendWithAuthAnonymousBased(app) {
  const { TypeCreator } = await import("@compas/code-gen");
  const T = new TypeCreator("authAnonymousBased");
  const R = T.router("/auth/anonymous-based");

  const token = T.string().min(40);

  app.add(
    T.object("userRegisteredEventMetadata").keys({}),
    T.object("userRegisteredEventData").keys({
      anonymousLoginId: T.uuid(),
      metadata: T.reference(
        "authAnonymousBased",
        "userRegisteredEventMetadata",
      ),
    }),

    R.post("/login", "login")
      .docs(
        `Let an anonymous based user login with the specified token.

Errors:
- \`authAnonymousBased.login.unknownToken\` -> can't find a user with the provided
  token
- \`authAnonymousBased.login.tokenIsNotAllowedToLogin\` -> token is not allowed to
  log in.`,
      )
      .body({
        token,
        device: T.reference("session", "loginDevice").optional(),
      })
      .response(authTokenPairType(T)),
  );
}
