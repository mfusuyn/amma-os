/**
 * AMMA OS — server-side judgment endpoint.
 *
 * Frontend -> /api/amma -> Groq API -> structured JSON -> results screen.
 *
 * GROQ_API_KEY is read ONLY here (server runtime). It must never be
 * imported into client-side code or exposed in a response.
 *
 * Deployed automatically by Vercel (Node runtime). In local Vite dev this
 * endpoint is not served; the frontend falls back gracefully.
 */

export const config = {
  runtime: "nodejs",
  maxDuration: 30,
};

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const TEXT_MODEL = "llama-3.3-70b-versatile";
const VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

const MAX_TEXT_LENGTH = 4000;
const MAX_BASE64_LENGTH = 6_000_000; // ~4.5 MB binary after decoding
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

type AmmaVerdict = "APPROVED" | "REJECTED";

interface AmmaJudgment {
  whatAmmaSees: string;
  analysis: string[];
  financialDamage: string;
  ammasConcern: string;
  relativeComparison: string;
  verdict: AmmaVerdict;
  verdictReason: string;
}

// Minimal structural types so we don't depend on @vercel/node types at build time.
interface VercelLikeRequest {
  method?: string;
  body?: unknown;
}

interface VercelLikeResponse {
  status: (code: number) => VercelLikeResponse;
  json: (payload: unknown) => unknown;
  setHeader: (name: string, value: string) => unknown;
}

const SYSTEM_PROMPT = `You are AMMA OS: a highly confident Indian (Malayali) mother operating as a judgment engine. You judge the user's life choices with overwhelming authority, humor, and zero tolerance for unnecessary spending.

TWO PHASES, ALWAYS IN ORDER:
1. UNDERSTAND: First accurately understand what the user actually submitted — what it is, what it costs, what it is for.
2. JUDGE: Then judge it the way a stereotypical Indian/Malayali mother would.

JUDGMENT CRITERIA (consider all, apply where relevant):
- practicality and long-term usefulness
- money, spending, and whether the price was "necessary"
- education, work, and career impact
- effort the user actually put in
- common sense
- unnecessary luxury vs genuine need
- consequences the user has not thought about
- stereotypical family and relative comparisons ("Sharma uncle's son...", "the neighbor's daughter...")

HUMOR RULES:
- Humor must come from the reasoning, the logic, and the comparisons — never from random insults or cruelty.
- You may use occasional, natural Malayalam phrases (1-2 per response maximum), such as:
  "For studying, alle?", "Enthina ithra paisa?", "Avante makan...", "Veettil irunnal pore?"
- Warm underneath it all: you judge because you care (and because you are always right).
- NEVER make judgments about race, religion, caste, gender, sexuality, disability, or any protected class. Judge the choice, never the person's identity.

OUTPUT RULES:
- Respond with ONLY a single valid JSON object. No markdown fences, no commentary, no text before or after.
- Exact schema:
{
  "whatAmmaSees": "one or two sentences: what Amma understands the submission to actually be",
  "analysis": ["exactly 3 short analytical observations, each 1-2 sentences"],
  "financialDamage": "assessment of the money angle, even if no money is directly involved",
  "ammasConcern": "Amma's main worry about this choice, in her voice",
  "relativeComparison": "how a cousin, neighbor, or relative is allegedly doing better",
  "verdict": "APPROVED or REJECTED",
  "verdictReason": "one or two sentences explaining the verdict in Amma's voice"
}
- verdict must be exactly "APPROVED" or "REJECTED" (uppercase). True "REJECTED" verdicts should be common but not automatic — genuinely sensible choices can be APPROVED, rarely, and grudgingly.
- All values are plain strings. analysis must contain exactly 3 items.`;

function jsonError(res: VercelLikeResponse, status: number, error: string) {
  return res.status(status).json({ error });
}

function setCors(res: VercelLikeResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

/** Extract a JSON object from model output that may be wrapped in reasoning tags or prose. */
function extractJson(raw: string): unknown {
  let text = raw.trim();
  // Strip common reasoning wrappers.
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("no JSON object found in model output");
  }
  return JSON.parse(text.slice(start, end + 1));
}

function toCleanString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  // Strip control characters and cap length defensively.
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);
}

function normalizeVerdict(value: unknown): AmmaVerdict {
  const v = toCleanString(value, 32).toUpperCase();
  if (v.includes("REJECT")) return "REJECTED";
  if (v.includes("APPROVE")) return "APPROVED";
  // When in doubt, Amma rejects.
  return "REJECTED";
}

function normalizeAnalysis(value: unknown): string[] {
  let items: string[] = [];
  if (Array.isArray(value)) {
    items = value.map((v) => toCleanString(v, 600)).filter(Boolean);
  } else if (typeof value === "string") {
    items = value
      .split(/\n+/)
      .map((line) => toCleanString(line, 600))
      .filter(Boolean);
  }
  items = items.slice(0, 5);
  while (items.length < 3) {
    items.push(
      items.length === 0
        ? "Amma is still processing the scale of this."
        : "Amma has chosen not to comment further. That itself is a comment.",
    );
  }
  return items;
}

