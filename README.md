# 📖 Pohádkovač

Personalizované pohádky pro děti: dítě je hlavní hrdina a postavy (strejda, psi, babička…) se kreslí podle fotek.
Text i ilustrace generuje Google Gemini, stačí jeden API klíč.

## Spuštění

Potřebuješ [Node.js 20+](https://nodejs.org).

```bash
npm install
cp .env.example .env.local      # a doplň GEMINI_API_KEY
npm run dev                     # http://localhost:3000
```

Klíč vytvoříš zdarma na <https://aistudio.google.com/apikey>. Generování obrázků ale obvykle vyžaduje zapnutou fakturaci
(billing) v Google Cloud projektu.

**Testovací režim bez API:** `npm run mock` spustí aplikaci se zástupnými obrázky a vzorovým příběhem.
Hodí se k ladění vzhledu a průběhu, nic se neplatí.

## Jak to funguje

1. **Nová pohádka:** zadáš postavy (jméno, kdo to je, povaha, 1–3 fotky), styl, téma a počet stran.
2. **Popis postav:** textový model popíše z fotek vzhled každé postavy (anglicky, dá se ručně upravit).
3. **Karty postav:** obrázkový model z fotek nakreslí stylizovanou předlohu každé postavy.
4. **Příběh:** textový model napíše pohádku po stranách. Ke každé straně připraví popis scény a seznam postav na obrázku.
5. **Ilustrace:** každá strana se kreslí podle scény a karet postav, které v ní vystupují. Díky tomu postavy vypadají
   na všech stranách stejně.
6. **Čtení / PDF:** stránka „Číst / tisk PDF“ zobrazí knížku. Přes Tisk → Uložit jako PDF z ní uděláš soubor
   A4 na šířku, připravený k tisku.

Všechno jde upravit ručně: texty stran, scény, postavy na obrázku i popisy vzhledu. Každý obrázek se dá
přegenerovat a mezi verzemi přepínat.

## Zákaznický režim (pro třetí strany)

- **/order**: objednávka s balíčkem (`lib/packages.ts`). Balíček pevně určuje počet stran, délku textu
  a max. počet postav a cenu. Fotka u každé postavy a souhlas se zpracováním jsou povinné.
- **/b/[id]**: průběh pro zákazníka. Server hlídá všechny limity:
  1. **Postavičky**: jedno kolo připomínek ke kartám postav, pak schválení.
  2. **Pohádka**: vygeneruje se celá. Následuje **jedna vlna úprav**: připomínky k textu nebo obrázku u libovolných stran,
     odešlou se najednou. Obrázky se *upravují* podle připomínky, nekreslí se znovu.
  3. **Hotovo**: knížka je uzamčená, zbývá čtení a PDF.
- Generování běží na pozadí serveru a stránka průběžně ukazuje stav.
- **/admin**: náklady na každou knížku v Kč a kontrola, že cena balíčku pokryje nejhorší případ.
  Ceník API a kurz jsou v `lib/pricing.ts`. Jde o odhad, proto ho porovnej s vyúčtováním Google Cloud.

Hlavní stránka `/` a `/books/[id]` jsou „studio“ pro provozovatele, kde je všechno povolené bez limitů.

## Kde ladit kvalitu

| Soubor | Co v něm je |
|---|---|
| `lib/prompts.ts` | **všechna zadání pro AI**, tady se ladí příběh i ilustrace |
| `lib/styles.ts` | předvolené styly ilustrací |
| `lib/pipeline.ts` | pořadí kroků, poměry stran obrázků, zmenšování fotek |
| `lib/gemini.ts` | volání Gemini API (REST), testovací režim |

Modely se dají přepnout v aplikaci v **Nastavení**, kde je i seznam modelů dostupných pro tvůj klíč.

## Data

Vše se ukládá lokálně do složky `data/` (je v `.gitignore`): fotky, vygenerované obrázky a `book.json`.
Smazáním pohádky v aplikaci se smažou i její fotky.

## Co dál (směr veřejná aplikace)

- přihlášení a úložiště (např. Supabase), nasazení na Vercel; studio a /admin jen pro provozovatele
- platby (Stripe), pevná cena za knížku
- GDPR: souhlas rodiče, automatické mazání fotek, zpracovatelská smlouva
- fronta úloh místo generování v procesu serveru (`lib/jobs.ts`)
- tisk knížky přes tiskové API
