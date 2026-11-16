import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { db, UPLOAD_DIR } from "./db";
import { listFiles, type FileKind, type FileRow } from "./orders";

// Content type is decided by extension from this allow-list, never taken from the uploader.
const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  heic: "image/heic",
  tif: "image/tiff",
  tiff: "image/tiff",
  pdf: "application/pdf",
  dwg: "application/acad",
  dxf: "application/dxf",
};
const ALLOWED: Record<FileKind, string[]> = {
  reference: ["dwg", "dxf", "pdf", "png", "jpg", "jpeg", "webp", "heic", "tif", "tiff"],
  draft: ["png", "jpg", "jpeg", "webp", "tif", "tiff"],
  preview: ["jpg"],
  deliverable: ["pdf", "dwg", "dxf", "png", "jpg", "jpeg"],
};

export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_REFERENCE_FILES = 8;
export const REFERENCE_ACCEPT = ALLOWED.reference.map((e) => `.${e}`).join(",");
export const DRAFT_ACCEPT = ALLOWED.draft.map((e) => `.${e}`).join(",");
export const DELIVERABLE_ACCEPT = ALLOWED.deliverable.map((e) => `.${e}`).join(",");

export class UploadError extends Error {}

const ext = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

export function checkUpload(file: { name: string; size: number }, kind: FileKind) {
  if (!ALLOWED[kind].includes(ext(file.name))) {
    throw new UploadError(`"${file.name}" isn't a supported file type here (${ALLOWED[kind].join(", ")}).`);
  }
  if (file.size > MAX_FILE_BYTES) throw new UploadError(`"${file.name}" is larger than 50 MB.`);
  if (file.size === 0) throw new UploadError(`"${file.name}" is empty.`);
}

export async function saveBuffer(buf: Buffer, name: string, opts: { orderId: string; kind: FileKind }): Promise<FileRow> {
  checkUpload({ name, size: buf.length }, opts.kind);
  const id = crypto.randomUUID();
  await fs.promises.writeFile(path.join(UPLOAD_DIR, id), buf);
  const row: FileRow = {
    id,
    order_id: opts.orderId,
    kind: opts.kind,
    filename: path.basename(name).replace(/[^\w.\- ]+/g, "_").slice(0, 120),
    mime: TYPES[ext(name)],
    size: buf.length,
    created_at: Date.now(),
  };
  db()
    .prepare("INSERT INTO files (id, order_id, kind, filename, mime, size, created_at) VALUES (@id, @order_id, @kind, @filename, @mime, @size, @created_at)")
    .run(row);
  return row;
}

export const saveUpload = async (file: File, opts: { orderId: string; kind: FileKind }) =>
  saveBuffer(Buffer.from(await file.arrayBuffer()), file.name, opts);

export const filePath = (id: string) => path.join(UPLOAD_DIR, path.basename(id));

export function deleteFiles(rows: FileRow[]) {
  for (const f of rows) {
    db().prepare("DELETE FROM files WHERE id = ?").run(f.id);
    fs.rmSync(filePath(f.id), { force: true });
  }
}
export const deleteKind = (orderId: string, kind: FileKind) => deleteFiles(listFiles(orderId, kind));

/** Real File entries from a form field, ignoring the empty one browsers send when nothing is chosen. */
export const formFiles = (form: FormData, key: string) =>
  form.getAll(key).filter((v): v is File => typeof v !== "string" && v.size > 0);
