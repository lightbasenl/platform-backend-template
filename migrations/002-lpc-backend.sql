CREATE TABLE "tenant"
(
  "id"   uuid PRIMARY KEY NOT NULL DEFAULT uuid_generate_v4(),
  "name" varchar          NOT NULL,
  "data" jsonb            NOT NULL
);

CREATE UNIQUE INDEX "tenantNameIdx" ON "tenant" ("name");

CREATE TABLE "featureFlag"
(
  "id"           uuid PRIMARY KEY NOT NULL DEFAULT uuid_generate_v4(),
  "globalValue"  boolean          NOT NULL,
  "description"  varchar          NOT NULL,
  "name"         varchar          NOT NULL,
  "tenantValues" jsonb            NULL,
  "createdAt"    timestamptz      NOT NULL DEFAULT now(),
  "updatedAt"    timestamptz      NOT NULL DEFAULT now()
);

CREATE INDEX "featureFlagDatesIdx" ON "featureFlag" ("createdAt", "updatedAt");
CREATE UNIQUE INDEX "featureFlagNameIdx" ON "featureFlag" ("name");

CREATE TABLE "user"
(
  "id"        uuid PRIMARY KEY NOT NULL DEFAULT uuid_generate_v4(),
  "name"      varchar          NULL,
  "lastLogin" timestamptz      NOT NULL,
  "createdAt" timestamptz      NOT NULL DEFAULT now(),
  "updatedAt" timestamptz      NOT NULL DEFAULT now(),
  "deletedAt" timestamptz      NULL
);

CREATE INDEX "userDatesIdx" ON "user" ("createdAt", "updatedAt");
CREATE INDEX "userDeletedAtIdx" ON "user" ("deletedAt");

CREATE TABLE "device"
(
  "id"                 uuid PRIMARY KEY NOT NULL DEFAULT uuid_generate_v4(),
  "session"            uuid             NOT NULL,
  "name"               varchar          NOT NULL,
  "platform"           varchar          NOT NULL,
  "notificationToken"  varchar          NULL,
  "webPushInformation" jsonb            NULL,
  "createdAt"          timestamptz      NOT NULL DEFAULT now(),
  "updatedAt"          timestamptz      NOT NULL DEFAULT now(),
  CONSTRAINT "deviceSessionFk" FOREIGN KEY ("session") REFERENCES "sessionStore" ("id") ON DELETE CASCADE
);

CREATE INDEX "deviceDatesIdx" ON "device" ("createdAt", "updatedAt");
CREATE INDEX "deviceSessionIdx" ON "device" ("session");

-- Index the userId value that we use
CREATE INDEX "sessionStoreUserIdIdx" ON "sessionStore" ((("data" ->> 'userId')::uuid));

