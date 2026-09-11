/**
 * AMMA OS — local handler tests.
 *
 * Exercises api/amma.ts end-to-end with mocked req/res objects and a mocked
 * global fetch (no real network, no secrets). Run: bun scripts/test-amma.ts
 */

// Ensure the not-configured path is testable deterministically.
process.env.GROQ_API_KEY = "";

import handler from "../api/amma.ts";

interface MockRes {
  statusCode: number | null;
  body: unknown;
  status(code: number): MockRes;
  json(payload: unknown): unknown;
  setHeader(name: string, value: string): unknown;
  headers: Record<string, string>;
}

function makeRes(): MockRes {
  const res: MockRes = {
    statusCode: null,
    body: null as unknown,
    headers: {},
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return payload;
    },
    setHeader(name: string, value: string) {
      res.headers[name] = value;
      return res;
    },
  };
  return res;
}

let failures = 0;
let passes = 0;

function check(name: string, condition: boolean, extra?: unknown) {
  if (condition) {
    passes++;
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : "");
  }
}

const VALID_JUDGMENT = {
  whatAmmaSees: "A gaming PC.",
  analysis: ["Costs too much.", "For gaming, alle?", "No study value."],
  financialDamage: "Significant.",
  ammasConcern: "Your marks.",
  relativeComparison: "Cousin is a doctor.",
  verdict: "REJECTED",
  verdictReason: "No.",
};

