import crypto from "node:crypto";

/**
 * Private preview: when SITE_PASSCODE is set, the whole site sits behind a passcode screen.
 * Remove the setting (or leave it blank) to open the site to everyone.
 */
export const PREVIEW_COOKIE = "sq_preview";

export function previewPasscode(): string | null {
  return process.env.SITE_PASSCODE?.trim() || null;
}

/** What the browser holds after entering the passcode. Changing the passcode signs everyone out of the preview. */
export function previewToken(passcode: string): string {
  return crypto.createHash("sha256").update(`squiggle-preview:${passcode}`).digest("hex");
}
