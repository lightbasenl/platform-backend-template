CREATE TABLE "userSettings" (
  "id"          uuid PRIMARY KEY NOT NULL DEFAULT uuid_generate_v4(),
  "user"        uuid        NOT NULL,
  "email"       varchar     NOT NULL,
  "notes"       varchar     NULL,
  "phone"       varchar     NOT NULL,
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  "updatedAt"   timestamptz NOT NULL DEFAULT now(),
  constraint "userSettingsUserFk" foreign key ("user") references "user" ("id") ON DELETE CASCADE
);

CREATE INDEX "userSettingsUserIdx" ON "userSettings" ("user");
