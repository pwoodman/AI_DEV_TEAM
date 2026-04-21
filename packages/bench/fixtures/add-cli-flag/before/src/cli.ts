export function run(args: string[]): string {
  const name = args[0] ?? "anon";
  const age = Number(args[1] ?? "0");
  return `name=${name} age=${age}`;
}
