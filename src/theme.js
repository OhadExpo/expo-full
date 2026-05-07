// EXPO Brand Design System — from Brand Style Guide 2022
// Color Palette: #39BDFF (EXPO Blue) / #000000 / #FFFFFF
// Typography: Nord (English) / DM Sans (fallback)

export const FN = "'Nord', 'Heebo', 'DM Sans', sans-serif";  // UI/labels/mono-style — Nord weight 500-700
export const FB = "'Nord', 'Heebo', 'DM Sans', sans-serif";  // Body text — Nord weight 300-400
export const FH = "'Heebo', 'DM Sans', sans-serif";           // Explicit Hebrew-first contexts

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
