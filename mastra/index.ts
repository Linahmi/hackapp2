import { Mastra } from "@mastra/core";
import { procurementAgent } from "./agents/procurement-agent";
import { mastraPostgresStore } from "./storage";

export const mastra = new Mastra({
  storage: mastraPostgresStore,
  agents: {
    "procurement-agent": procurementAgent,
  },
});