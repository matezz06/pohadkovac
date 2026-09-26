export type StylePreset = { id: string; label: string; prompt: string };

// Upravuj volně – "prompt" jde doslova do zadání pro ilustrace.
export const STYLES: StylePreset[] = [
  {
    id: "watercolor",
    label: "Akvarel (klasická knížka)",
    prompt:
      "soft watercolor children's book illustration, gentle pastel palette, visible paper texture, loose brush strokes, warm cozy light",
  },
  {
    id: "crayon",
    label: "Pastelky / dětská kresba",
    prompt:
      "colored pencil and crayon illustration, hand-drawn textured strokes, bright cheerful colors, simple shapes, naive charming style",
  },
  {
    id: "czech-classic",
    label: "Český večerníček (retro)",
    prompt:
      "vintage Central European children's book illustration from the 1970s, gouache, muted earthy colors, whimsical rounded characters, hand-painted",
  },
  {
    id: "3d-cartoon",
    label: "3D animák",
    prompt:
      "3D animated feature film style, soft global illumination, rounded friendly character design, expressive big eyes, vibrant colors",
  },
  {
    id: "paper-cut",
    label: "Papírová vystřihovánka",
    prompt:
      "layered paper cut-out collage illustration, textured craft paper, soft shadows between layers, simple bold shapes",
  },
  {
    id: "flat",
    label: "Moderní plochá ilustrace",
    prompt:
      "modern flat vector children's illustration, clean shapes, limited harmonious palette, subtle grain texture",
  },
];

export function stylePrompt(styleId: string, custom?: string) {
  if (styleId === "custom" && custom) return custom;
  return STYLES.find((s) => s.id === styleId)?.prompt ?? STYLES[0].prompt;
}
