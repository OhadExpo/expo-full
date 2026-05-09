// EXPO Brand Design System — from Brand Style Guide 2022
// Color Palette: #39BDFF (EXPO Blue) / #000000 / #FFFFFF
// Typography: Nord (English) / DM Sans (fallback)

export const FN = "'Nord', 'Heebo', 'DM Sans', sans-serif";  // UI/labels/mono-style — Nord weight 500-700
export const FB = "'Nord', 'Heebo', 'DM Sans', sans-serif";  // Body text — Nord weight 300-400
export const FH = "'Heebo', 'DM Sans', sans-serif";           // Explicit Hebrew-first contexts

// All values resolve to CSS custom properties defined in src/themes.css.
// Toggle modes by setting `data-theme="light"` or `"dark"` on <html>.
// The data-theme attribute is set synchronously by an inline script in
// index.html before paint, so there is no flash on load.
export const C = {
  // Surfaces
  bg: "var(--c-bg)",
  sf: "var(--c-sf)",
  sf2: "var(--c-sf2)",
  sf3: "var(--c-sf3)",
  // Borders
  bd: "var(--c-bd)",
  bd2: "var(--c-bd2)",
  // Text hierarchy
  tx: "var(--c-tx)",
  tm: "var(--c-tm)",
  td: "var(--c-td)",
  // EXPO Blue + accent washes (alpha values are theme-agnostic — same hex in both modes)
  ac: "var(--c-ac)",
  acH: "var(--c-acH)",
  acD: "rgba(57,189,255,0.10)",
  acM: "rgba(57,189,255,0.20)",
  ac4D: "rgba(57,189,255,0.30)",
  acSurface: "var(--c-acSurface)",
  acOnSurface: "var(--c-acOnSurface)",
  // Functional
  rd: "var(--c-rd)",
  rdD: "var(--c-rdD)",
  gn: "var(--c-gn)",
  gnD: "var(--c-gnD)",
  or: "var(--c-or)",
  orD: "var(--c-orD)",
  pu: "var(--c-pu)",
  puD: "var(--c-puD)",
  // Theme-agnostic semantic tokens
  scrim: "var(--c-scrim)",       // modal backdrop dim (heavier in dark, lighter in light)
  videoBg: "#000000",             // video letterbox (always black — cinema convention)
  shadow: "var(--c-shadow)",     // drop-shadow color baseline
};

export const uid = () => Math.random().toString(36).slice(2,10) + Date.now().toString(36);
export const ytId = u => { if(!u) return null; const m = u.match(/(?:v=|shorts\/)([^&?/]+)/); return m ? m[1] : null; };

// Cropped logos (black background removed)
export const EXPO_LOGO = "/logos/expo-logo.png";
export const EXPO_LOGO_LG = "/logos/expo-logo-lg.png";
export const EXPO_ICON = EXPO_LOGO;
export const EXPO_LOGO_NAV = "/logos/expo-logo-nav.png";
export const EXPO_ICON_LG = "/logos/expo-icon-lg.png";

export const CATEGORIES = ["Chest","Back","Shoulders","Arms","Core","Legs","Glutes","Full Body","Olympic","Cardio","Other"];
export const RESISTANCE_TYPES = ["Barbell","Dumbbell","Bodyweight","Machine","Cable","Band","Kettlebell","Medicine Ball","Landmine","TRX/Suspension","Other"];
export const BODY_POSITIONS = ["Standing","Seated","Supine","Prone","Kneeling","Half-Kneeling","Quadruped","Side-Lying","Hanging","Other"];
export const MOVEMENT_TYPES = ["Push","Pull","Row","Curl","Extend","Squat","Hinge","Lunge","Rotation","Anti-Rotation","Carry","Lateral Raise","Front Raise","Pullover","Throw","Slam","Toss","Jump","Isometric","Olympic Lift","Other"];
export const LATERALITY = ["Bilateral","Unilateral","Alternating"];
export const MOVEMENT_PATTERNS = ["Horizontal Push","Horizontal Pull","Vertical Push","Vertical Pull","Hip Hinge","Squat","Lunge","Carry/Loaded Locomotion","Rotation/Anti-Rotation","Isolation","Olympic"];
export const REQUIRED_PATTERNS = ["Horizontal Push","Horizontal Pull","Vertical Push","Vertical Pull","Hip Hinge","Squat","Lunge","Carry/Loaded Locomotion","Rotation/Anti-Rotation"];
export const TRAINING_FORMATS = ["Gym, Single","Gym, Couple","Gym, Group","Online Client","Hybrid"];
export const TRAINEE_STATUSES = ["Active","On Hold","Inactive","Trial","Archived"];
export const PACKAGE_TYPES = ["Single Session","8 Sessions","24 Sessions","Monthly","Custom"];
export const SUPERSET_LABELS = ["","A","B","C","D","E"];
export const PAYMENT_METHODS = ["Cash","Bank Transfer","Bit","PayBox","Credit Card","Other"];
export const PAYMENT_STATUSES = ["Paid","Pending","Overdue","Partial"];
