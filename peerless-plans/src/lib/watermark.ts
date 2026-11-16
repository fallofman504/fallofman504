import "server-only";
import sharp from "sharp";

/**
 * Turns the full unchecked sheet into what a customer sees before paying:
 * the middle of the drawing only, at low resolution, under a heavy watermark.
 */
export async function makePreview(sheet: Buffer): Promise<Buffer> {
  const src = sharp(sheet, { limitInputPixels: 120_000_000 });
  const { width: W, height: H } = await src.metadata();
  if (!W || !H) throw new Error("That image could not be read.");
  const cw = Math.max(1, Math.round(W * 0.6));
  const ch = Math.max(1, Math.round(H * 0.6));
  const { data, info } = await src
    .flatten({ background: "#ffffff" })
    .extract({ left: Math.round((W - cw) / 2), top: Math.round((H - ch) / 2), width: cw, height: ch })
    .resize({ width: 900, withoutEnlargement: true })
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  // Hatch lines carry the watermark even on a machine with no fonts installed; the text sits on top of them.
  const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs>
      <pattern id="hatch" width="46" height="46" patternUnits="userSpaceOnUse" patternTransform="rotate(-24)">
        <line x1="0" y1="0" x2="46" y2="0" stroke="#c8371f" stroke-width="2" stroke-opacity="0.28"/>
      </pattern>
      <pattern id="words" width="330" height="92" patternUnits="userSpaceOnUse" patternTransform="rotate(-24)">
        <text x="0" y="30" font-family="DejaVu Sans, Arial, sans-serif" font-size="19" font-weight="700" fill="#c8371f" fill-opacity="0.62">PEERLESS PLANS · UNCHECKED DRAFT</text>
        <text x="120" y="76" font-family="DejaVu Sans, Arial, sans-serif" font-size="19" font-weight="700" fill="#c8371f" fill-opacity="0.62">PREVIEW ONLY · NOT FOR USE</text>
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#hatch)"/>
    <rect width="100%" height="100%" fill="url(#words)"/>
  </svg>`;
  return sharp(data).composite([{ input: Buffer.from(overlay) }]).jpeg({ quality: 55 }).toBuffer();
}
