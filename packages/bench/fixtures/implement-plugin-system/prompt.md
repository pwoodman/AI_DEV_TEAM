The codebase has four hardcoded data parsers (csv, json, xml, tsv) wired directly into the pipeline.
Refactor to a plugin system:
1. Create `src/plugin-registry.ts` that exports a `PluginRegistry` class with `register(name, parser)` and `get(name)` methods.
2. Update each parser file to call `registry.register(...)` at module load time (self-registration pattern).
3. Update `src/pipeline.ts` to import the registry and use `registry.get(format)` instead of the hardcoded switch.
4. Export a singleton `registry` from `src/plugin-registry.ts`.

Do not change the `Parser` type or the `parse(input: string): string[]` signature.
The tests import each parser file to trigger self-registration before running pipeline tests.
