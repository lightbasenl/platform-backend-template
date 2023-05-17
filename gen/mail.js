import { TypeCreator } from "@compas/code-gen";

/**
 * @param {import("@compas/code-gen").Generator} generator
 */
export function extendWithMail(generator) {
  const T = new TypeCreator("mail");

  generator.add(
    T.object("templateResponse").keys({
      mjml: T.string(),
      subject: T.string(),
    }),

    T.anyOf("address")
      .values(T.string(), {
        name: T.string(),
        address: T.string(),
      })
      .docs("string or object (nodemailer)"),

    T.object("addressHeaders")
      .keys({
        from: T.reference("mail", "address"),
        to: T.array().values(T.reference("mail", "address")).min(1).convert(),
        cc: T.array()
          .values(T.reference("mail", "address"))
          .convert()
          .optional(),
        bcc: T.array()
          .values(T.reference("mail", "address"))
          .convert()
          .optional(),
      })
      .docs("nodemailer address headers"),

    // template body types
    T.object("generic").keys({
      mail: {
        subject: T.string(),
        content: T.array().values(
          T.anyOf().values(
            T.object("line").keys({
              type: "line",
              content: T.string(),
            }),
            T.object("button").keys({
              type: "button",
              label: T.string(),
              url: T.string(),
            }),
          ),
        ),
      },
      urls: {
        publicUrl: T.string().docs("Used for rendering logo's and icons."),
      },
    }),
  );
}
