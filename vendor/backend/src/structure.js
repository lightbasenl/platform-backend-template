import { authPermissions } from "./auth/constants.js";
import { extendWithBackendSession } from "./auth/session/structure.js";

/**
 * Email type with basic checks
 *
 * @param {import("@compas/code-gen").TypeCreator} T
 * @returns {import("@compas/code-gen").TypeBuilder}
 */
export function emailType(T) {
  return T.string("email")
    .min(2)
    .lowerCase()
    .pattern(/^\S+@\S+\.\S+$/)
    .trim()
    .max(150)
    .docs(
      "Relatively free-form email type. Accepting most valid emails. Emails are case-insensitive.",
    );
}

/**
 * Password type with only a length requirement.
 * We don't enforce weird patterns, since it often leads to a Test123! kinda case.
 *
 * @param {import("@compas/code-gen").TypeCreator} T
 * @returns {import("@compas/code-gen").TypeBuilder}
 */
export function passwordType(T) {
  return T.string("password")
    .min(8)
    .max(512)
    .docs(
      `Free form password types. Setting a reasonable limit to 512 characters, allowing password sentences and generated passwords.`,
    );
}

/**
 * Build a type for returning an access & refresh token pair
 *
 * @param {import("@compas/code-gen").TypeCreator} T
 * @returns {import("@compas/code-gen").TypeBuilder}
 */
export function authTokenPairType(T) {
  return T.object("tokenPair").keys({
    accessToken: T.string(),
    refreshToken: T.string(),
  });
}

export const successResponse = {
  success: true,
};

/**
 * Extend the app with the 'backend', 'multitenant' and 'auth' groups.
 * Contains the full database structure and the base controllers. All future specific
 * types and routes can added via their respective `extendWithXxxXx` functions.
 *
 * @see extendWithAuthAnonymousBased
 * @see extendWithAuthDigiDBased
 * @see extendWithAuthKeycloakBased
 * @see extendWithAuthPasswordBased
 * @see extendWithAuthPermission
 * @see extendWithAuthTotpProvider
 *
 * @param {import("@compas/code-gen").App} app
 */
