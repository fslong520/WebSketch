import os
path = os.path.expanduser("~/桌面/copaw/web-paint-zh/content/content.js")
with open(path, 'w') as f:
    f.write(open(os.path.expanduser("~/桌面/copaw/web-paint-zh/content/content_new.js")).read())
