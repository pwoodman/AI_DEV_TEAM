export type Parser = { parse(input: string): string[] };

export const csvParser: Parser = {
  parse(input: string): string[] {
    return input.split(",").map((s) => s.trim());
  },
};
