/**
 * Generování na pozadí: požadavek hned vrátí odpověď a prohlížeč jen sleduje průběh (book.job).
 * Zatím běží v procesu serveru – pro veřejný provoz nahradit frontou (např. Inngest, BullMQ).
 */
import { loadBook, updateBook } from "./store";
import type { Job } from "./types";

const running = new Set<string>();

export async function startJob(
  bookId: string,
  kind: Job["kind"],
  label: string,
  total: number,
  work: (tick: () => Promise<void>) => Promise<void>,
) {
  const book = await loadBook(bookId);
  if (!book) throw new Error("Knížka nenalezena");
  if (running.has(bookId)) throw new Error("Na knížce se právě pracuje, počkej na dokončení.");
  running.add(bookId);
  await updateBook(bookId, (b) => {
    b.job = { kind, label, done: 0, total, startedAt: new Date().toISOString() };
  });
  const tick = async () => {
    await updateBook(bookId, (b) => {
      if (b.job) b.job.done = Math.min(b.job.total, b.job.done + 1);
    });
  };
  // záměrně bez await – běží dál po odeslání odpovědi
  (async () => {
    try {
      await work(tick);
      await updateBook(bookId, (b) => {
        b.job = null;
      });
    } catch (e) {
      console.error(e);
      await updateBook(bookId, (b) => {
        if (b.job) b.job.error = e instanceof Error ? e.message : String(e);
      });
    } finally {
      running.delete(bookId);
    }
  })();
}

export const isRunning = (bookId: string) => running.has(bookId);
