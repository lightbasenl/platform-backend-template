/**
 * @param {import("@compas/code-gen").App} app
 * @param {TypeCreator} T
 */
export function extendWithBackendSession(app, T) {
  const R = T.router("/session");

  app.add(
    T.object("loginDevice").keys({
      platform: T.string().oneOf("apple", "android", "desktop", "other"),
      name: T.string(),
      notificationToken: T.string().optional(),
    }),

    T.object("item").keys({
      sessionId: T.uuid(),
      isCurrentSession: T.bool(),
      device: T.reference(T.group, "loginDevice").optional(),
    }),

    R.get("/list", "list").response({
      sessions: [T.reference(T.group, "item")],
    }).docs(`
    List all sessions for the currently logged-in user.
    `),

    R.post("/logout", "logout")
      .body({
        sessionId: T.uuid(),
      })
      .response({})
      .invalidations(R.invalidates(T.group)).docs(`
      Remove a specific session.
      `),

    R.post("/set-notification-token", "setDeviceNotificationToken")
      .body({
        notificationToken: T.string(),
      })
      .response({})
      .invalidations(R.invalidates(T.group)).docs(`
      Set the notification token for the current session.
      `),
  );
}
