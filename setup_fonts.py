import shutil, os
dst = os.path.join(os.path.expanduser('~'), 'Desktop', 'expo-full', 'public', 'fonts')
os.makedirs(dst, exist_ok=True)
# The font files need to be on the Windows filesystem
# Let me just create placeholder - the actual fonts will be served from index.html @font-face with CDN fallback
print(f"Font dir: {dst}")
print("Fonts will be loaded via @font-face in index.html")
