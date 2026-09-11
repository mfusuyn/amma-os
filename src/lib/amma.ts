/**
 * AMMA OS — client-side helper for the judgment flow.
 *
 * Talks to /api/amma (the server holds GROQ_API_KEY; the browser never sees it).
 */

import type { AmmaJudgment } from "./ammaTypes";

export type { AmmaJudgment } from "./ammaTypes";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // reject files above 10 MB outright
const TARGET_MAX_EDGE = 1568; // px — longest edge sent to the vision model
const TARGET_JPEG_QUALITY = 0.85;
const REQUEST_TIMEOUT_MS = 45_000;

export type AmmaSubmitMode = "text" | "image";

export interface AmmaSubmission {
  mode: AmmaSubmitMode;
  text?: string;
  file?: File;
}

export type AmmaSubmitErrorCode =
  | "EMPTY_INPUT"
  | "INVALID_IMAGE"
  | "INVALID_IMAGE_TYPE"
  | "IMAGE_TOO_LARGE"
  | "SERVER_NOT_CONFIGURED"
  | "SERVER_ERROR"
  | "ENDPOINT_MISSING"
  | "MALFORMED_RESPONSE"
  | "RATE_LIMIT"
  | "NETWORK_ERROR";

export type AmmaSubmitError = { code: AmmaSubmitErrorCode; message: string };

export function ammaErrorFromCode(code: AmmaSubmitErrorCode): string {
  switch (code) {
    case "EMPTY_INPUT":
      return "Amma cannot judge an empty statement. Say what you did.";
    case "INVALID_IMAGE":
      return "Amma could not read that image. Try a different photo.";
    case "INVALID_IMAGE_TYPE":
      return "Amma accepts only JPEG, PNG, or WebP images.";
    case "IMAGE_TOO_LARGE":
      return "That image is too large. Try one under 4 MB.";
    case "SERVER_NOT_CONFIGURED":
      return "AMMA OS is offline: the judgment engine is not configured on the server.";
    case "SERVER_ERROR":
      return "AMMA OS hit an error while judging. Try again.";
    case "ENDPOINT_MISSING":
      return "AMMA OS cannot reach the judgment engine. The API endpoint is not deployed — redeploy and try again.";
    case "MALFORMED_RESPONSE":
      return "Amma's response was malformed. Even she is embarrassed. Try again.";
    case "RATE_LIMIT":
      return "Amma is judging too many people at once. Wait a moment and try again.";
    case "NETWORK_ERROR":
      return "AMMA OS lost the connection mid-judgment. Check your connection and try again.";
  }
  return "AMMA OS hit an unexpected error. Try again.";
}

/** Loose check that a file is a supported image (JPEG/PNG/WebP). */
export function isProbablyImage(file: File): boolean {
  const typeOk = file.type === "" || /^image\/(jpeg|png|webp)$/i.test(file.type);
  const nameOk = /\.(jpe?g|png|webp)$/i.test(file.name ?? "");
  return typeOk && (file.type !== "" || nameOk);
}

/** Returns an error message if the file is not a usable image, or null if it is OK. */
export function validateImageFile(file: File): string | null {
  if (!isProbablyImage(file)) return ammaErrorFromCode("INVALID_IMAGE_TYPE");
  if (file.size > MAX_FILE_BYTES) return ammaErrorFromCode("IMAGE_TOO_LARGE");
  if (file.size === 0) return ammaErrorFromCode("INVALID_IMAGE");
  return null;
}

/**
 * Read a File and downscale it to a JPEG data URL via canvas, keeping the
 * longest edge <= TARGET_MAX_EDGE. If the result is still too heavy for the
 * serverless body limit, re-encodes once at a smaller size/lower quality.
 */
export async function fileToDownscaledDataUrl(file: File): Promise<string> {
  const first = await encodeFileToJpegDataUrl(file, TARGET_MAX_EDGE, TARGET_JPEG_QUALITY);
  if (first.length <= 4_000_000) return first; // well under the server cap
  const second = await encodeFileToJpegDataUrl(file, 1024, 0.6);
  if (second.length > 5_500_000) {
    const err: AmmaSubmitError = {
      code: "IMAGE_TOO_LARGE",
      message: ammaErrorFromCode("IMAGE_TOO_LARGE"),
    };
    throw err;
  }
  return second;
}

