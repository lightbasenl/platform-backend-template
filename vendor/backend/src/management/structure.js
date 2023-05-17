/**
 * Extend with management routes
 *
 * @param {import("@compas/code-gen").App} app
 * @returns {Promise<void>}
 */
export async function extendWithManagement(app) {
  const { TypeCreator } = await import("@compas/code-gen");
  const T = new TypeCreator("management");
  const TfeatureFlag = new TypeCreator("managementFeatureFlag");
  const R = T.router("/_lightbase/management");

  app.add(
    R.post("/request-magic-link", "requestMagicLink")
      .body({
        slackUserId: T.string().max(32),
      })
      .response({
        magicLink: T.string().optional(),
      })
      .docs(
        "Sends a magic link via Slack. Locally it directly returns the url.",
      ),

    TfeatureFlag.crud(`${R.data.path}/feature-flag`)
      .entity(T.reference("backend", "featureFlag"))
      .routes({
        listRoute: true,
        singleRoute: true,
        updateRoute: true,
      })
      .fields({
        readable: {},
        writable: {
          $pick: ["globalValue", "description"],
        },
      }),
  );
}
