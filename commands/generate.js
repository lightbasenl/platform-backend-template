import fs from "node:fs/promises";
import { Generator } from "@compas/code-gen";
import { spawn } from "@compas/stdlib";
import {
  extendWithBackend,
  extendWithCompasPackages,
  extendWithInternal,
} from "../gen/index.js";

/**
 * DOCS: https://compasjs.com/features/extending-the-cli.html#cli-definition
 *
 * @type {CliCommandDefinitionInput}
 */
export const cliDefinition = {
  name: "generate",
  shortDescription: "Compas code generation",
  modifiers: {
    isCosmetic: true,
  },
  subCommands: [
    {
      name: "application",
      shortDescription: "Generate application and frontend OpenAPI spec",
      modifiers: {
        isWatchable: true,
      },
      watchSettings: {
        ignorePatterns: [
          "generated",
          "docs",
          "src",
          "commands",
          "migrations",
          "types",
        ],
      },
    },
  ],
  flags: [
    {
      name: "verbose",
      rawName: "--verbose",
      description: "Should run in verbose mode",
      value: {
        specification: "boolean",
      },
    },
    {
      name: "skipLint",
      rawName: "--skip-lint",
      description: "Skip running the linters after generating",
      value: {
        specification: "boolean",
      },
    },
  ],
  executor: cliExecutor,
};

/**
 * @typedef {object} GenerateCliOptions
 * @property {Logger} logger
 * @property {boolean} verbose
 * @property {boolean} skipLint
 */

/**
 * @param {import("@compas/stdlib").Logger} logger
 * @param {import("@compas/cli").CliExecutorState} state
 * @returns {Promise<import("@compas/cli").CliResult>}
 */
async function cliExecutor(logger, state) {
  /** @type {GenerateCliOptions} */
  const opts = {
    logger: logger,
    verbose: state.flags?.verbose ?? false,
    skipLint: state.flags?.skipLint ?? false,
  };

  const [, subCommand] = state.command;
  switch (subCommand) {
    case "application":
      logger.info(`[1/2] Generating application`);
      await generateApplication(opts);
  }

  if (!opts.skipLint) {
    logger.info(`[2/2] Running linter`);
    await spawn("yarn", ["compas", "lint"]);
  } else {
    logger.info(`[2/2] Skipped linter`);
  }

  return { exitStatus: "passed" };
}

/**
 * Generate all application routes + types
 *
 * @param {GenerateCliOptions} opts
 * @returns {Promise<void>}
 */
async function generateApplication(opts) {
  const generator = new Generator(opts.logger);

  await extendWithCompasPackages(generator);
  await extendWithBackend(generator);
  await extendWithInternal(generator);

  generator.generate({
    targetLanguage: "js",
    outputDirectory: "./src/generated/application",
    generators: {
      types: {
        declareGlobalTypes: true,
      },
      validators: {
        includeBaseTypes: true,
      },
      database: {
        target: {
          dialect: "postgres",
          includeDDL: true,
        },
        includeEntityDiagram: true,
      },
      router: {
        target: {
          library: "koa",
        },
        exposeApiStructure: true,
      },
      apiClient: {
        target: {
          library: "axios",
          targetRuntime: "node.js",
        },
        responseValidation: {
          looseObjectValidation: false,
        },
      },
    },
  });

  // replace Mermaid diagram in root README.md
  const readme = await fs.readFile("./README.md", { encoding: "utf8" });
  let erd = await fs.readFile("./src/generated/application/common/erd.md", {
    encoding: "utf8",
  });
  erd = erd.substring(erd.indexOf("\n") + 1); // remove markdown title from generated
  // erd.md

  const data = readme.replace(/<div>(.*?)<\/div>/gms, `<div>\n${erd}\n</div>`);
  await fs.writeFile("./README.md", data);
}
