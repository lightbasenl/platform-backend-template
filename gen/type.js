import { TypeCreator } from "@compas/code-gen";

/**
 * Type structure
 *
 * @param {import("@compas/code-gen").Generator} generator
 */
export function extendWithType(generator) {
  const T = new TypeCreator("type");

  generator.add(
    T.string("inputString")
      .max(200)
      .disallowCharacters(["/", "|", "\\\\", "<", ">"]),

    T.string("phoneNumber")
      .min(10)
      .max(13)
      .pattern(/^\+?\d+$/g),
  );
}
