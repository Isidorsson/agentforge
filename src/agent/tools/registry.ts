import type { Tool } from './types.js';
import { fetchUrlTool } from './fetch_url.js';
import { searchDocsTool } from './search_docs.js';

export const TOOLS: ReadonlyArray<Tool> = [fetchUrlTool, searchDocsTool];

export const TOOLS_BY_NAME: ReadonlyMap<string, Tool> = new Map(TOOLS.map((t) => [t.name, t]));

export const TOOL_DEFINITIONS = TOOLS.map((t) => t.definition);
