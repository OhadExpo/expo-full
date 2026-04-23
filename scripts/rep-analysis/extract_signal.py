"""
Run MediaPipe Pose Landmarker over the clip and dump per-frame joint angles
to a CSV. Uses the same `pose_landmarker_full` model the live detector uses,
same 3D world-landmark angles.
"""
import sys, os, json, math
import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python as mptasks
from mediapipe.tasks.python import vision

MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task'
MODEL_PATH = os.path.join(os.path.dirname(__file__), 'pose_landmarker_full.task')

if not os.path.exists(MODEL_PATH):
    import urllib.request
    print(f'downloading model to {MODEL_PATH}...')
    urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)

def angle_at(lms, ai, bi, ci):
    a, b, c = lms[ai], lms[bi], lms[ci]
    v1 = np.array([a.x - b.x, a.y - b.y, a.z - b.z])
    v2 = np.array([c.x - b.x, c.y - b.y, c.z - b.z])
    n1, n2 = np.linalg.norm(v1), np.linalg.norm(v2)
    if n1 == 0 or n2 == 0: return None
    cos = np.clip(np.dot(v1, v2) / (n1 * n2), -1.0, 1.0)
    return float(np.degrees(np.arccos(cos)))

ANGLE_DEFS = [
    ('L_SHO', 23, 11, 13),
    ('R_SHO', 24, 12, 14),
    ('L_ELB', 11, 13, 15),
    ('R_ELB', 12, 14, 16),
    ('L_HIP', 11, 23, 25),
    ('R_HIP', 12, 24, 26),
    ('L_KNE', 23, 25, 27),
    ('R_KNE', 24, 26, 28),
]

def main(video_path, out_csv):
    opts = vision.PoseLandmarkerOptions(
        base_options=mptasks.BaseOptions(model_asset_path=MODEL_PATH),
        running_mode=vision.RunningMode.VIDEO,
        num_poses=1,
    )
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print('could not open video', video_path); sys.exit(1)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    print(f'video: {total} frames @ {fps:.2f} fps = {total/fps:.2f}s')

    with vision.PoseLandmarker.create_from_options(opts) as lm, open(out_csv, 'w') as out:
        out.write('frame,t,' + ','.join(n for n, *_ in ANGLE_DEFS) + '\n')
        i = 0
        while True:
            ok, frame = cap.read()
            if not ok: break
            t_ms = int((i / fps) * 1000)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            result = lm.detect_for_video(mp_image, t_ms)
            row = [str(i), f'{i/fps:.3f}']
            wlms = result.pose_world_landmarks[0] if result.pose_world_landmarks else None
            for name, a, b, c in ANGLE_DEFS:
                v = angle_at(wlms, a, b, c) if wlms else None
                row.append('' if v is None else f'{v:.1f}')
            out.write(','.join(row) + '\n')
            i += 1
            if i % 60 == 0: print(f'  frame {i}/{total}')
    cap.release()
    print(f'wrote {out_csv}')

if __name__ == '__main__':
    video = sys.argv[1] if len(sys.argv) > 1 else 'sl-hip-thrust.MOV'
    out = sys.argv[2] if len(sys.argv) > 2 else video.rsplit('.', 1)[0] + '.csv'
    main(os.path.join(os.path.dirname(__file__), video), os.path.join(os.path.dirname(__file__), out))
