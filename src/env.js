// RAKE - environment. Loads .env if present (Node native), exposes typed getters.

try {
  process.loadEnvFile();
} catch {
  // no .env file - env vars may still come from the shell
}

export const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY || null;
export const ANTHROPIC_KEY_PRESENT = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
export const GROQ_API_KEY = process.env.GROQ_API_KEY || null;
export const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
export const PORT = Number(process.env.PORT || 4173);

export const alchemyRpcUrl = () =>
  ALCHEMY_API_KEY ? `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}` : null;
