import { db, DailyLog, DailyInsight } from "./db";

function getApiKey() {
  const key = localStorage.getItem("openai_api_key") || "";
  if (!key) {
    throw new Error("OpenAI API key not set. Go to Settings and add your key.");
  }
  return key;
}

const MODEL = "gpt-4.1-mini";

type UserMessageContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >;

function formatUserContentForLog(content: UserMessageContent): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts = content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part.type === "text") return part.text;
        if (part.type === "image_url") return "[image]";
        try {
          return JSON.stringify(part);
        } catch {
          return String(part);
        }
      })
      .filter(Boolean);
    return parts.join("\n");
  }
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

async function callOpenAIChat(
  systemPrompt: string,
  userContent: UserMessageContent,
  opts: { jobId?: string } = {}
): Promise<string> {
  const apiKey = getApiKey();
  const promptLog = `System:\n${systemPrompt}\n\nUser:\n${formatUserContentForLog(userContent)}`;
  if (opts.jobId) {
    void db.analysisJobs.update(opts.jobId, { prompt: promptLog }).catch((e) => {
      console.error("Failed to persist job prompt", e);
    });
  }
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      temperature: 0.4,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("No content from OpenAI");
  if (opts.jobId) {
    void db.analysisJobs.update(opts.jobId, { response: content }).catch((e) => {
      console.error("Failed to persist job response", e);
    });
  }
  return content;
}

type MealEstimateContext = {
  userEstimate?: number;
  userConfidence?: number; // 1-5 self-rated confidence
  photoDataUrl?: string;
};

type MealEstimateResult = {
  calories: number;
  explanation?: string;
  proteinGrams?: number;
  carbsGrams?: number;
  fatGrams?: number;
};

// Estimate calories for a meal description, optionally incorporating user's own estimate
export async function runMealCaloriesEstimation(
  description: string,
  context: MealEstimateContext = {},
  opts: { jobId?: string } = {}
): Promise<MealEstimateResult> {
  const systemPrompt = [
    "You are a nutrition assistant. Estimate total calories for a single meal from the provided description and photo (if present).",
    "If the user provides their own estimate and confidence (1-5), treat it as a prior: stay near it when reasonable, adjust if clearly implausible.",
    "Use the photo when present to refine the estimate.",
    "Respond with ONLY a JSON object like { \"calories\": 450, \"protein_g\": 30, \"carbs_g\": 50, \"fat_g\": 15, \"explanation\": \"Short reasoning\" }. Explanation should be one sentence.",
    "If you are unsure, give your best reasonable estimate."
  ].join(" ");
  const textBlock = [
    description ? `Description: ${description}` : "No text description provided.",
    `User estimate: ${context.userEstimate ?? "none"}`,
    `User confidence (1-5): ${context.userConfidence ?? "not provided"}`,
    context.photoDataUrl ? "Photo attached below." : "No photo provided.",
  ].join("\n");
  const userContent: UserMessageContent = [{ type: "text", text: textBlock }];
  if (context.photoDataUrl) {
    userContent.push({ type: "image_url", image_url: { url: context.photoDataUrl } });
  }
  const content = await callOpenAIChat(systemPrompt, userContent, { jobId: opts.jobId });
  try {
    const parsed = JSON.parse(content);
    const c = Number(parsed.calories);
    if (Number.isFinite(c) && c > 0) {
      return {
        calories: c,
        explanation: typeof parsed.explanation === "string" ? parsed.explanation : undefined,
        proteinGrams: Number.isFinite(Number(parsed.protein_g)) ? Number(parsed.protein_g) : undefined,
        carbsGrams: Number.isFinite(Number(parsed.carbs_g)) ? Number(parsed.carbs_g) : undefined,
        fatGrams: Number.isFinite(Number(parsed.fat_g)) ? Number(parsed.fat_g) : undefined,
      };
    }
  } catch {
    // fall through
  }
  throw new Error("Failed to parse calorie estimation.");
}

// Run daily insight; if force is false, skip when one already exists
export async function runDailyInsightIfNeeded(
  date: string,
  opts: { jobId?: string; force?: boolean } = {}
): Promise<void> {
  if (!opts.force) {
    const existing = await db.dailyInsights.where("date").equals(date).first();
    if (existing) return;
  }

  const logs: DailyLog[] = await db.dailyLogs
    .where("date")
    .belowOrEqual(date)
    .reverse()
    .limit(14)
    .toArray();

  if (!logs.length) return;

  const today = logs.find((l) => l.date === date) ?? logs[0];

  const sanitizedLogs = logs.map((log) => ({
    ...log,
    meals: log.meals.map(({ photoDataUrl, ...rest }) => rest), // remove photos
  }));

  const payload = {
    focus_date: date,
    logs: sanitizedLogs,
  };

  const systemPrompt = [
    "You are a friendly nutrition and physiology coach.",
    "Given the user's last ~2 weeks of food logs, notes, sleep, stress and weight,",
    "explain today's weight/bloating, identify patterns, and suggest 1-3 concrete actions for tomorrow.",
    "Respond ONLY as JSON with keys: weight_explanation, bloating_explanation, patterns, actions, caveats."
  ].join(" ");

  const content = await callOpenAIChat(systemPrompt, JSON.stringify(payload), { jobId: opts.jobId });

  // Replace any existing insights for this date when forced
  if (opts.force) {
    const old = await db.dailyInsights.where("date").equals(date).toArray();
    await Promise.all(old.map((i) => db.dailyInsights.delete(String(i.id))));
  }

  const insight: DailyInsight = {
    date,
    generatedAt: new Date().toISOString(),
    model: MODEL,
    rawJson: content,
    prettyText: content,
    prompt: `${systemPrompt}\n\nUser:\n${JSON.stringify(payload, null, 2)}`,
  };

  const id = await db.dailyInsights.add(insight);
  await db.dailyLogs.update(today.id, { dailyInsightId: String(id), updatedAt: new Date().toISOString() });
}
