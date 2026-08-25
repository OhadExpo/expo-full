# Do the name, the video and the notes agree?

Ohad: "go over every single exercise in every single block, any day, any row… make sure the note matches the url and both match the exercise name."

This does not judge the text. It uses the library as a dictionary and asks a factual question: does this row's video (or its notes) belong to a DIFFERENT library exercise than its name does? Anything a clip or cue block shares with several exercises is ambiguous and never flagged, and pure phrasing differences ("Walking DB Lunge" vs "DB Walking Lunge") are excluded by token overlap.

## Plan rows
```
rows examined: 4240 (videos 711, notes 3440)

    87  row title disagrees with the exercise its id points at
     3  VIDEO is another exercise's clip
    16  NOTES are another exercise's cues
     3  video and notes describe DIFFERENT exercises
     0  exerciseId is not in the library
     0  row has neither a title nor an id
   109  TOTAL

--- row title disagrees with the exercise its id points at (87) ---
  איילת קזצב / Block #15 / Day 2 / Seated Cable Face-Pull
```

### The video and the notes describe different exercises (3)

- רון יונקר / Block #3 - UNI INT & BI VOL (MA / Day 3 - S-SSC, UNI Pull INT, BI Push VOL / DB SLDL — video: DB Single Leg Deadlift — notes: DB SLDL
- רועי הצבי / Block #3 - Strength II / Day 3 - / DB SLDL — video: DB Single Leg Deadlift — notes: DB SLDL
- רועי הצבי / Block #25 / Day B / Hollow-POS Clams — video: Hollow-POS Clams — notes: DB AB's Sit-Up + Leg Raise (Clam)

### The NOTES are another exercise's cues (16)

- רועי סולומון / Block #1 / day c / Wide-Grip Deficit Push-Up — notes are the library cues for: Single Leg Hip Thrust
- Diego Day / Block #1 - UNI STR + BI GPP / Thursday - Upper VOL + Lower UNI / Wide-Grip Deficit Push-Up — notes are the library cues for: Single Leg Hip Thrust
- רון יונקר / Block #2 - UNI STR + BI GPP (ME / Day 2 / Wide-Grip Deficit Push-Up — notes are the library cues for: Single Leg Hip Thrust
- עמית יהודאי / Block #18 / Day 2 / BB Close-Grip Bench Press — notes are the library cues for: Seated Arnold DB OHP
- יובי / Block #1 / day b / Wide-Grip Deficit Push-Up — notes are the library cues for: Single Leg Hip Thrust
- רועי הצבי / Block #5 - UNI STR + BI GPP / Day 2 / Wide-Grip Deficit Push-Up — notes are the library cues for: Single Leg Hip Thrust
- עומר שדה / Block #8 / Day C / ATH-POS SA DB Row — notes are the library cues for: SA Cable Pulldown
- נדבר בלצ'ר / Block #4 / Day A / Declined-Laying DB Pullover — notes are the library cues for: Wide-Grip Pronated Pulldown
- Daeshon Francis / Block #1 / Game Day -1/-2 (BW/Mobility) / Wide-Grip Deficit Push-Up — notes are the library cues for: Single Leg Hip Thrust
- Frederic Bourdillon / Block #1 / Game Day -1/-2 (BW/Mobility) / Wide-Grip Deficit Push-Up — notes are the library cues for: Single Leg Hip Thrust
- רועי הצבי / Block #25 / Day B / Hollow-POS Clams — notes are the library cues for: DB AB's Sit-Up + Leg Raise (Clam)
- אוהד / Block#7 - GPP I (MED) / Day 3 - S-SSC & BI Pull / Wide-Grip Deficit Push-Up — notes are the library cues for: Single Leg Hip Thrust
- אמרי בילט / Block #1 / day c / Wide-Grip Deficit Push-Up — notes are the library cues for: Single Leg Hip Thrust
- עומר שדה / Block #9 / Day 2 / BB Close-Grip Bench Press — notes are the library cues for: Seated Arnold DB OHP
- נדבר בלצ'ר / Block #2 / Game Day -1 (BW/Mobility) / Wide-Grip Deficit Push-Up — notes are the library cues for: Single Leg Hip Thrust
- יואב שמרי / Block #5 / Day b / ATH-POS SA DB Row — notes are the library cues for: SA Cable Pulldown

