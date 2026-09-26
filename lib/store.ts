import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import type { Book } from "./types";

export const DATA_DIR = path.join(process.cwd(), "data");
export const BOOKS_DIR = path.join(DATA_DIR, "books");

export function newId() {
  return crypto.randomBytes(6).toString("hex");
}

function safeId(id: string) {
  if (!/^[a-z0-9]+$/i.test(id)) throw new Error("Neplatné ID");
  return id;
}

export function bookDir(id: string) {
  return path.join(BOOKS_DIR, safeId(id));
}

export async function saveBook(book: Book) {
  const dir = bookDir(book.id);
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, "book.json.tmp");
  await fs.writeFile(tmp, JSON.stringify(book, null, 2));
  await fs.rename(tmp, path.join(dir, "book.json"));
}

export async function loadBook(id: string): Promise<Book | null> {
  try {
    const raw = await fs.readFile(path.join(bookDir(id), "book.json"), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Simple per-book lock so parallel requests don't overwrite each other's changes. */
const locks = new Map<string, Promise<unknown>>();
export async function updateBook(id: string, fn: (b: Book) => void | Promise<void>): Promise<Book> {
  const prev = locks.get(id) ?? Promise.resolve();
  const run = prev.catch(() => {}).then(async () => {
    const book = await loadBook(id);
    if (!book) throw new Error("Knížka nenalezena");
    await fn(book);
    await saveBook(book);
    return book;
  });
  locks.set(id, run);
  return run;
}

export async function listBooks(): Promise<Book[]> {
  try {
    const ids = await fs.readdir(BOOKS_DIR);
    const books = await Promise.all(ids.map((id) => loadBook(id)));
    return books
      .filter((b): b is Book => !!b)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export async function deleteBook(id: string) {
  await fs.rm(bookDir(id), { recursive: true, force: true });
}

export async function writeBookFile(id: string, name: string, data: Buffer) {
  const dir = bookDir(id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), data);
}

export async function readBookFile(id: string, name: string) {
  if (name.includes("/") || name.includes("\\") || name.startsWith(".")) throw new Error("Neplatný soubor");
  return fs.readFile(path.join(bookDir(id), name));
}

// ---- settings (model overrides) ----
export type Settings = { textModel?: string; imageModel?: string };
const SETTINGS = path.join(DATA_DIR, "settings.json");

export async function loadSettings(): Promise<Settings> {
  try {
    return JSON.parse(await fs.readFile(SETTINGS, "utf8"));
  } catch {
    return {};
  }
}
export async function saveSettings(s: Settings) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(SETTINGS, JSON.stringify(s, null, 2));
}
