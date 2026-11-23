import { it } from "vitest";
import { formatCoverage, runBatch } from "./batch";

it("plays 16 full games through the controller (batch 3)", async () => {
  const cov = await runBatch({ batch: 3, games: 16, resumeEvery: 4 });
  console.log(`batch 3\n${formatCoverage(cov)}`);
}, 600_000);
