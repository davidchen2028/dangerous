"""客户端资源包清单：后室/大厅静态文件，不含服务端与超大模型。"""

from __future__ import annotations

from pathlib import Path
from typing import List

# 发版时递增，Service Worker 会换缓存名并重新下载。
CLIENT_PACK_VERSION = 13

_SKIP_HTML = {
    "backrooms-sandbox.html",
    "backrooms-sandbox.template.html",
    "moth-preview.html",
    "clump-preview.html",
    "partygoer-preview.html",
    "explosion-sfx-demo.html",
}

_SKIP_JS_SUFFIXES = (".test.mjs", ".ts")
_MAX_MODEL_BYTES = 3 * 1024 * 1024


def _posix(path: Path, root: Path) -> str:
    return path.relative_to(root).as_posix()


def list_client_pack_files(root: Path) -> List[str]:
    files: List[str] = []
    seen = set()

    def add(rel: str) -> None:
        if rel in seen:
            return
        full = root / rel
        if not full.is_file():
            return
        seen.add(rel)
        files.append(rel)

    for folder in ("js", "css", "audio"):
        base = root / folder
        if not base.is_dir():
            continue
        for path in sorted(base.rglob("*")):
            if not path.is_file():
                continue
            name = path.name
            if name.startswith("."):
                continue
            if folder == "js" and name.endswith(_SKIP_JS_SUFFIXES):
                continue
            add(_posix(path, root))

    img_br = root / "img" / "backrooms"
    if img_br.is_dir():
        for path in sorted(img_br.rglob("*")):
            if path.is_file() and not path.name.startswith("."):
                add(_posix(path, root))

    models = root / "models"
    if models.is_dir():
        for path in sorted(models.glob("*.glb")):
            if path.stat().st_size <= _MAX_MODEL_BYTES:
                add(_posix(path, root))

    for path in sorted(root.glob("backrooms*.html")):
        if path.name in _SKIP_HTML:
            continue
        add(path.name)

    add("author-showcase.html")
    add("index.html")
    files.sort()
    return files
