# PyInstaller build description for the auto-tts desktop application.
#
# Build from the repository root:
#   pyinstaller desktop/auto-tts.spec --noconfirm
# or through the cross-platform wrapper: node desktop/build.mjs

from pathlib import Path

from PyInstaller.utils.hooks import collect_submodules

ROOT = Path(SPECPATH).resolve().parent
BACKEND = ROOT / "backend"
FRONTEND_DIST = ROOT / "frontend" / "dist"

# uvicorn loads its loop and protocol implementations dynamically, so static
# analysis cannot see them.
hiddenimports = collect_submodules("uvicorn")

# pywebview ships backends for every platform; PyInstaller would otherwise pull
# in all of them. The Qt backend (PyQt6, used on Linux) and the system renderer
# (Windows) are the ones kept, so the other bindings are dropped.
excludes = [
    "PyQt5",
    "PySide2",
    "PySide6",
    "tkinter",
    "test",
    "unittest",
]

a = Analysis(
    [str(ROOT / "desktop" / "main.py")],
    pathex=[str(BACKEND)],
    binaries=[],
    datas=[(str(FRONTEND_DIST), "frontend/dist")],
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=excludes,
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="auto-tts",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name="auto-tts",
)