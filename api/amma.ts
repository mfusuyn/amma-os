/**
 * AMMA OS — server-side judgment endpoint (Vercel serverless function).
 *
 * Frontend -> POST /api/amma -> Groq API -> structured JSON -> results screen.
 *
 * GROQ_API_KEY is read ONLY here (server runtime). It is never returned to the
 * client and never appears in any log line.
 */

export const config = {
  runtime: "nodejs",
  maxDuration: 30,
};

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const TEXT_MODEL = "openai/gpt-oss-120b";
const VISION_MODEL = "qwen/qwen3.6-27b";

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

// Minimal structural types so we don't depend on @vercel/node types.
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
- money, spending, and whether the price was "necessary" (quoted mockingly)
- education, work, and career impact
- effort the user actually put in
- common sense
- unnecessary luxury vs genuine need
- consequences the user has not thought about
- stereotypical family and relative comparisons ("Sharma uncle's son...", "the neighbor's daughter...")

HUMOR RULES:
- Humor must come from the reasoning, the logic, and the comparisons — never random insults or cruelty.
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
- verdict must be exactly "APPROVED" or "REJECTED" (uppercase). REJECTED should be common but not automatic — genuinely sensible choices can be APPROVED, rarely, and grudgingly.
- All values are plain strings. analysis must contain exactly 3 items.`;

// Structured console diagnostics — visible in Vercel function logs.
function log(kind: "info" | "warn" | "error", event: string, detail?: Record<string, unknown>) {
  const payload = JSON.stringify({ ts: new Date().toISOString(), event, ...detail });
  if (kind === "error") console.error(payload);
  else if (kind === "warn") console.warn(payload);
  else console.log(payload);
}

function jsonError(res: VercelLikeResponse, status: number, error: string, event: string, detail?: Record<string, unknown>) {
  log("warn", event, detail);
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
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);
}

function normalizeVerdict(value: unknown): AmmaVerdict {
  const v = toCleanString(value, 32).toUpperCase();
  if (v.includes("REJECT")) return "REJECTED";
  if (v.includes("APPROVE")) return "APPROVED";
  return "REJECTED";
}

function normalizeAnalysis(value: unknown): string[] {
  let items: string[] = [];
  if (Array.isArray(value)) {
    items = value.map((v) => toCleanString(v, 600)).filter(Boolean);
  } else if (typeof value === "string") {
    items = value.split(/\n+/).map((line) => toCleanString(line, 600)).filter(Boolean);
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

function parseDataUrl(dataUrl: string): { mimeType: string; base64: Buffer } {
  const match = /^data:([a-zA-Z0-9/+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  if (!match || !match[2]) {
    throw new Error("invalid image payload");
  }
  const mimeType = match[1].toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.includes(mimeType)) {
    throw new Error("unsupported image type");
  }
  const base64 = match[2];
  if (base64.length === 0 || base64.length > MAX_BASE64_LENGTH) {
    throw new Error("image too large");
  }
  return { mimeType, base64: Buffer.from(base64, "base64") };
}

/**
 * Normalize the request body into an object. Handles all Vercel Node runtime
 * behaviors: pre-parsed object, string body, or an unread stream.
 */
async function getBodyObject(req: VercelLikeRequest): Promise<Record<string, unknown> | null> {
  const rawBody = req.body;
  if (rawBody == null) {
    const stream = req as unknown as {
      on?: (ev: string, cb: (chunk: Buffer) => void) => void;
      resume?: () => void;
    };
    if (typeof stream.on !== "function") return {};
    const text = await new Promise<string>((resolve) => {
      let data = "";
      stream.on!("data", (chunk: Buffer) => { data += chunk.toString("utf8"); });
      stream.on!("end", () => resolve(data));
      stream.on!("error", () => resolve(""));
      stream.resume?.();
    });
    if (!text) return {};
    try { return JSON.parse(text) as Record<string, unknown>; } catch { return null; }
  }
  if (typeof rawBody === "string") {
    try { return JSON.parse(rawBody) as Record<string, unknown>; } catch { return null; }
  }
  if (typeof rawBody === "object") return rawBody as Record<string, unknown>;
  return null;
}

/** Map a Groq failure reason to an HTTP status + safe user-facing message. */
function groqErrorMapping(reason: string): { status: number; error: string } {
  switch (reason) {
    case "NETWORK_ERROR":
      return { status: 502, error: "AMMA OS lost the connection mid-judgment. Try again." };
    case "GROQ_AUTH_FAILED":
      return { status: 502, error: "AMMA OS could not authenticate with the judgment engine." };
    case "GROQ_MODEL_UNAVAILABLE":
      return { status: 502, error: "Amma's judging model is unavailable right now. Try again shortly." };
    case "GROQ_BAD_REQUEST":
      return { status: 502, error: "Amma rejected the submission format. Try again." };
    case "GROQ_PAYLOAD_TOO_LARGE":
      return { status: 413, error: "That submission is too large for Amma to process." };
    case "GROQ_RATE_LIMIT":
      return { status: 429, error: "Amma is judging too many people at once. Wait a moment and try again." };
    case "GROQ_EMPTY_RESPONSE":
      return { status: 502, error: "Amma looked at your submission and said nothing. Try again." };
    default:
      return { status: 502, error: "AMMA OS hit an unexpected error while judging. Try again." };
  }
}

async function callGroq(apiKey: string, model: string, messages: Array<Record<string, unknown>>, jsonMode: boolean): Promise<string> {
  const requestBody: Record<string, unknown> = { model, messages, temperature: 0.9, max_completion_tokens: 2048 };
  if (jsonMode) requestBody.response_format = { type: "json_object" };

  let response: Response;
  try {
    response = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
  } catch {
    throw new Error("NETWORK_ERROR");
  }

  if (!response.ok) {
    const status = response.status;
    let detail = "";
    try {
      const errBody = (await response.json()) as { error?: { message?: string } };
      detail = String(errBody?.error?.message ?? "").slice(0, 200);
    } catch { /* body not JSON; ignore */ }
    log("warn", "groq.http_error", { status, detail, model });
    if (status === 400) throw new Error("GROQ_BAD_REQUEST");
    if (status === 401 || status === 403) throw new Error("GROQ_AUTH_FAILED");
    if (status === 404) throw new Error("GROQ_MODEL_UNAVAILABLE");
    if (status === 413) throw new Error("GROQ_PAYLOAD_TOO_LARGE");
    if (status === 429) throw new Error("GROQ_RATE_LIMIT");
    throw new Error("GROQ_ERROR");
  }

  const data = (await response.json().catch(() => null)) as
    | { choices?: Array<{ message?: { content?: string } }> }
    | null;
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
    res.status(204).json({});
    return;
  }
  if (req.method !== "POST") {
    return jsonError(res, 405, "Method not allowed. Amma accepts submissions via POST.", "req.wrong_method", { method: req.method ?? "unknown" });
  }

  // GROQ_API_KEY is read only here, at request time, on the server.
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return jsonError(res, 500, "AMMA OS is offline: the judgment engine is not configured on the server.", "cfg.missing_key");
  }

  const body = await getBodyObject(req);
  if (!body) {
    return jsonError(res, 400, "Amma could not parse that request. Expected a JSON body.", "req.unparseable_body");
  }

  const mode = body.mode === "image" ? "image" : body.mode === "text" ? "text" : null;
  if (!mode) {
    return jsonError(res, 400, "Invalid submission. Expected mode 'text' or 'image'.", "req.bad_mode", { got: String(body.mode) });
  }

  const userText = toCleanString(body.text, MAX_TEXT_LENGTH);

  let model: string;
  let messages: Array<Record<string, unknown>>;
  let jsonMode = true;
  let imageDataUrl = "";

  try {
    if (mode === "text") {
      if (!userText) {
        return jsonError(res, 400, "Amma cannot judge an empty statement. Say what you did.", "req.empty_text");
      }
      model = TEXT_MODEL;
      jsonMode = true;
      messages = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `The user submits the following for judgment:\n\n"${userText}"\n\nUnderstand it, then judge it. Respond with only the JSON object.` },
      ];
    } else {
      imageDataUrl = typeof body.image === "string" ? body.image : "";
      if (!imageDataUrl) {
        return jsonError(res, 400, "Amma received no image. Upload something for her to see.", "req.missing_image");
      }
      let parsed: { mimeType: string; base64: Buffer };
      try {
        parsed = parseDataUrl(imageDataUrl);
      } catch (err) {
        const reason = err instanceof Error ? err.message : "invalid image";
        log("warn", "req.bad_image", { reason });
        if (reason === "unsupported image type") {
          return jsonError(res, 415, "Amma accepts only JPEG, PNG, or WebP images.", "req.bad_image_type");
        }
        return jsonError(res, 413, "That image is too large. Send something under 4 MB.", "req.image_too_large");
      }
      log("info", "req.image_parsed", { mimeType: parsed.mimeType, bytes: parsed.base64.length });
      model = VISION_MODEL;
      // qwen3.6-27b supports JSON mode with image input — keep output strictly structured.
      jsonMode = true;
      messages = [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageDataUrl } },
            {
              type: "text",
              text: `The user submits this image for judgment${userText ? `, with the note: "${userText}"` : ""}.\n\nFirst understand what is actually visible in the image (whatAmmaSees). Then judge it. Respond with only the JSON object.`,
            },
          ],
        },
      ];
    }
  } catch (err) {
    log("error", "req.build_failed", { message: err instanceof Error ? err.message : "unknown" });
    return jsonError(res, 400, "Amma could not read that submission.", "req.build_failed");
  }

  log("info", "judgment.start", { mode, model, jsonMode, textLength: userText.length });

  let raw = "";
  try {
    raw = await callGroq(apiKey, model, messages, jsonMode);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "GROQ_ERROR";
    const mapped = groqErrorMapping(reason);
    log("error", "judgment.groq_failed", { reason, mode, model });
    return jsonError(res, mapped.status, mapped.error, "judgment.groq_failed", { reason });
  }

  let judgment: AmmaJudgment;
  try {
    judgment = normalizeJudgment(extractJson(raw));
  } catch (err) {
    log("error", "judgment.malformed_output", { message: err instanceof Error ? err.message : "unknown", preview: raw.slice(0, 200) });
    return jsonError(res, 502, "Amma's response was malformed. Even she is embarrassed. Try again.", "judgment.malformed_output");
  }

  log("info", "judgment.success", { mode, model, verdict: judgment.verdict, analysisCount: judgment.analysis.length });
  return res.status(200).json({ judgment });
}
