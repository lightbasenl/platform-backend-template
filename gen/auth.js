import { TypeCreator } from "@compas/code-gen";

/**
 * @param {import("@compas/code-gen").Generator} generator
 */
export function extendWithAuthCustom(generator) {
  const T = new TypeCreator();
  const TAuthPasswordBased = new TypeCreator("authPasswordBased");

  generator.add(
    TAuthPasswordBased.object("userRegisteredEventMetadata").keys({
      tenant: {
        id: T.uuid(),
        publicUrl: T.string(),
        apiUrl: T.string(),
      },
    }),
  );
}
