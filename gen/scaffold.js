import { TypeCreator } from "@compas/code-gen";

/**
 * TODO(platform): remove this
 * Scaffold structure
 *
 * @param {import("@compas/code-gen").Generator} generator
 */
export function extendWithScaffold(generator) {
  const T = new TypeCreator("scaffold");
  const R = T.router("/scaffold");

  generator.add(
    R.post("/create-user", "createUser").response({
      loginToken: T.string(),
    }),
  );
}
