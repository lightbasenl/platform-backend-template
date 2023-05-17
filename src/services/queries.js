import { setStoreQueries } from "@compas/store";
import { queries } from "../generated/application/common/database.js";
import { serviceLogger } from "./logger.js";

export function serviceQueriesInit() {
  serviceLogger.info("setting queries of packages");
  setStoreQueries(queries);
}
