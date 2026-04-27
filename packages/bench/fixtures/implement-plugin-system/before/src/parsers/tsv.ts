export type Parser = { parse(input: string): string[] };

export const tsvParser: Parser = {
  parse(input: string): string[] {
    return input.split("\t").map((s) => s.trim());
  },
};
