/**
 * Extend the app with feature flag capabilities
 *
 * @param {import("@compas/code-gen").App} app
 * @param {{
 *  flagDefinition: BackendFeatureFlagDefinitionInput,
 * }} options
 * @returns {Promise<void>}
 */
export async function extendWithFeatureFlag(app, options) {
  const { TypeCreator } = await import("@compas/code-gen");
  const T = new TypeCreator("featureFlag");
  const R = T.router("/feature-flag");

  if (options.flagDefinition.availableFlags.length === 0) {
    // @ts-expect-error
    options.flagDefinition.availableFlags.push("__FEATURE_LPC_EXAMPLE_FLAG");
  }

  /** @type {any} */
  const featureFlagObject = {};
  for (const flag of options.flagDefinition.availableFlags) {
    featureFlagObject[flag] = T.bool();
  }

  app.add(
    T.string("identifier").oneOf(...options.flagDefinition.availableFlags),

    R.get("/current", "current")
      .response(featureFlagObject)
      .docs(
        "Get the current available feature flags. This may use the current tenant and user to calculate the values.",
      ),
  );
}
