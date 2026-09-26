import Link from "next/link";
import Header from "@/components/Header";
import { listBooks } from "@/lib/store";
import { costCzk, maxCostCzk, USD_CZK } from "@/lib/pricing";
import { PACKAGES, getPackage } from "@/lib/packages";
import { models } from "@/lib/gemini";

export const dynamic = "force-dynamic";

/** Přehled pro provozovatele: náklady na knížky a rezerva balíčků. */
export default async function Admin() {
  const books = await listBooks();
  const { image } = await models();
  const rows = books.map((b) => ({ b, cost: costCzk(b.usage), pkg: getPackage(b.packageId) }));
  const total = rows.reduce((s, r) => s + r.cost, 0);
  const revenue = rows.reduce((s, r) => s + (r.b.priceCzk ?? 0), 0);
  const fmt = (n: number) => n.toLocaleString("cs-CZ", { maximumFractionDigits: 1 });

  return (
    <main className="wrap">
      <Header />
      <h2 style={{ marginTop: 0 }}>Balíčky – kontrola rezervy</h2>
      <p className="muted">Nejhorší případ = všechny karty postav i strany přegenerované v jedné vlně úprav. Kurz {USD_CZK} Kč/USD, model {image}. Ceník uprav v <code>lib/pricing.ts</code>, balíčky v <code>lib/packages.ts</code>.</p>
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="tbl">
          <thead><tr><th>Balíček</th><th>Cena</th><th>Max. náklad</th><th>Min. marže</th></tr></thead>
          <tbody>
            {PACKAGES.map((p) => {
              const max = maxCostCzk(p, image);
              return <tr key={p.id}><td>{p.label}</td><td>{p.priceCzk} Kč</td><td>{fmt(max)} Kč</td><td>{fmt(p.priceCzk - max)} Kč ({Math.round((1 - max / p.priceCzk) * 100)} %)</td></tr>;
            })}
          </tbody>
        </table>
      </div>

      <h2>Knížky</h2>
      <p className="muted">Celkem náklady ≈ {fmt(total)} Kč{revenue ? ` · tržby (bez plateb, jen ceník) ${fmt(revenue)} Kč` : ""}</p>
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="tbl">
          <thead><tr><th>Knížka</th><th>Typ</th><th>Obrázků</th><th>Náklad</th><th>Cena</th><th>Marže</th></tr></thead>
          <tbody>
            {rows.map(({ b, cost, pkg }) => (
              <tr key={b.id}>
                <td><Link href={b.customer ? `/b/${b.id}` : `/books/${b.id}`}>{b.title ?? b.childName}</Link><br /><span className="muted">{new Date(b.createdAt).toLocaleString("cs-CZ")}</span></td>
                <td>{b.customer ? `zákazník – ${pkg?.id ?? "?"} (${b.status})` : "studio"}</td>
                <td>{b.usage.reduce((s, u) => s + u.images, 0)}</td>
                <td>{fmt(cost)} Kč</td>
                <td>{b.priceCzk ? `${b.priceCzk} Kč` : "–"}</td>
                <td>{b.priceCzk ? `${fmt(b.priceCzk - cost)} Kč` : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
