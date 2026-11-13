import { sendMessage } from "@/app/actions";
import { dateTime, fileSize, money } from "@/lib/format";
import { BRIM_NOTICE, describePrintSpec, type PrintSpec } from "@/lib/print-options";
import type { FileRow, Message, Quote } from "@/lib/types";
import { SubmitButton } from "./ui";

export function ReferenceFiles({ files }: { files: FileRow[] }) {
  if (!files.length) return null;
  return (
    <ul className="flex flex-wrap gap-3">
      {files.map((f) => (
        <li key={f.id}>
          <a href={`/api/files/${f.id}`} target="_blank" className="block w-32 overflow-hidden rounded-xl border border-line bg-white text-xs hover:border-ink">
            {f.mime.startsWith("image/") && f.mime !== "image/heic" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/files/${f.id}`} alt={f.filename} className="h-24 w-full object-cover" />
            ) : (
              <span className="flex h-24 items-center justify-center bg-paper font-display text-lg font-bold uppercase">{f.filename.split(".").pop()}</span>
            )}
            <span className="block truncate px-2 pt-1.5 font-medium">{f.filename}</span>
            <span className="block px-2 pb-1.5 text-muted">{fileSize(f.size)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

export function PrintSpecCard({ spec }: { spec: PrintSpec }) {
  return (
    <div className="card-soft">
      <dl className="grid gap-x-6 gap-y-1.5 text-[15px] sm:grid-cols-2">
        {describePrintSpec(spec).map((row) => (
          <div key={row.label} className="flex justify-between gap-4 border-b border-line/60 py-1">
            <dt className="text-muted">{row.label}</dt>
            <dd className="text-right font-medium">{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-sm text-muted">{BRIM_NOTICE}</p>
    </div>
  );
}

export function QuoteCard({ quote, files, superseded, title }: { quote: Quote; files: FileRow[]; superseded?: boolean; title?: string }) {
  const mine = files.filter((f) => f.quote_id === quote.id);
  const video = mine.find((f) => f.kind === "turntable");
  const render = mine.find((f) => f.kind === "render");
  return (
    <div className={`overflow-hidden rounded-2xl border-2 border-ink bg-white ${superseded ? "opacity-60" : ""}`}>
      {(video || render) && (
        <div className={`grid gap-px bg-ink ${video && render ? "sm:grid-cols-2" : ""}`}>
          {video && (
            <figure className="bg-paper">
              <video src={`/api/files/${video.id}`} className="aspect-square w-full object-cover" autoPlay loop muted playsInline controls />
              <figcaption className="px-3 py-1.5 text-xs font-semibold text-muted">Turntable</figcaption>
            </figure>
          )}
          {render && (
            <figure className="bg-paper">
              <a href={`/api/files/${render.id}`} target="_blank">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/files/${render.id}`} alt="Render of the finished product" className="aspect-square w-full object-cover" />
              </a>
              <figcaption className="px-3 py-1.5 text-xs font-semibold text-muted">Finished-product render</figcaption>
            </figure>
          )}
        </div>
      )}
      <div className="border-t-2 border-ink p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-xl font-bold">{title ?? (superseded ? "Earlier quote" : "Your quote")}</h3>
          {quote.lead_time_days != null && <span className="text-sm text-muted">Est. {quote.lead_time_days} day{quote.lead_time_days === 1 ? "" : "s"} to make</span>}
        </div>
        {quote.print_total_cents != null && (
          <dl className="mt-3 space-y-1.5 text-[15px]">
            {quote.items.map((i, n) => (
              <div key={n} className="flex justify-between gap-4">
                <dt className="text-muted">{i.label}</dt>
                <dd className="tabular-nums">{money(i.amount_cents)}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-4 border-t border-line pt-2 text-lg font-bold">
              <dt>Printed by Squiggle</dt>
              <dd className="tabular-nums">{money(quote.print_total_cents)}</dd>
            </div>
          </dl>
        )}
        {quote.stl_price_cents != null && (
          <div className="mt-2 flex justify-between gap-4 text-[15px]">
            <span className="text-muted">{quote.print_total_cents != null ? "Or just the STL file" : "STL file"}</span>
            <span className="font-semibold tabular-nums">{money(quote.stl_price_cents)}</span>
          </div>
        )}
        {quote.print_total_cents != null && (
          <p className="mt-3 text-sm text-muted">
            Pickup in Houston: free
            {quote.delivery_cents != null && <> · Local delivery: {money(quote.delivery_cents)}</>}
            {quote.shipping_cents != null && <> · Shipping: {money(quote.shipping_cents)}</>}
          </p>
        )}
      </div>
    </div>
  );
}

export function Thread({ messages, quotes, files, viewer }: { messages: Message[]; quotes: Quote[]; files: FileRow[]; viewer: "customer" | "squiggle" }) {
  const latest = quotes.at(-1)?.id;
  return (
    <ol className="space-y-4">
      {messages.map((m) => {
        if (m.sender === "system") {
          return (
            <li key={m.id} className="text-center text-sm text-muted">
              <span className="rounded-full bg-ink/5 px-3 py-1">{m.body} · {dateTime(m.created_at)}</span>
            </li>
          );
        }
        const own = m.sender === viewer;
        const quote = m.quote_id ? quotes.find((q) => q.id === m.quote_id) : undefined;
        return (
          <li key={m.id} className={`flex flex-col ${own ? "items-end" : "items-start"}`}>
            <p className="mb-1 text-xs font-semibold text-muted">
              {m.sender === "squiggle" ? "Squiggle" : own ? "You" : "Customer"} · {dateTime(m.created_at)}
            </p>
            <div className={`max-w-[92%] space-y-3 ${quote ? "w-full sm:max-w-xl" : ""}`}>
              <p className={`rounded-2xl px-4 py-3 text-[15px] whitespace-pre-wrap ${own ? "rounded-tr-sm bg-sun/50" : "rounded-tl-sm border border-line bg-white"}`}>{m.body}</p>
              {quote && <QuoteCard quote={quote} files={files} superseded={quote.id !== latest} />}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function MessageForm({ requestId, placeholder }: { requestId: string; placeholder: string }) {
  return (
    <form action={sendMessage.bind(null, requestId)} className="flex items-end gap-2">
      <textarea name="body" required maxLength={4000} rows={2} className="input" placeholder={placeholder} aria-label="Message" />
      <SubmitButton className="btn shrink-0" pendingText="Sending…">Send</SubmitButton>
    </form>
  );
}
