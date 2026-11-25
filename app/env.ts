export interface Env {
  DB: D1Database;
  CLERK_SECRET_KEY?: string;
  VITE_CLERK_PUBLISHABLE_KEY?: string;
  NEWS_FEED_URL?: string;
  NEWS_FEED_TOKEN?: string;
  AI?: { run(model: string, input: Record<string, unknown>): Promise<unknown> };
  AI_ENABLED?: string;
  AI_ALLOW_LOCAL?: string;
  AI_MODEL?: string;
  AI_DAILY_QUESTION_LIMIT?: string;
  AI_GLOBAL_DAILY_NEURON_BUDGET?: string;
  AI_MAX_OUTPUT_TOKENS?: string;
}