CREATE TABLE IF NOT EXISTS "userTenant"
(
  "id"     uuid PRIMARY KEY NOT NULL DEFAULT uuid_generate_v4(),
  "tenant" uuid             NOT NULL,
  "user"   uuid             NOT NULL,
  CONSTRAINT "userTenantTenantFk" FOREIGN KEY ("tenant") REFERENCES "tenant" ("id") ON DELETE CASCADE,
  CONSTRAINT "userTenantUserFk" FOREIGN KEY ("user") REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "userTenantUniqIdx" ON "userTenant" ("user", "tenant");

CREATE TABLE "passwordLogin"
(
  "id"           uuid PRIMARY KEY NOT NULL DEFAULT uuid_generate_v4(),
  "user"         uuid             NOT NULL,
  "email"        varchar          NOT NULL,
  "password"     varchar          NOT NULL,
  "otpSecret"    varchar          NULL,
  "otpEnabledAt" timestamptz      NULL,
  "verifiedAt"   timestamptz      NULL,
  "createdAt"    timestamptz      NOT NULL DEFAULT now(),
  "updatedAt"    timestamptz      NOT NULL DEFAULT now(),
  CONSTRAINT "passwordLoginUserFk" FOREIGN KEY ("user") REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE INDEX "passwordLoginDatesIdx" ON "passwordLogin" ("createdAt", "updatedAt");
CREATE INDEX "passwordLoginUserIdx" ON "passwordLogin" ("user");
CREATE INDEX "passwordLoginEmailIdx" ON "passwordLogin" ("email");

CREATE TABLE "passwordLoginReset"
(
  "id"                uuid PRIMARY KEY NOT NULL DEFAULT uuid_generate_v4(),
  "shouldSetPassword" boolean          NOT NULL,
  "login"             uuid             NOT NULL,
  "resetToken"        varchar          NOT NULL,
  "expiresAt"         timestamptz      NOT NULL,
  "createdAt"         timestamptz      NOT NULL DEFAULT now(),
  "updatedAt"         timestamptz      NOT NULL DEFAULT now(),
  CONSTRAINT "passwordLoginResetLoginFk" FOREIGN KEY ("login") REFERENCES "passwordLogin" ("id") ON DELETE CASCADE
);

CREATE INDEX "passwordLoginResetDatesIdx" ON "passwordLoginReset" ("createdAt", "updatedAt");
CREATE INDEX "passwordLoginResetLoginIdx" ON "passwordLoginReset" ("login");
CREATE INDEX "passwordLoginResetResetTokenIdx" ON "passwordLoginReset" ("resetToken");

CREATE TABLE "passwordLoginAttempt"
(
  "id"            uuid PRIMARY KEY NOT NULL DEFAULT uuid_generate_v4(),
  "passwordLogin" uuid             NOT NULL,
  "createdAt"     timestamptz      NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz      NOT NULL DEFAULT now(),
  CONSTRAINT "passwordLoginAttemptPasswordLoginFk" FOREIGN KEY ("passwordLogin") REFERENCES "passwordLogin" ("id") ON DELETE CASCADE
);

CREATE INDEX "passwordLoginAttemptPasswordLoginIdx" ON "passwordLoginAttempt" ("passwordLogin");

CREATE TABLE "anonymousLogin"
(
  "id"               uuid PRIMARY KEY NOT NULL DEFAULT uuid_generate_v4(),
  "isAllowedToLogin" boolean          NOT NULL,
  "user"             uuid             NOT NULL,
  "loginToken"       varchar          NOT NULL,
  "createdAt"        timestamptz      NOT NULL DEFAULT now(),
  "updatedAt"        timestamptz      NOT NULL DEFAULT now(),
  CONSTRAINT "anonymousLoginUserFk" FOREIGN KEY ("user") REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE INDEX "anonymousLoginDatesIdx" ON "anonymousLogin" ("createdAt", "updatedAt");
CREATE INDEX "anonymousLoginUserIdx" ON "anonymousLogin" ("user");
CREATE INDEX "anonymousLoginLoginTokenIdx" ON "anonymousLogin" ("loginToken");

CREATE TABLE "permission"
(
  "id"         uuid PRIMARY KEY NOT NULL DEFAULT uuid_generate_v4(),
  "identifier" varchar          NOT NULL
);

CREATE UNIQUE INDEX "permissionIdentifierUniqIdx" ON "permission" ("identifier");

CREATE TABLE "role"
(
  "id"         uuid PRIMARY KEY NOT NULL DEFAULT uuid_generate_v4(),
  "identifier" varchar          NOT NULL,
  "tenant"     uuid             NULL,
  CONSTRAINT "roleTenantFk" FOREIGN KEY ("tenant") REFERENCES "tenant" ("id") ON DELETE CASCADE
);

CREATE INDEX "roleIdentifierUniqIdx" ON "role" ("identifier");
CREATE INDEX IF NOT EXISTS "roleTenantIdx" ON "role" ("tenant");


CREATE TABLE "rolePermission"
(
  "id"         uuid PRIMARY KEY NOT NULL DEFAULT uuid_generate_v4(),
  "permission" uuid             NOT NULL,
  "role"       uuid             NOT NULL,
  "createdAt"  timestamptz      NOT NULL DEFAULT now(),
  "updatedAt"  timestamptz      NOT NULL DEFAULT now(),
  CONSTRAINT "rolePermissionRoleFk" FOREIGN KEY ("role") REFERENCES "role" ("id") ON DELETE CASCADE,
  CONSTRAINT "rolePermissionPermissionFk" FOREIGN KEY ("permission") REFERENCES "permission" ("id") ON DELETE CASCADE
);

CREATE INDEX "rolePermissionDatesIdx" ON "rolePermission" ("createdAt", "updatedAt");
CREATE UNIQUE INDEX "rolePermissionRolePermissionUniqIdx" ON "rolePermission" ("role", "permission");

CREATE TABLE "userRole"
(
  "id"        uuid PRIMARY KEY NOT NULL DEFAULT uuid_generate_v4(),
  "role"      uuid             NOT NULL,
  "user"      uuid             NOT NULL,
  "createdAt" timestamptz      NOT NULL DEFAULT now(),
  "updatedAt" timestamptz      NOT NULL DEFAULT now(),
  CONSTRAINT "userRoleUserFk" FOREIGN KEY ("user") REFERENCES "user" ("id") ON DELETE CASCADE,
  CONSTRAINT "userRoleRoleFk" FOREIGN KEY ("role") REFERENCES "role" ("id") ON DELETE CASCADE
);

CREATE INDEX "userRoleDatesIdx" ON "userRole" ("createdAt", "updatedAt");
CREATE UNIQUE INDEX "userRoleUserRoleUniqIdx" ON "userRole" ("user", "role");

CREATE TABLE "totpSettings"
(
  "id"         uuid PRIMARY KEY NOT NULL DEFAULT uuid_generate_v4(),
  "user"       uuid             NOT NULL,
  "secret"     varchar          NOT NULL,
  "verifiedAt" timestamptz      NULL,
  "createdAt"  timestamptz      NOT NULL DEFAULT now(),
  "updatedAt"  timestamptz      NOT NULL DEFAULT now(),
  CONSTRAINT "totpSettingsUserFk" FOREIGN KEY ("user") REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE INDEX "totpSettingsUserIdx" ON "totpSettings" ("user");

CREATE TABLE "digidLogin"
(
  "id"        uuid PRIMARY KEY NOT NULL DEFAULT uuid_generate_v4(),
  "user"      uuid             NOT NULL,
  "bsn"       varchar          NOT NULL,
  "createdAt" timestamptz      NOT NULL DEFAULT now(),
  "updatedAt" timestamptz      NOT NULL DEFAULT now(),
  CONSTRAINT "digidLoginUserFk" FOREIGN KEY ("user") REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE INDEX "digidLoginUserIdx" ON "digidLogin" ("user");
CREATE UNIQUE INDEX "digidLoginBsnIdx" ON "digidLogin" ("bsn");

CREATE TABLE "keycloakLogin"
(
  "id"        uuid PRIMARY KEY NOT NULL DEFAULT uuid_generate_v4(),
  "user"      uuid             NOT NULL,
  "email"     varchar          NOT NULL,
  "createdAt" timestamptz      NOT NULL DEFAULT now(),
  "updatedAt" timestamptz      NOT NULL DEFAULT now(),
  CONSTRAINT "keycloakLoginUserFk" FOREIGN KEY ("user") REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE INDEX "keycloakLoginUserIdx" ON "keycloakLogin" ("user");
CREATE INDEX "keycloakLoginEmailUniqIdx" ON "keycloakLogin" ("email");
