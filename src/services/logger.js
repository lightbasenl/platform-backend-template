import { newLogger } from "@compas/stdlib";

/**
 * @type {Logger}
 */
export let serviceLogger = undefined;

export function serviceLoggerInit() {
  serviceLogger = newLogger({ ctx: { type: "services" } });
  serviceLogger.info("setting serviceLogger");
}

export function serviceLoggerTestInit() {
  serviceLogger = newLogger({ ctx: { type: "test-services" } });
  serviceLogger.info("setting serviceLogger");
}
