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

- přihlášení a úložiště (např. Supabase), nasazení na Vercel
- platby (Stripe), pevná cena za knížku
- GDPR: souhlas rodiče, automatické mazání fotek, zpracovatelská smlouva
- fronta úloh místo generování přímo v požadavku
- tisk knížky přes tiskové API
