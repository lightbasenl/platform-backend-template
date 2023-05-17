import { environment, isProduction, isStaging, mainFn } from "@compas/stdlib";
import { injectServices } from "../src/service.js";
import { app } from "../src/services/app.js";

mainFn(import.meta, main);

/**
 * @param {Logger} logger
 */
async function main(logger) {
  await injectServices();

  const port = environment.PORT || 3000;
  const server = app.listen(port, () => {
    logger.info({
      msg: "Listening",
      port,
      isStaging: isStaging(),
      isProduction: isProduction(),
    });
  });

  // ensure keepAlive is in-sync with AWS ALB, to prevent 502's
  server.keepAliveTimeout = 72000;
}
