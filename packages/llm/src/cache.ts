export interface SystemBlockInput {
  text: string;
  cacheable?: boolean;
}
export interface SystemBlock {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}
export function buildCachedSystem(inputs: SystemBlockInput[]): SystemBlock[] {
  return inputs.map((b) => ({
    type: "text",
    text: b.text,
    ...(b.cacheable === false ? {} : { cache_control: { type: "ephemeral" as const } }),
  }));
}
