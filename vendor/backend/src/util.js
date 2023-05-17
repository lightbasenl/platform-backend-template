import { existsSync } from "node:fs";
import { AppError, isNil, pathJoin } from "@compas/stdlib";

/**
 * Takes an AppError and normalizes it to a 401, to simplify frontend error handling on
 * auth routes.
 *
 * @param {AppError} error
 * @throws
 */
export function normalizeSessionErrorsToUnauthorizedAndThrow(error) {
  if (!AppError.instanceOf(error)) {
    throw AppError.serverError(
      {
        message: "Unknown error",
      },
      error,
    );
  }

  if (error.status === 500) {
    throw error;
  }

  error.status = 401;

  throw error;
}

/**
 * Import a generated resource via a relevant path (project based)
 *
 * @param {string} path
 * @param {string} [destructureValue]
 * @returns {Promise<any>}
 */
export async function importProjectResource(path, destructureValue) {
  const importPath = pathJoin(process.cwd(), path);
  if (!existsSync(importPath)) {
    throw AppError.serverError({
      message: "ImportProjectResourcePathNotFound",
      inputPath: path,
      determinedPath: importPath,
    });
  }

  try {
    // @ts-ignore
    const resource = await import(importPath);

    if (destructureValue && isNil(resource?.[destructureValue])) {
      throw AppError.validationError(
        "lpc.importProjectResource.unknownDestructure",
        {
          inputPath: path,
          determinedPath: importPath,
          destructureValue,
        },
      );
    }

    if (destructureValue) {
      return resource[destructureValue];
    }

    return resource;
  } catch (e) {
    throw AppError.serverError({
      message: "UnableToImportProjectResource",
      inputPath: path,
      determinedPath: importPath,
      error: AppError.format(e),
    });
  }
}
