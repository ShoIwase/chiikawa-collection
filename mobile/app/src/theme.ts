// frontend(Tailwind)の pink/gray パレットに合わせた色定義
export const colors = {
  pink50: "#fdf2f8",
  pink100: "#fce7f3",
  pink300: "#f9a8d4",
  pink400: "#f472b6",
  pink500: "#ec4899",
  pink600: "#db2777",
  gray100: "#f3f4f6",
  gray300: "#d1d5db",
  gray400: "#9ca3af",
  gray600: "#4b5563",
  gray700: "#374151",
  red500: "#ef4444",
  amber400: "#fbbf24",
  white: "#ffffff",
};

// キャラごとの色分け(frontendのタグ表示と同系統の配色)
export const characterColors: Record<string, { bg: string; text: string }> = {
  "ちいかわ": { bg: "#fce7f3", text: "#db2777" },
  "ハチワレ": { bg: "#dbeafe", text: "#2563eb" },
  "うさぎ": { bg: "#ffedd5", text: "#c2410c" },
};

export function characterColor(motif: string) {
  return characterColors[motif] ?? { bg: colors.gray100, text: colors.gray700 };
}
