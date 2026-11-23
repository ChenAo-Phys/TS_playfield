import { it } from "vitest";
import { formatCoverage, runBatch } from "./batch";

it("plays 16 full games through the controller (batch 4)", async () => {
  const cov = await runBatch({ batch: 4, games: 16, resumeEvery: 4 });
  console.log(`batch 4\n${formatCoverage(cov)}`);
}, 600_000);
