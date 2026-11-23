import { it } from "vitest";
import { formatCoverage, runBatch } from "./batch";

it("plays 16 full games through the controller (batch 1)", async () => {
  const cov = await runBatch({ batch: 1, games: 16, resumeEvery: 4 });
  console.log(`batch 1\n${formatCoverage(cov)}`);
}, 600_000);
