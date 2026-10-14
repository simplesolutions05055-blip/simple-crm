/* graphics through the OpenAI Images API. Shared between the server route and the screens. */
export const G_MODELS: [string, string][] = [
  ["gpt-image-2.5-sunburst", "המתקדם ביותר (איטי יותר)"],
  ["gpt-image-2.5-flare", "מהיר"],
];
/* every side divisible by 16, as the API requires */
export const G_SIZES: [string, string][] = [
  ["1088x1360", "פוסט לאינסטגרם 4:5"],
  ["1024x1024", "ריבוע 1:1"],
  ["1152x2048", "סטורי / ריל 9:16"],
  ["1536x1024", "רוחבי (פייסבוק, מודעה) 3:2"],
];
export const G_QUALITY: [string, string][] = [["high", "גבוהה"], ["medium", "בינונית"], ["low", "טיוטה מהירה"]];