export async function extendWithBackendBase(app) {
  // @ts-ignore
  const { TypeCreator } = await import("@compas/code-gen");

  const T = new TypeCreator("backend");
  const Tauth = new TypeCreator("auth");
  const Tsession = new TypeCreator("session");
  extendWithBackendSession(app, Tsession);

  const Rmultitenant = new TypeCreator("multitenant").router("/multitenant");
  const Rauth = Tauth.router("/auth");

  const authRef = (name) => T.reference("auth", name);
  const ref = (name) => T.reference("backend", name);

  // Database structure
  // This is always fully added for all capabilities supported by this package
  app.add(
    T.object("tenant")
      .keys({
        name: T.string().searchable(),
        data: T.any("tenantData"),
      })
      .enableQueries({})
      .relations(
        T.oneToMany("roles", authRef("role")),
        T.oneToMany("users", ref("userTenant")),
      ),

    T.object("featureFlag")
      .keys({
        name: T.string().searchable(),
        description: T.string().min(0).default(`""`),
        globalValue: T.bool().default(false),
      })
      .enableQueries({
        withDates: true,
      }),

    Tauth.object("user")
      .keys({
        name: T.string().optional().searchable(),
        lastLogin: T.date().default(`new Date(0)`),
      })
      .enableQueries({
        withSoftDeletes: true,
      })
      .relations(
        T.oneToMany("roles", authRef("userRole")),
        T.oneToMany("tenants", ref("userTenant")),
      ),

    T.object("device")
      .keys({
        platform: T.string().oneOf("apple", "android", "desktop", "other"),
        name: T.string(),
        notificationToken: T.string().optional(),
      })
      .enableQueries({
        withDates: true,
      })
      .relations(
        T.oneToOne("session", T.reference("store", "sessionStore"), "device"),
      ),

    T.object("userTenant")
      .keys({})
      .enableQueries({})
      .relations(
        T.manyToOne("tenant", ref("tenant"), "users"),
        T.manyToOne("user", authRef("user"), "tenants"),
      ),

    Tauth.object("role")
      .keys({
        identifier: T.string().searchable(),
      })
      .enableQueries({})
      .relations(
        T.manyToOne("tenant", ref("tenant"), "roles").optional(),

        T.oneToMany("permissions", authRef("rolePermission")),
        T.oneToMany("users", authRef("userRole")),
      ),

    Tauth.object("permission")
      .keys({
        identifier: T.string().searchable(),
      })
      .enableQueries({})
      .relations(T.oneToMany("roles", authRef("rolePermission"))),

    Tauth.object("userRole")
      .keys({})
      .enableQueries({
        withDates: true,
      })
      .relations(
        T.manyToOne("user", authRef("user"), "roles"),
        T.manyToOne("role", authRef("role"), "users"),
      ),

    Tauth.object("rolePermission")
      .keys({})
      .enableQueries({
        withDates: true,
      })
      .relations(
        T.manyToOne("role", authRef("role"), "permissions"),
        T.manyToOne("permission", authRef("permission"), "roles"),
      ),

    Tauth.object("totpSettings")
      .keys({
        secret: T.string(),
        verifiedAt: T.date().optional(),
      })
      .enableQueries({
        withDates: true,
      })
      .relations(T.oneToOne("user", authRef("user"), "totpSettings")),

    Tauth.object("anonymousLogin")
      .keys({
        loginToken: T.string().searchable(),
        isAllowedToLogin: T.bool().searchable(),
      })
      .enableQueries({ withDates: true })
      .relations(T.oneToOne("user", authRef("user"), "anonymousLogin")),

    Tauth.object("passwordLogin")
      .keys({
        email: T.string().searchable(),
        password: T.string(),
        verifiedAt: T.date().optional(),
        otpEnabledAt: T.date().optional(),
        otpSecret: T.string().optional(),
      })
      .enableQueries({
        withDates: true,
      })
      .relations(
        T.oneToOne("user", authRef("user"), "passwordLogin"),

        T.oneToMany("loginAttempts", authRef("passwordLoginAttempt")),
        T.oneToMany("resetTokens", authRef("passwordLoginReset")),
      ),

    Tauth.object("passwordLoginAttempt")
      .keys({})
      .enableQueries({
        withDates: true,
      })
      .relations(
        T.manyToOne("passwordLogin", authRef("passwordLogin"), "loginAttempts"),
      ),

    Tauth.object("passwordLoginReset")
      .keys({
        resetToken: T.string().searchable(),
        expiresAt: T.date().searchable(),
        shouldSetPassword: T.bool().default(false),
      })
      .enableQueries({
        withDates: true,
      })
      .relations(T.manyToOne("login", authRef("passwordLogin"), "resetTokens")),

    Tauth.object("digidLogin")
      .keys({
        bsn: T.string().searchable(),
      })
      .enableQueries({
        withDates: true,
      })
      .relations(T.oneToOne("user", authRef("user"), "digidLogin")),

    Tauth.object("keycloakLogin")
      .keys({
        email: T.string().searchable(),
      })
      .enableQueries({ withDates: true })
      .relations(T.oneToOne("user", authRef("user"), "keycloakLogin")),
  );

  // Various package global necessary types
  app.add(
    T.object("tenantConfig").keys({
      tenants: T.generic()
        .keys(T.string())
        .values(
          T.object().keys({
            data: T.any("tenantData").default("{}"),
            urlConfig: T.generic("tenantUrlConfig")
              .keys(
                T.string()
                  .pattern(/^[\w.-]+$/gi)
                  .docs("Frontend url, without protocol"),
              )
              .values({
                environment: T.string().oneOf(
                  "production",
                  "acceptance",
                  "development",
                ),
                apiUrl: T.string()
                  .pattern(/^[\w.-]+$/gi)
                  .docs("Backend url, without protocol"),
              }),
          }),
        ),
    }),

    T.object("resolvedTenant").keys({
      tenant: T.any().implementations({
        js: {
          validatorInputType: "any",
          validatorOutputType: "QueryResultBackendTenant",
        },
      }),
      urlConfig: T.reference("backend", "tenantUrlConfig"),
      publicUrl: T.string(),
      apiUrl: T.string(),
    }),

    T.object("featureFlagDefinition").keys({
      availableFlags: [T.string().pattern(/^__FEATURE_[A-Z_]+$/g)],
    }),

    Tauth.string("sessionType").oneOf(
      "checkTwoStep",
      "user",
      "passwordBasedUpdatePassword",
    ),

    Tauth.string("twoStepType").oneOf("totpProvider", "passwordBasedOtp"),

    Tauth.string("loginType").oneOf(
      "anonymousBased",
      "digidBased",
      "keycloakBased",
      "passwordBased",
    ),

    Tauth.object("session").keys({
      type: authRef("sessionType"),
      loginType: authRef("loginType"),
      twoStepType: authRef("twoStepType").optional(),
      userId: T.uuid(),
      impersonatorUserId: T.uuid().optional(),
    }),

    Tauth.object("userSummary").keys({
      id: T.uuid(),
      name: T.string().optional(),
      lastLogin: T.date(),
      anonymousLogin: T.optional().value({
        isAllowedToLogin: T.bool(),
        createdAt: T.date(),
      }),
      digidLogin: T.optional().value({
        createdAt: T.date(),
      }),
      keycloakLogin: T.optional().value({
        email: T.string(),
        createdAt: T.date(),
      }),
      passwordLogin: T.optional().value({
        email: emailType(T),
        createdAt: T.date(),
        verifiedAt: T.date().optional(),
        otpEnabledAt: T.date().optional(),
      }),
      totpProvider: T.optional().value({
        enabledAt: T.date(),
      }),
      roles: [
        {
          id: T.uuid(),
          identifier: T.string(),
        },
      ],
      permissions: [T.reference("authPermission", "identifier")],
      createdAt: T.date(),
      deletedAt: T.date().optional(),
    }),
  );

  // Multitenant router
  app.add(
    Rmultitenant.get("/current", "current")
      .docs(`Get information about the current tenant.`)
      .response({
        tenant: {
          id: T.uuid(),
          name: T.string(),
          data: T.reference("backend", "tenantData"),
        },
      }),
  );

  // Auth events
  app.add(
    Tauth.object("userSoftDeletedEventMetadata").keys({
      tenant: {
        id: T.uuid(),
        publicUrl: T.string(),
        apiUrl: T.string(),
      },
    }),
    Tauth.object("userSoftDeletedEventData").keys({
      userId: T.uuid(),
      metadata: T.reference("auth", "userSoftDeletedEventMetadata"),
    }),
  );

  // Auth router
  app.add(
    Rauth.get("/me", "me")
      .docs(
        `Get information about the current logged-in user. Throws a 401 if the user is 
not logged in. Returns both session and user information. When the user needs to
do two-step verification (via 'session.type === checkTwoStep'), the user object is not returned yet.`,
      )
      .response({
        session: authRef("session"),
        user: authRef("userSummary").optional(),
      }),

    Rauth.post("/refresh-tokens", "refreshTokens")
      .docs(
        `Returns a new token pair based on the provided refresh token.

Errors:
- Inherits errors from [\`sessionStoreRefreshTokens\`](https://compasjs.com/features/session-handling.html#sessionstorerefreshtokens)`,
      )
      .body({
        refreshToken: T.string(),
      })
      .response(authTokenPairType(Tauth)),

    Rauth.post("/impersonate-stop-session", "impersonateStopSession")
      .docs(
        `
    Stop an impersonating session. Requires that the current session belongs to the impersonator. Impersonate sessions can only be started from the platform backends.
    
    Callers should bust all local caches and redirect the user to the correct location.
    `,
      )
      .response(successResponse),

    Rauth.post("/logout", "logout")
      .docs(`Destroy the current session.`)
      .response(successResponse),

    Rauth.post("/list-users", "userList")
      .idempotent()
      .docs(
        `Return a user list with all settings from this package. Note that the filters
are optional. If one of the filters is true, only the users with that type login
are returned. If a filter is set to 'false', only users without that login type
are returned. The filters are combinable.`,
      )
      .body({
        search: T.object()
          .keys({
            name: T.string().optional(),
          })
          .default("{}"),
        filters: T.object()
          .keys({
            anonymousLoginExists: T.bool().optional(),
            digidLoginExists: T.bool().optional(),
            keycloakLoginExists: T.bool().optional(),
            passwordLoginExists: T.bool().optional(),
            includeAnonymousTemporarySessions: T.bool().default(false),
            includeSoftDeletedUsers: T.bool().default(false),
          })
          .default(
            `{"includeAnonymousTemporarySessions": false, "includeSoftDeletedUsers": false }`,
          ),
      })
      .response({
        users: [authRef("userSummary")],
      })
      .tags(authPermissions.authUserList),

    Rauth.get("/user/:user", "getUser")
      .docs(
        `Returns a single user.

Errors:
- Inherits \`authRequireUser\` errors with the \`auth.getUser\` eventKey.`,
      )
      .params({ user: T.uuid() })
      .response({
        user: authRef("userSummary"),
      })
      .tags(authPermissions.authUserList),

    Rauth.put("/user/:user/update", "updateUser")
      .docs(
        `Update base user properties.

Errors:
- Inherits \`authRequireUser\` errors with the \`auth.updateUser.requireUser\` eventKey.`,
      )
      .params({ user: T.uuid() })
      .body({
        name: T.string().allowNull(),
      })
      .response(successResponse)
      .tags(authPermissions.authUserManage),

    Rauth.post("/user/:user/set-active", "setUserActive")
      .docs(
        `Soft delete or reactivate a user.

Errors:
- Inherits \`authRequireUser\` errors with the \`auth.setUserActive.requireUser\`
  eventKey.`,
      )
      .params({
        user: T.uuid(),
      })
      .body({
        active: T.bool(),
      })
      .response(successResponse)
      .tags(authPermissions.authUserManage),
  );
}