### The VIDEO is another exercise's clip (3)

- רון יונקר / Block #3 - UNI INT & BI VOL (MA / Day 3 - S-SSC, UNI Pull INT, BI Push VOL / DB SLDL — video is the library clip for: DB Single Leg Deadlift
- רועי הצבי / Block #3 - Strength II / Day 3 - / DB SLDL — video is the library clip for: DB Single Leg Deadlift
- יובל ברקו / Phase 8 / Day 3 (כפר) - Lower VOL + Arms / Pushup — video is the library clip for: Pushups

## Library
```
library: 1326 exercises
  cue blocks shared by 2+ entries : 86  -> unrelated-name pairs: 29
  clips shared by 2+ entries      : 175  -> unrelated-name pairs: 32

=== shared CUE blocks spanning unrelated exercises: 6 groups ===
     7 exercises share one cue block
       text: זווית של 15 20 מעלות עם החזה כלפי הרצפה יותר מהסרטון תמשוך מהמרפק
       e.g.: חתירה ואז שכיבות סמיכה | הרחקת כתפיים עם משקולות בישי | סיבוב עם היד בצד של הברך | לעמוד על רגל אחת, ברך למעלה,
     5 exercises share one cue block
       text: תרים את הרגל האחורית וקפל את כף הרגל לישבן ירידה למטה ואחורה נגיעה עם 
       e.g.: BW Floating-RFSS | BW Hand-Supported Shrimp Squ | Floating-Heel DB REFSS | DB Floating-RFSS
     3 exercises share one cue block
       text: קפיצה באלכסון שימוש במרפקים פלג גוף עליון שימוש בברך פלג גוף תחתון נחי
       e.g.: Lateral Bound to Stick | Wall-Supported A-Switch | Lateral Jump to Stick
     2 exercises share one cue block
       text: טווח תנועה מלא ראש בין הידיים בשיא ההרפייה ומרפקים ליד האוזניים תתחיל 
       e.g.: Chin-Up | Wide-grip pulldown - LAT mov
     2 exercises share one cue block
       text: כל חזרה בנפרד מתח מקסימלי לפני שמנתקים לנעול הכל למעלה
       e.g.: BB Deadlift | BB DL
     2 exercises share one cue block
       text: גב ישר טווח תנועה מלא אם אפשר להחזיק ב mid position
       e.g.: Pushups | Lying Rear Delt Raise

=== shared CLIPS spanning unrelated exercises: 16 groups ===
     6x  Chin-Up | Weighted Chinup | Chinups | Floor Press
     4x  DB SL Depth Drop | Weighted SL Snap-Down | SL Depth Drop | Weighted SL Depth Drop
     4x  Depth-Drop To VERT Jump | Depth Landing to Box Landi | Depth Landing to Box Landi | Drop Jump
     3x  Floor Laying DB Pullover ( | Dead-Bug POS DB Pullover | Dead-Bug POS DB Pullover w
     3x  GHD ISO ABs Sit-Up | Hollow Hold w Locked Feet | Hollow Hold w Locked Feet 
     3x  SL Hip-Bridge | ISO Leg Extension | Band-Resisted Elevated SL 
     3x  Super Set: | Declined Laying DB Pullove | Declined DB Pullover
     2x  BB Deficit Jefferson DL | Seated BB OHP

full report: C:/Users/ADMINI~1/AppData/Local/Temp/claude/C--Users-Administrator-Desktop-expo-full/1b998d45-0533-4d88-921c-50467a82acaf/scratchpad/libcue.json

```

## Not auto-fixed, deliberately

Cues are Ohad's writing. Rewriting them is his call, not a script's — so this reports and does not touch them.
