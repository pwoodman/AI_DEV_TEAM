export type Parser = { parse(input: string): string[] };

export const jsonParser: Parser = {
  parse(input: string): string[] {
    const arr = JSON.parse(input) as unknown;
    if (!Array.isArray(arr)) throw new Error("expected array");
    return arr.map(String);
  },
};
