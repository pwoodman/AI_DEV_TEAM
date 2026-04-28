import { buildContextFiles } from "./context-builder.js";

export class ContextAssembler {
  async build(
    workspace: string,
    allowedPaths: string[],
    budgetBytes: number,
  ): Promise<Array<{ path: string; slice: string }>> {
    return buildContextFiles(workspace, allowedPaths, budgetBytes);
  }
}
