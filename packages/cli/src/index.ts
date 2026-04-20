#!/usr/bin/env node
import { resolve } from "node:path";
import { buildAgentRegistry } from "@amase/agents";
import { Orchestrator } from "@amase/core";
import { AnthropicClient } from "@amase/llm";
import { DAGStore, DecisionLog } from "@amase/memory";
import {
  lintValidator,
  patchSafetyValidator,
  schemaValidator,
  typecheckValidator,
  uiTestsValidator,
  unitTestsValidator,
} from "@amase/validators";

function usage(): never {
  process.stderr.write(
    `usage: amase run "<feature request>" [--workspace <path>]\n` +
      `       amase plan "<feature request>" [--workspace <path>]\n`,
  );
  process.exit(2);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || (cmd !== "run" && cmd !== "plan")) usage();

  const wsIdx = rest.indexOf("--workspace");
  const workspacePath = resolve(wsIdx >= 0 ? rest[wsIdx + 1] ?? "." : ".");
  const request = rest.filter((_, i) => i !== wsIdx && i !== wsIdx + 1).join(" ");
  if (!request) usage();

  const llm = new AnthropicClient();
  const agents = buildAgentRegistry(llm);
  const store = new DAGStore();
  const orchestrator = new Orchestrator({
    agents,
    validators: [
      schemaValidator,
      patchSafetyValidator,
      typecheckValidator,
      lintValidator,
      unitTestsValidator,
      uiTestsValidator,
    ],
    store,
    makeDecisionLog: (p) => new DecisionLog(p),
  });

  const { dagId, graph } = await orchestrator.plan({ request, workspacePath });
  process.stdout.write(`planned dagId=${dagId} nodes=${graph.nodes.length}\n`);
  for (const n of graph.nodes) {
    process.stdout.write(`  - ${n.id} [${n.kind}] ${n.goal}\n`);
  }

  if (cmd === "plan") return;

  const { runId } = await orchestrator.execute(dagId);
  process.stdout.write(`runId=${runId}\n`);
  const g = store.get(dagId);
  for (const n of g?.nodes ?? []) {
    process.stdout.write(`  ${n.id}: ${n.status ?? "pending"}\n`);
  }
}

main().catch((err) => {
  process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
