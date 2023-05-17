import { TypeCreator } from "@compas/code-gen";

/**
 * Database structure
 *
 * @param {import("@compas/code-gen").Generator} generator
 */
export function extendWithDatabase(generator) {
  const T = new TypeCreator("database");

  const user = T.reference("auth", "user");

  // add database tables
  generator.add(
    T.object("userSettings")
      .docs("Settings for a user")
      .keys({
        notes: T.optional().value(T.reference("type", "inputString")),
        phone: T.reference("type", "phoneNumber"),
        email: T.reference("backend", "email"),
      })
      .enableQueries({ withDates: true })
      .relations(T.oneToOne("user", user, "settings")),
  );
}