async function encodeFileToJpegDataUrl(
  file: File,
  maxEdge: number,
  quality: number,
): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("read failed"));
    };
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("decode failed"));
    image.src = dataUrl;
  });

  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
  const width = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
  const height = Math.max(1, Math.round((img.naturalHeight || 1) * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");

  ctx.fillStyle = "#ffffff"; // flatten alpha for JPEG
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const encoded = await new Promise<string>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("encode failed"));
          return;
        }
        const blobReader = new FileReader();
        blobReader.onload = () => {
          if (typeof blobReader.result === "string") resolve(blobReader.result);
          else reject(new Error("encode failed"));
        };
        blobReader.onerror = () => reject(new Error("encode failed"));
        blobReader.readAsDataURL(blob);
      },
      "image/jpeg",
      quality,
    );
  });

  return encoded;
}

/** Submit a judgment request to /api/amma. Throws AmmaSubmitError on failure. */
export async function submitToAmma(
  submission: AmmaSubmission,
): Promise<AmmaJudgment> {
  const { mode, text, file } = submission;

  if (mode === "text" && !text?.trim()) {
    const err: AmmaSubmitError = {
      code: "EMPTY_INPUT",
      message: ammaErrorFromCode("EMPTY_INPUT"),
    };
    throw err;
  }
  if (mode === "image" && !file) {
    const err: AmmaSubmitError = {
      code: "INVALID_IMAGE",
      message: ammaErrorFromCode("INVALID_IMAGE"),
    };
    throw err;
  }

  let payload: Record<string, unknown>;
  try {
    payload =
      mode === "text"
        ? { mode, text: text!.trim() }
        : {
            mode,
            image: await fileToDownscaledDataUrl(file!),
            text: text?.trim() || undefined,
          };
  } catch {
    const err: AmmaSubmitError = {
      code: "INVALID_IMAGE",
      message: ammaErrorFromCode("INVALID_IMAGE"),
    };
    throw err;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch("/api/amma", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (fetchErr) {
    if (fetchErr instanceof DOMException && fetchErr.name === "AbortError") {
      console.error("[AMMA] /api/amma request timed out after", REQUEST_TIMEOUT_MS, "ms");
    } else {
      console.error("[AMMA] /api/amma network failure:", fetchErr);
    }
    const err: AmmaSubmitError = {
      code: "NETWORK_ERROR",
      message: ammaErrorFromCode("NETWORK_ERROR"),
    };
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  // Read as text first: a non-JSON response usually means the endpoint is not
  // deployed (Vercel returns an HTML 404 page) — worth reporting precisely.
  const rawText = await response.text().catch(() => "");
  type AmmaApiResponse = { judgment?: AmmaJudgment; error?: string; code?: string };
  let data: AmmaApiResponse | null = null;
  try {
    data = JSON.parse(rawText) as AmmaApiResponse;
  } catch {
    data = null;
  }

  if (!response.ok) {
    console.error("[AMMA] /api/amma HTTP", response.status, "body:", rawText.slice(0, 300));
    let code: AmmaSubmitErrorCode = "SERVER_ERROR";
    if (response.status === 429) code = "RATE_LIMIT";
    else if (response.status === 404 || data === null) code = "ENDPOINT_MISSING";
    else if (data?.code === "SERVER_NOT_CONFIGURED" || data?.error?.includes("GROQ_API_KEY")) {
      code = "SERVER_NOT_CONFIGURED";
    }
    const err: AmmaSubmitError = {
      code,
      message: data?.error ?? ammaErrorFromCode(code),
    };
    throw err;
  }

  if (!data?.judgment) {
    console.error("[AMMA] /api/amma returned 200 without a judgment:", rawText.slice(0, 300));
    const err: AmmaSubmitError = {
      code: "MALFORMED_RESPONSE",
      message: ammaErrorFromCode("MALFORMED_RESPONSE"),
    };
    throw err;
  }

  const j = data.judgment;
  if (
    typeof j.whatAmmaSees !== "string" ||
    !Array.isArray(j.analysis) ||
    (j.verdict !== "APPROVED" && j.verdict !== "REJECTED")
  ) {
    console.error("[AMMA] /api/amma judgment failed schema validation:", JSON.stringify(j).slice(0, 300));
    const err: AmmaSubmitError = {
      code: "MALFORMED_RESPONSE",
      message: ammaErrorFromCode("MALFORMED_RESPONSE"),
    };
    throw err;
  }

  return data.judgment;
}
