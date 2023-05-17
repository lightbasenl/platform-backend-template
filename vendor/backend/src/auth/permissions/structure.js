import { isNil, isPlainObject } from "@compas/stdlib";
import { managementConstants } from "../../management/constants.js";
import { successResponse } from "../../structure.js";
import { authPermissions } from "../constants.js";

/**
 * Extend the app with auth permission capabilities.
 * By default does not enable management routes.
 *
 * @see extendWithBackendBase
 *
 * @param {import("@compas/code-gen").App} app
 * @param {{
 *   permissions: Record<string, string>,
 *   addManagementRoutes?: boolean,
 * }} options
 * @returns {Promise<void>}
 */
export async function extendWithAuthPermission(app, options) {
  const { TypeCreator } = await import("@compas/code-gen");
  const T = new TypeCreator("authPermission");
  const R = T.router("/auth/permission");

  if (!isPlainObject(options?.permissions)) {
    throw new Error(
      `'options.permissions' should be provided and a plain JS object.`,
    );
  }

  if (
    options.addManagementRoutes &&
    isNil(options.permissions["authPermissionManage"])
  ) {
    throw new Error(
      `Provided permissions do not include 'authPermissions'. Please add them to the call.`,
    );
  }

  app.add(
    T.string("identifier").oneOf(
      ...Object.values(options.permissions).concat(
        managementConstants.permission,
      ),
    ),

    R.get("/summary", "summary")
      .docs(`Get the roles and permissions for the current logged-in user.`)
      .response({
        roles: [{ id: T.uuid(), identifier: T.string() }],
        permissions: [T.reference("authPermission", "identifier")],
      }),
  );

  if (options.addManagementRoutes) {
    R.tags(authPermissions.authPermissionManage);

    app.add(
      R.get("/permission/list", "permissionList")
        .docs(
          `Get the current known backend permissions. Can be used in the Frontend to match
known permissions and disable selection of unknowns.`,
        )
        .response({
          permissions: [
            {
              id: T.uuid(),
              identifier: T.reference("authPermission", "identifier"),
            },
          ],
        }),

      R.get("/role/list", "roleList")
        .docs(`Get the roles with permissions across the system.`)
        .response({
          roles: [
            {
              id: T.uuid(),
              identifier: T.string(),
              isEditable: T.bool(),
              permissions: [T.reference("authPermission", "identifier")],
            },
          ],
        }),

      R.post("/role", "createRole")
        .docs(`Create a new role. This role is 'tenant' specific.`)
        .body({
          identifier: T.string(),
        })
        .response({
          role: {
            id: T.uuid(),
            identifier: T.string(),
          },
        }),

      R.delete("/role/:role", "removeRole")
        .docs(`Remove a role. Only tenant specific roles can be removed.`)
        .params({
          role: T.uuid(),
        })
        .response(successResponse),

      R.post("/role/:role/add-permissions", "roleAddPermissions")
        .docs(
          `Add permissions to a role. Requires that both permissions and role exist.
The implementation checks if a permission is already added to the role, so
providing existing permissions is not a problem

Errors:
- \`authPermission.requireRole.unknownRole\` -> the provided \`role\` identifier is
  unknown.
- \`authPermission.roleAddPermissions.unknownPermission\` -> Empty permission
  array, duplicate permission in the array or an unknown permission provided.`,
        )
        .params({
          role: T.uuid(),
        })
        .body({
          permissions: [T.reference("authPermission", "identifier")],
        })
        .response(successResponse),

      R.post("/role/:role/remove-permissions", "roleRemovePermissions")
        .docs(
          `Remove permissions from a role. Requires that the role exists and all provided
permissions are assigned.

Errors:
- \`authPermission.requireRole.unknownRole\` -> the provided \`role\` identifier is
  unknown.
- \`authPermission.roleRemovePermissions.permissionNotAssigned\` -> The provided
  permission is not assigned to the provided role.`,
        )
        .params({
          role: T.uuid(),
        })
        .body({
          permissions: [T.reference("authPermission", "identifier")],
        })
        .response(successResponse),

      R.get("/user/:user/summary", "userSummary")
        .docs(`Get the \`apiAuthPermissionSummary\` for the provided user.`)
        .params({
          user: T.uuid(),
        })
        .response({
          roles: [
            {
              id: T.uuid(),
              identifier: T.string(),
            },
          ],
          permissions: [T.reference("authPermission", "identifier")],
        }),

      R.post("/user/:user/assign-role", "userAssignRole")
        .docs(
          `Assign the provided role to the provided user.

Errors:
- Inherits \`authRequireUser\` errors with the \`authPermission.requireUser\`
  eventKey.
- \`authPermission.userAssignRole.userHasRole\` -> user already has the provided
  role assigned to them
- \`authPermission.userAssignRole.unknownRole\` -> Role can not be found by the
  provided identifier.`,
        )
        .params({
          user: T.uuid(),
        })
        .body({
          role: T.uuid(),
        })
        .response(successResponse),

      R.post("/user/:user/remove-role", "userRemoveRole")
        .docs(
          `Remove the provided role from the provided user.

Errors:
- Inherits \`authRequireUser\` errors with the \`authPermission.requireUser\`
  eventKey.
- \`authPermission.userRemoveRole.roleNotAssigned\` -> role is not assigned to the
  user at the time of calling.`,
        )
        .params({
          user: T.uuid(),
        })
        .body({
          role: T.uuid(),
        })
        .response(successResponse),
    );
  }
}
