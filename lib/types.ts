export type Character = {
  id: string;
  name: string;
  /** e.g. "strejda", "náš pes", "hlavní hrdinka" */
  role: string;
  /** free text: personality, look, what they like */
  description: string;
  isHero: boolean;
  /** file names relative to book dir */
  photos: string[];
  /** stylized reference image generated from photos */
  sheet?: string;
  /** zákaznický režim: komentář ke kartě (lze jen jednou) */
  comment?: string;
  /** short visual description written by the text model, reused in every scene prompt */
  visual?: string;
  /** přesný popis oblečení/obojku podle KARTY postavy – na všech stranách musí být stejné */
  outfit?: string;
};

export type Page = {
  n: number;
  text: string;
  scene: string;
  characters: string[]; // character ids
  /** id of Book.locations – pages in the same place share background */
  location?: string;
  image?: string;
  imageVersions?: string[];
  /** zákaznický režim: komentáře z vlny úprav */
  textComment?: string;
  imageComment?: string;
  /** ilustrace neodpovídá aktuálním předlohám (změnila se karta, pozadí, scéna…) – je potřeba překreslit */
  stale?: boolean;
  /** co našla AI kontrola obrázku (česky) – prázdné = v pořádku */
  issue?: string;
  /** kdy proběhla poslední AI kontrola */
  checkedAt?: string;
};

export type UsageEntry = {
  at: string;
  kind: "story" | "sheet" | "page" | "visual";
  model: string;
  inputTokens: number;
  outputTokens: number;
  images: number;
};

export type Location = {
  id: string;
  name: string;
  description: string;
  /** prázdné pozadí místa (bez postav) – předloha prostředí pro všechny strany z tohoto místa */
  plate?: string;
};

export type PlaceCount = "1" | "2-3" | "4-5";

export type TextLength = "short" | "medium" | "long";

/** Zákaznický průběh: karty → (komentáře ke kartám) → knížka → (vlna úprav) → hotovo */
export type BookStatus = "cards" | "book" | "final";

export type Job = {
  kind: "cards" | "book" | "cardsRevision" | "revision";
  label: string;
  done: number;
  total: number;
  startedAt: string;
  error?: string;
};

export type Book = {
  id: string;
  createdAt: string;
  childName: string;
  childAge: number;
  styleId: string;
  customStyle?: string;
  theme: string;
  lesson?: string;
  /** kde se má pohádka odehrávat – přání rodiče (česky), příběh a prostředí z něj vycházejí */
  places?: string;
  /** kolik různých míst (prostředí) má pohádka mít – určuje se před psaním příběhu; bez hodnoty rozhodne AI */
  placeCount?: PlaceCount;
  pageCount: number;
  textLength?: TextLength;
  language: string;
  /** season, time of day, weather – same for the whole book */
  atmosphere?: string;
  locations?: Location[];
  title?: string;
  characters: Character[];
  pages: Page[];
  coverImage?: string;
  usage: UsageEntry[];
  /** zákaznický režim */
  customer?: boolean;
  packageId?: string;
  priceCzk?: number;
  status?: BookStatus;
  cardsRevisionUsed?: boolean;
  revisionUsed?: boolean;
  job?: Job | null;
  /** texty stran před hromadnou úpravou (např. převod do minulého času) – pro „Vrátit texty“ */
  textBackup?: { at: string; label: string; texts: Record<number, string> };
  /** nejdál odemčený krok studia: 1 postavy, 2 příběh, 3 prostředí, 4 ilustrace */
  stage?: number;
  /**
   * České překlady anglických zadání pro Gemini (vzhled, oblečení, scény, prostředí).
   * Klíč např. "c:<id>:visual", "p:<n>:scene", "l:<id>:description", "atmosphere".
   * en = anglický text, ke kterému překlad patří – když se anglický text změní, překlad je zastaralý.
   */
  cs?: Record<string, { en: string; cs: string }>;
};
