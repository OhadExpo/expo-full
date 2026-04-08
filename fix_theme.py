import sys
path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find the FIRST occurrence of CATEGORIES and keep everything before it
# Then append the taxonomy block ONCE with Archived added
cut = None
for i, line in enumerate(lines):
    if 'export const CATEGORIES' in line:
        cut = i
        break

if cut:
    lines = lines[:cut]

# Add the taxonomy block once with Archived
taxonomy = '''
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
'''

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(lines)
    f.write(taxonomy)

print("Fixed")
