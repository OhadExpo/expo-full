// EXPO Brand Design System — from Brand Style Guide 2022
// Color Palette: #39BDFF (EXPO Blue) / #000000 / #FFFFFF
// Typography: Nord (English) / DM Sans (fallback)

export const FN = "'Nord', 'DM Sans', sans-serif";  // UI/labels/mono-style — Nord weight 500-700
export const FB = "'Nord', 'DM Sans', sans-serif";  // Body text — Nord weight 300-400
export const FH = "'Nord', 'DM Sans', sans-serif";   // Hebrew fallback

export const C = {
  // Surfaces — true black base per BSG
  bg: "#000000",
  sf: "#0a0a0c",
  sf2: "#111114",
  sf3: "#18181c",
  // Borders — subtle, almost invisible
  bd: "#1e1e24",
  bd2: "#2a2a32",
  // Text hierarchy
  tx: "#f0f0f4",
  tm: "#7a7a88",
  td: "#444450",
  // EXPO Blue — #39BDFF (official from BSG page 5)
  ac: "#39BDFF",
  acH: "#5FCDFF",
  acD: "rgba(57,189,255,0.10)",
  acM: "rgba(57,189,255,0.20)",
  // Functional colors (minimal use — brand is 3-color)
  rd: "#FF4757",
  rdD: "rgba(255,71,87,0.10)",
  gn: "#2ED573",
  gnD: "rgba(46,213,115,0.10)",
  or: "#FFA502",
  orD: "rgba(255,165,2,0.10)",
  pu: "#A855F7",
  puD: "rgba(168,85,247,0.10)",
};

export const uid = () => Math.random().toString(36).slice(2,10) + Date.now().toString(36);
export const ytId = u => { if(!u) return null; const m = u.match(/(?:v=|shorts\/)([^&?/]+)/); return m ? m[1] : null; };

// Cropped logos (black background removed)
export const EXPO_LOGO = "data:image/png;base64,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";
export const EXPO_LOGO_LG = "data:image/png;base64,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";
export const EXPO_ICON = EXPO_LOGO;
export const EXPO_ICON_LG = "data:image/png;base64,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";

export const CATEGORIES = ["Chest","Back","Shoulders","Arms","Core","Legs","Glutes","Full Body","Olympic","Cardio","Other"];
export const RESISTANCE_TYPES = ["Barbell","Dumbbell","Bodyweight","Machine","Cable","Band","Kettlebell","Medicine Ball","Landmine","TRX/Suspension","Other"];
export const BODY_POSITIONS = ["Standing","Seated","Supine","Prone","Kneeling","Half-Kneeling","Quadruped","Side-Lying","Hanging","Other"];
export const MOVEMENT_TYPES = ["Push","Pull","Row","Curl","Extend","Squat","Hinge","Lunge","Rotation","Anti-Rotation","Carry","Lateral Raise","Front Raise","Pullover","Throw","Slam","Toss","Jump","Isometric","Olympic Lift","Other"];
export const LATERALITY = ["Bilateral","Unilateral","Alternating"];
export const MOVEMENT_PATTERNS = ["Horizontal Push","Horizontal Pull","Vertical Push","Vertical Pull","Hip Hinge","Squat","Lunge","Carry/Loaded Locomotion","Rotation/Anti-Rotation","Isolation","Olympic"];
export const REQUIRED_PATTERNS = ["Horizontal Push","Horizontal Pull","Vertical Push","Vertical Pull","Hip Hinge","Squat","Lunge","Carry/Loaded Locomotion","Rotation/Anti-Rotation"];
export const TRAINING_FORMATS = ["In-Person Private","In-Person Couple","In-Person Group","Online","Hybrid"];
export const TRAINEE_STATUSES = ["Active","On Hold","Inactive","Trial","Archived"];
export const PACKAGE_TYPES = ["Single Session","8 Sessions","24 Sessions","Monthly","Custom"];
export const SUPERSET_LABELS = ["","A","B","C","D","E"];
export const PAYMENT_METHODS = ["Cash","Bank Transfer","Bit","PayBox","Credit Card","Other"];
export const PAYMENT_STATUSES = ["Paid","Pending","Overdue","Partial"];
