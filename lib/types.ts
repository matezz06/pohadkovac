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
  /** short visual description written by the text model, reused in every scene prompt */
  visual?: string;
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
};

export type UsageEntry = {
  at: string;
  kind: "story" | "sheet" | "page" | "visual";
  model: string;
  inputTokens: number;
  outputTokens: number;
  images: number;
};

export type Location = { id: string; name: string; description: string };

export type TextLength = "short" | "medium" | "long";

export type Book = {
  id: string;
  createdAt: string;
  childName: string;
  childAge: number;
  styleId: string;
  customStyle?: string;
  theme: string;
  lesson?: string;
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
};
