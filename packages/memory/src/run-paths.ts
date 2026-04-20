import { join } from "node:path";

export interface RunPaths {
  root: string;
  workspace: string;
  decisions: string;
  embeddings: string;
  dagSnapshot: string;
}

export function runPaths(workspacePath: string, dagId: string): RunPaths {
  const root = join(workspacePath, ".amase", "runs", dagId);
  return {
    root,
    workspace: join(root, "workspace"),
    decisions: join(root, "decisions.jsonl"),
    embeddings: join(root, "embeddings"),
    dagSnapshot: join(root, "dag.json"),
  };
}