/** Install a mocked global fetch that pretends to be Groq. */
function mockGroq(response: { ok: boolean; status: number; body: unknown }) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  (globalThis as { fetch: unknown }).fetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(response.body), {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return calls;
}

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function run() {
  console.log("\n— Method & CORS —");
  {
    const res = makeRes();
    await handler({ method: "OPTIONS" }, res);
    check("OPTIONS returns 204", res.statusCode === 204, res.statusCode);
    check(
      "CORS headers set",
      res.headers["Access-Control-Allow-Origin"] === "*" &&
        res.headers["Access-Control-Allow-Methods"]?.includes("POST"),
      res.headers,
    );
  }
  {
    const res = makeRes();
    await handler({ method: "GET" }, res);
    check("GET returns 405", res.statusCode === 405, res.statusCode);
  }

  console.log("\n— Configuration —");
  {
    const res = makeRes();
    await handler({ method: "POST", body: { mode: "text", text: "hi" } }, res);
    check("missing GROQ_API_KEY → 500 JSON", res.statusCode === 500 && typeof res.body?.error === "string", {
      status: res.statusCode,
      body: res.body,
    });
  }

  // All remaining tests need a key present.
  process.env.GROQ_API_KEY = "test-key-not-real";

  console.log("\n— Request validation —");
  {
    const res = makeRes();
    await handler({ method: "POST", body: { mode: "nonsense" } }, res);
    check("bad mode rejected with 400", res.statusCode === 400, { status: res.statusCode, body: res.body });
  }
  {
    // String body that is not valid JSON → 400 via getBodyObject
    const res = makeRes();
    await handler({ method: "POST", body: "not-json-at-all" }, res);
    check("unparseable JSON string body → 400", res.statusCode === 400, { status: res.statusCode, body: res.body });
  }
  {
    // Streamed body (Vercel can hand us a raw stream) → parsed correctly
    const res = makeRes();
    const req = {
      method: "POST",
      on(ev: string, cb: (chunk: Buffer) => void) {
        if (ev === "data") cb(Buffer.from(JSON.stringify({ mode: "text", text: "streamed body test" })));
        if (ev === "end") queueMicrotask(() => {});
      },
      end() {},
    };
    // Simulate stream end after data
    let endCb: () => void = () => {};
    req.on = (ev: string, cb: (arg?: unknown) => void) => {
      if (ev === "data") cb(Buffer.from(JSON.stringify({ mode: "text", text: "streamed body test" })));
      if (ev === "end") {
        endCb = () => cb();
        queueMicrotask(endCb);
      }
    };
    const calls = mockGroq({ ok: true, status: 200, body: { choices: [{ message: { content: JSON.stringify(VALID_JUDGMENT) } }] } });
    await handler(req, res);
    check("streamed JSON body → parsed and judged (200)", res.statusCode === 200, { status: res.statusCode, body: res.body });
    check("groq called exactly once", calls.length === 1, calls.length);
  }
  {
    const res = makeRes();
    await handler({ method: "POST", body: { mode: "text", text: "   " } }, res);
    check("empty text → 400", res.statusCode === 400, { status: res.statusCode, body: res.body });
  }
  {
    const res = makeRes();
    await handler({ method: "POST", body: { mode: "image" } }, res);
    check("missing image → 400", res.statusCode === 400, { status: res.statusCode, body: res.body });
  }
  {
    const res = makeRes();
    await handler({ method: "POST", body: { mode: "image", image: "data:image/gif;base64,R0lGOD" } }, res);
    check("disallowed image type → 415", res.statusCode === 415, { status: res.statusCode, body: res.body });
  }
  {
    const res = makeRes();
    await handler({ method: "POST", body: { mode: "image", image: "garbage-not-a-data-url" } }, res);
    check("malformed image payload → 413", res.statusCode === 413, { status: res.statusCode, body: res.body });
  }

  console.log("\n— Groq success paths (mocked) —");
  {
    const calls = mockGroq({ ok: true, status: 200, body: { choices: [{ message: { content: JSON.stringify(VALID_JUDGMENT) } }] } });
    const res = makeRes();
    await handler({ method: "POST", body: { mode: "text", text: "I bought a gaming PC" } }, res);
    check("text judgment → 200 with judgment", res.statusCode === 200 && res.body?.judgment?.verdict === "REJECTED", {
      status: res.statusCode,
      body: res.body,
    });
    const sent = JSON.parse(String(calls[0]?.init?.body ?? "{}")) as { model: string; messages: Array<{ role: string }>; response_format?: { type: string } };
    check("text uses openai/gpt-oss-120b", sent.model === "openai/gpt-oss-120b", sent.model);
    check("text request has system + user roles", sent.messages?.[0]?.role === "system" && sent.messages?.[1]?.role === "user", sent.messages?.map((m) => m.role));
    check("text request uses json_object mode", sent.response_format?.type === "json_object", sent.response_format);
    check("groq URL is chat/completions", calls[0]?.url.includes("api.groq.com/openai/v1/chat/completions") === true, calls[0]?.url);
  }
  {
    const calls = mockGroq({ ok: true, status: 200, body: { choices: [{ message: { content: JSON.stringify(VALID_JUDGMENT) } }] } });
    const res = makeRes();
    await handler({ method: "POST", body: { mode: "image", image: TINY_PNG, text: "my room" } }, res);
    check("image judgment → 200 with judgment", res.statusCode === 200 && res.body?.judgment?.whatAmmaSees === "A gaming PC.", {
      status: res.statusCode,
      body: res.body,
    });
    const sent = JSON.parse(String(calls[0]?.init?.body ?? "{}")) as { model: string; messages: Array<{ role: string; content: unknown }>; response_format?: { type: string } };
    check("image uses vision model", sent.model === "qwen/qwen3.6-27b", sent.model);
    const userContent = sent.messages?.[1]?.content as Array<{ type: string }>;
    check("image message is multimodal", Array.isArray(userContent) && userContent.some((p) => p.type === "image_url") && userContent.some((p) => p.type === "text"), userContent?.map((p) => p.type));
    check("vision request uses json_object mode", sent.response_format?.type === "json_object", sent.response_format);
  }

  console.log("\n— Output normalization —");
  {
    // Model output wrapped in prose + fences, wrong verdict casing, only 2 analysis items.
    const sloppy = 'Here is your JSON:\n```json\n' + JSON.stringify({
      whatAmmaSees: "Something.",
      analysis: ["One.", "Two."],
      financialDamage: "Some.",
      ammasConcern: "Hmm.",
      relativeComparison: "Who knows.",
      verdict: "Totally Approve This!",
      verdictReason: "Fine.",
    }) + "\n```";
    mockGroq({ ok: true, status: 200, body: { choices: [{ message: { content: sloppy } }] } });
    const res = makeRes();
    await handler({ method: "POST", body: { mode: "text", text: "normalize me" } }, res);
    const j = res.body?.judgment;
    check("prose/fences stripped, JSON extracted", res.statusCode === 200, { status: res.statusCode, body: res.body });
    check("verdict normalized to APPROVED", j?.verdict === "APPROVED", j?.verdict);
    check("analysis padded to exactly 3", Array.isArray(j?.analysis) && j.analysis.length === 3, j?.analysis);
  }
  {
    mockGroq({ ok: true, status: 200, body: { choices: [{ message: { content: "Amma refuses to emit JSON today." } }] } });
    const res = makeRes();
    await handler({ method: "POST", body: { mode: "text", text: "malformed please" } }, res);
    check("no JSON in output → 502 with friendly error", res.statusCode === 502 && typeof res.body?.error === "string", {
      status: res.statusCode,
      body: res.body,
    });
  }

  console.log("\n— Groq failure mapping (mocked) —");
  for (const [groqStatus, expected] of [
    [401, 502],
    [404, 502],
    [429, 429],
    [400, 502],
  ] as Array<[number, number]>) {
    mockGroq({ ok: false, status: groqStatus, body: { error: { message: "groq says no" } } });
    const res = makeRes();
    await handler({ method: "POST", body: { mode: "text", text: `fail ${groqStatus}` } }, res);
    check(`groq ${groqStatus} → HTTP ${expected}`, res.statusCode === expected && typeof res.body?.error === "string", {
      groqStatus,
      got: res.statusCode,
      body: res.body,
    });
  }

  console.log(`\n${passes} passed, ${failures} failed`);
  if (failures > 0) process.exit(1);
}

run().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
