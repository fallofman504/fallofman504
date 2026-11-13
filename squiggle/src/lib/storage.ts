import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { db, UPLOAD_DIR } from "./db";
import type { FileKind, FileRow } from "./types";

// Content type is decided by extension from this allow-list, never taken from the uploader.
const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  pdf: "application/pdf",
  mp4: "video/mp4",
  webm: "video/webm",
  stl: "model/stl",
  obj: "model/obj",
  "3mf": "model/3mf",
  step: "model/step",
  stp: "model/step",
  glb: "model/gltf-binary",
  ply: "application/octet-stream",
};

const ALLOWED: Record<FileKind, string[]> = {
  reference: ["png", "jpg", "jpeg", "webp", "gif", "heic", "pdf", "stl", "obj", "3mf", "step", "stp", "glb", "ply"],
  turntable: ["mp4", "webm"],
  render: ["png", "jpg", "jpeg", "webp"],
  model: ["stl", "3mf", "obj"],
};

export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_REFERENCE_FILES = 8;
export const REFERENCE_ACCEPT = ALLOWED.reference.map((e) => `.${e}`).join(",");

export class UploadError extends Error {}

const ext = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

export function checkUpload(file: File, kind: FileKind) {
  if (!ALLOWED[kind].includes(ext(file.name))) {
    throw new UploadError(`"${file.name}" isn't a supported ${kind} file (${ALLOWED[kind].join(", ")}).`);
  }
  if (file.size > MAX_FILE_BYTES) throw new UploadError(`"${file.name}" is larger than 50 MB.`);
  if (file.size === 0) throw new UploadError(`"${file.name}" is empty.`);
}

export async function saveUpload(file: File, opts: { requestId: string; kind: FileKind; quoteId?: string }): Promise<FileRow> {
  checkUpload(file, opts.kind);
  const id = crypto.randomUUID();
  await fs.promises.writeFile(path.join(UPLOAD_DIR, id), Buffer.from(await file.arrayBuffer()));
  const row: FileRow = {
    id,
    request_id: opts.requestId,
    quote_id: opts.quoteId ?? null,
    kind: opts.kind,
    filename: path.basename(file.name).replace(/[^\w.\- ]+/g, "_").slice(0, 120),
    mime: TYPES[ext(file.name)],
    size: file.size,
    created_at: Date.now(),
  };
  db()
    .prepare(
      `INSERT INTO files (id, request_id, quote_id, kind, filename, mime, size, created_at)
       VALUES (@id, @request_id, @quote_id, @kind, @filename, @mime, @size, @created_at)`,
    )
    .run(row);
  return row;
}

export function filePath(id: string): string {
  return path.join(UPLOAD_DIR, path.basename(id));
}
