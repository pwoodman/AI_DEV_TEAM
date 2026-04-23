import type { Validator } from "../pipeline.js";
import { schemaValidator } from "./schema.js";

export const defaultValidators: Validator[] = [schemaValidator];
