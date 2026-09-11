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
 * longest edge <= TARGET_MAX_EDGE. Falls back to reading the file directly
 * if canvas encoding fails for any reason.
 */
export async function fileToDownscaledDataUrl(file: File): Promise<string> {
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

  const scale = Math.min(
    1,
    TARGET_MAX_EDGE / Math.max(img.naturalWidth || 1, img.naturalHeight || 1),
  );
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
      TARGET_JPEG_QUALITY,
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
  } catch {
    const err: AmmaSubmitError = {
      code: "NETWORK_ERROR",
      message: ammaErrorFromCode("NETWORK_ERROR"),
    };
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  const data = (await response.json().catch(() => null)) as {
    judgment?: AmmaJudgment;
    error?: string;
  } | null;

  if (!response.ok) {
    let code: AmmaSubmitErrorCode = "SERVER_ERROR";
    if (response.status === 429) code = "RATE_LIMIT";
    else if (response.status === 500 && data?.error?.includes("GROQ_API_KEY")) {
      code = "SERVER_NOT_CONFIGURED";
    }
    const err: AmmaSubmitError = {
      code,
      message: data?.error ?? ammaErrorFromCode(code),
    };
    throw err;
  }

  if (!data?.judgment) {
    const err: AmmaSubmitError = {
      code: "MALFORMED_RESPONSE",
      message: ammaErrorFromCode("MALFORMED_RESPONSE"),
    };
    throw err;
  }

  return data.judgment;
}