function normalizeJudgment(raw: unknown): AmmaJudgment {
  const obj = (raw ?? {}) as Record<string, unknown>;
  return {
    whatAmmaSees: toCleanString(obj.whatAmmaSees, 2000),
    analysis: normalizeAnalysis(obj.analysis),
    financialDamage: toCleanString(obj.financialDamage, 1200),
    ammasConcern: toCleanString(obj.ammasConcern, 1200),
    relativeComparison: toCleanString(obj.relativeComparison, 1200),
    verdict: normalizeVerdict(obj.verdict),
    verdictReason: toCleanString(obj.verdictReason, 1200),
  };
}

function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const match = /^data:([a-zA-Z0-9/+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(
    dataUrl.trim(),
  );
  if (!match) {
    throw new Error("invalid image payload");
  }
  const mimeType = match[1].toLowerCase();
  const base64 = match[2];
  if (!ALLOWED_IMAGE_TYPES.includes(mimeType)) {
    throw new Error("unsupported image type");
  }
  if (base64.length === 0 || base64.length > MAX_BASE64_LENGTH) {
    throw new Error("image too large");
  }
  return { mimeType, base64 };
}

async function callGroq(
  apiKey: string,
  model: string,
  messages: Array<Record<string, unknown>>,
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.9,
        max_tokens: 1024,
        response_format: { type: "json_object" },
      }),
    });
  } catch {
    throw new Error("NETWORK_ERROR");
  }

  if (!response.ok) {
    // Read the error body for diagnostics but never echo the key or full payload.
    const status = response.status;
    if (status === 401 || status === 403) throw new Error("GROQ_AUTH_FAILED");
    if (status === 404) throw new Error("GROQ_MODEL_UNAVAILABLE");
    if (status === 413) throw new Error("GROQ_PAYLOAD_TOO_LARGE");
    if (status === 429) throw new Error("GROQ_RATE_LIMIT");
    throw new Error("GROQ_ERROR");
  }

  const data = (await response.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: string } }>;
  } | null;
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error("GROQ_EMPTY_RESPONSE");
  }
  return content;
}

export default async function handler(
  req: VercelLikeRequest,
  res: VercelLikeResponse,
) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).json({});
  }
  if (req.method !== "POST") {
    return jsonError(res, 405, "Method not allowed. Amma accepts submissions via POST.");
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return jsonError(
      res,
      500,
      "AMMA OS is offline: GROQ_API_KEY is not configured on the server.",
    );
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const mode = body.mode === "image" ? "image" : body.mode === "text" ? "text" : null;
  if (!mode) {
    return jsonError(res, 400, "Invalid submission. Expected mode 'text' or 'image'.");
  }

  const userText = toCleanString(body.text, MAX_TEXT_LENGTH);

  let messages: Array<Record<string, unknown>>;
  let model: string;

  try {
    if (mode === "text") {
      if (!userText) {
        return jsonError(res, 400, "Amma cannot judge an empty statement. Say what you did.");
      }
      model = TEXT_MODEL;
      messages = [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `The user submits the following for judgment:\n\n"${userText}"\n\nUnderstand it, then judge it. Respond with only the JSON object.`,
        },
      ];
    } else {
      const imageDataUrl = typeof body.image === "string" ? body.image : "";
      if (!imageDataUrl) {
        return jsonError(res, 400, "Amma received no image. Upload something for her to see.");
      }
      let parsed: { mimeType: string; base64: string };
      try {
        parsed = parseDataUrl(imageDataUrl);
      } catch (err) {
        const reason = err instanceof Error ? err.message : "invalid image";
        if (reason === "unsupported image type") {
          return jsonError(res, 415, "Amma accepts only JPEG, PNG, or WebP images.");
        }
        return jsonError(
          res,
          413,
          "That image is too large. Compress it or send something under 4 MB.",
        );
      }
      model = VISION_MODEL;
      messages = [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageDataUrl } },
            {
              type: "text",
              text: `The user submits this image for judgment${
                userText ? `, with the note: "${userText}"` : ""
              }.\n\nFirst understand what is actually visible in the image (whatAmmaSees). Then judge it. Respond with only the JSON object.`,
            },
          ],
        },
      ];
    }
  } catch {
    return jsonError(res, 400, "Amma could not read that submission.");
  }

  try {
    const raw = await callGroq(apiKey, model, messages);
    let judgment: AmmaJudgment;
    try {
      judgment = normalizeJudgment(extractJson(raw));
    } catch {
      return jsonError(
        res,
        502,
        "Amma's response was malformed. Even she is embarrassed. Try again.",
      );
    }
    return res.status(200).json({ judgment });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "GROQ_ERROR";
    switch (reason) {
      case "NETWORK_ERROR":
        return jsonError(res, 502, "AMMA OS lost the connection mid-judgment. Try again.");
      case "GROQ_AUTH_FAILED":
        return jsonError(res, 502, "AMMA OS could not authenticate with the judgment engine.");
      case "GROQ_MODEL_UNAVAILABLE":
        return jsonError(res, 502, "Amma's judging model is unavailable right now. Try again shortly.");
      case "GROQ_PAYLOAD_TOO_LARGE":
        return jsonError(res, 413, "That submission is too large for Amma to process.");
      case "GROQ_RATE_LIMIT":
        return jsonError(res, 429, "Amma is judging too many people at once. Wait a moment and try again.");
      case "GROQ_EMPTY_RESPONSE":
        return jsonError(res, 502, "Amma looked at your submission and said nothing. Try again.");
      default:
        return jsonError(res, 502, "AMMA OS hit an unexpected error while judging. Try again.");
    }
  }
}
