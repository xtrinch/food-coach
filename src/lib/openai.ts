import { db, DailyLog, DailyInsight } from "./db";

function getApiKey() {
  const key = localStorage.getItem("openai_api_key") || "";
  if (!key) {
    throw new Error("OpenAI API key not set. Go to Settings and add your key.");
  }
  return key;
}

const MODEL = "gpt-4.1-mini";

async function callOpenAIChat(
  systemPrompt: string,
  userContent: string,
  opts: { jobId?: string } = {}
): Promise<string> {
  const apiKey = getApiKey();
  const promptLog = `System:\n${systemPrompt}\n\nUser:\n${userContent}`;
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
};

type MealEstimateResult = {
  calories: number;
  explanation?: string;
};

// Estimate calories for a meal description, optionally incorporating user's own estimate
export async function runMealCaloriesEstimation(
  description: string,
  context: MealEstimateContext = {},
  opts: { jobId?: string } = {}
): Promise<MealEstimateResult> {
  const systemPrompt = [
    "You are a nutrition assistant. Estimate total calories for a single meal description.",
    "If the user provides their own estimate and confidence (1-5), treat it as a prior: stay near it when reasonable, adjust if clearly implausible.",
    "Respond with ONLY a JSON object like { \"calories\": 450, \"explanation\": \"Short reasoning\" }. Explanation should be one sentence.",
    "If you are unsure, give your best reasonable estimate."
  ].join(" ");
  const user = JSON.stringify({
    meal_description: description,
    user_estimate: context.userEstimate,
    user_confidence_1_to_5: context.userConfidence,
  });
  const content = await callOpenAIChat(systemPrompt, user, { jobId: opts.jobId });
  try {
    const parsed = JSON.parse(content);
    const c = Number(parsed.calories);
    if (Number.isFinite(c) && c > 0) {
      return {
        calories: c,
        explanation: typeof parsed.explanation === "string" ? parsed.explanation : undefined,
      };
    }
  } catch {
    // fall through
  }
  throw new Error("Failed to parse calorie estimation.");
}

// Run daily insight if it doesn't exist yet
export async function runDailyInsightIfNeeded(date: string, opts: { jobId?: string } = {}): Promise<void> {
  const existing = await db.dailyInsights.where("date").equals(date).first();
  if (existing) return;

  const logs: DailyLog[] = await db.dailyLogs
    .where("date")
    .belowOrEqual(date)
    .reverse()
    .limit(14)
    .toArray();

  if (!logs.length) return;

  const today = logs.find((l) => l.date === date) ?? logs[0];

  const payload = {
    focus_date: date,
    logs,
  };

  const systemPrompt = [
    "You are a friendly nutrition and physiology coach.",
    "Given the user's last ~2 weeks of food logs, symptoms, sleep, stress and weight,",
    "explain today's weight/bloating, identify patterns, and suggest 1-3 concrete actions for tomorrow.",
    "Respond ONLY as JSON with keys: weight_explanation, bloating_explanation, patterns, actions, caveats."
  ].join(" ");

  const content = await callOpenAIChat(systemPrompt, JSON.stringify(payload), { jobId: opts.jobId });

  const insight: DailyInsight = {
    date,
    generatedAt: new Date().toISOString(),
    model: MODEL,
    rawJson: content,
    prettyText: content,
  };

  const id = await db.dailyInsights.add(insight);
  await db.dailyLogs.update(today.id, { dailyInsightId: String(id), updatedAt: new Date().toISOString() });
}
