export default {
  id: "merlin",
  priority: 200,
  alias: "merlin",
  aliases: [
    "ml",
  ],
  uiAlias: "ml",
  display: {
    name: "Merlin (getmerlin.in)",
    icon: "auto_awesome",
    color: "#7C3AED",
    textIcon: "ML",
    website: "https://www.getmerlin.in",
    notice: {
      text: "Merlin web accounts via Firebase refresh tokens. Configure accounts in MERLIN_ACCOUNTS env var (JSON array) and set FIREBASE_API_KEY.",
    },
  },
  category: "webCookie",
  authType: "none",
  transport: {
    baseUrl: "https://www.getmerlin.in/arcane/api/v2/thread/unified",
    format: "merlin",
    noAuth: true,
  },
  models: [
    { id: "gpt-4o-mini", name: "GPT-4o Mini (via Merlin)" },
    { id: "gpt-4o", name: "GPT-4o (via Merlin)" },
    { id: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet (via Merlin)" },
    { id: "gemini-flash", name: "Gemini 2.5 Flash (via Merlin)" },
    { id: "deepseek-v3", name: "DeepSeek V3 (via Merlin)" },
    { id: "deepseek-r1", name: "DeepSeek R1 (via Merlin)" },
    { id: "glm-4", name: "GLM-4 (via Merlin)" },
  ],
};
