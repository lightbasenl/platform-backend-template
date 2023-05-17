import { authTokenPairType } from "../../structure.js";

/**
 * Extend the app with the DigiD based login capabilities.
 *
 * @see extendWithBackendBase
 *
 * @param {import("@compas/code-gen").App} app
 * @returns {Promise<void>}
 */
export async function extendWithAuthDigiDBased(app) {
  const { TypeCreator } = await import("@compas/code-gen");
  const T = new TypeCreator("authDigidBased");
  const R = T.router("/auth/digid-based");

  app.add(
    T.object("keyPair").keys({
      publicKey: T.string().min(30),
      privateKey: T.string().min(30),
    }),

    T.object("userRegisteredEventMetadata").keys({}),
    T.object("userRegisteredEventData").keys({
      digidLoginId: T.uuid(),
      metadata: T.reference("authDigidBased", "userRegisteredEventMetadata"),
    }),

    R.get("/metadata", "metadata")
      .docs(
        `This returns an XML string that DigiD understands and uses for allowing the
application to use DigiD. By exposing the raw result of this string in the
frontend on \`saml/idp/metadata.xml\`, no manual formatting or emailing of
documents is necessary. Note that DigiD doesn't read this automatically. So they
still need to be told that the file is ready for consumption.`,
      )
      .response(T.string()),

    R.post("/redirect", "redirect")
      .docs("Get a redirect url for the user to login.")
      .response({
        digidUrl: T.string(),
      }),

    R.post("/login", "login")
      .docs(
        `Post the result back from DigiD to the backend, to log the user in.`,
      )
      .body({
        SAMLArt: T.string().min(10),
        device: T.reference("session", "loginDevice").optional(),
      })
      .response(authTokenPairType(T)),
  );
}
