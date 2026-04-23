export function run(argv: string[]): string {
  const cmd = argv[0];
  if (cmd === "greet") {
    const name = argv[1];
    if (!name) return "error: missing name";
    return `Hello, ${name}!`;
  }
  return "unknown command";
}
