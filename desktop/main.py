"""Native window launcher for the auto-tts desktop application.

The desktop build ships a frozen Python runtime and the built frontend, so this
module is the whole application: it starts the existing FastAPI app on a private
localhost port and shows it in a native window. Users need neither a terminal,
nor Node.js, nor a system Python.
"""

from __future__ import annotations

import os
import shutil
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path

APP_NAME = "auto-tts"
WINDOW_TITLE = "auto-tts"
HOST = "127.0.0.1"
READY_TIMEOUT_SECONDS = 30.0
WINDOW_WIDTH = 1200
WINDOW_HEIGHT = 820
WINDOW_MIN_SIZE = (900, 640)

# Actionable hints shown when the native webview backend cannot start, replacing
# a traceback with something a non-programmer can act on.
BACKEND_HINTS = {
    "win32": (
        "the WebView2 runtime is required.\n"
        "Install the Evergreen WebView2 Runtime from\n"
        "https://developer.microsoft.com/microsoft-edge/webview2/\n"
        "then start auto-tts again."
    ),
    "linux": (
        "the Qt WebEngine backend could not start.\n"
        "Reinstall auto-tts, or install the system Qt libraries\n"
        "(Debian/Ubuntu: libgl1 libegl1 libxkbcommon-x11-0)."
    ),
}


def is_frozen() -> bool:
    """True when running from a PyInstaller bundle."""
    return bool(getattr(sys, "frozen", False))


def resource_root() -> Path:
    """Directory holding bundled data such as `frontend/dist` at runtime."""
    if is_frozen():
        return Path(str(getattr(sys, "_MEIPASS")))
    return Path(__file__).resolve().parent.parent


def backend_dir() -> Path:
    """Directory that contains the `app` package (source checkout only)."""
    return resource_root() / "backend"


def user_data_dir() -> Path:
    """Per-user writable directory, deliberately shared with the `auto-tts` CLI.

    The CLI keeps its state in `<base>/auto-tts` and passes `<base>/auto-tts/data`
    as AUTO_TTS_DATA_DIR. Matching that layout lets the desktop build reuse the
    audio already synthesized from the command line, and vice versa.
    """
    if sys.platform == "win32":
        base = os.getenv("LOCALAPPDATA") or (Path.home() / "AppData" / "Local")
    else:
        base = os.getenv("XDG_DATA_HOME") or (Path.home() / ".local" / "share")
    return Path(base) / APP_NAME / "data"


def pick_free_port() -> int:
    """Ask the OS for an unused port so two instances never collide."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind((HOST, 0))
        return int(probe.getsockname()[1])


def wait_for_server(port: int, timeout: float = READY_TIMEOUT_SECONDS) -> bool:
    """Poll the port until the server accepts connections."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            probe.settimeout(0.5)
            if probe.connect_ex((HOST, port)) == 0:
                return True
        time.sleep(0.1)
    return False


def start_server(port: int):
    """Run uvicorn on a background thread and return the server for shutdown."""
    import uvicorn

    from app.main import app

    config = uvicorn.Config(app, host=HOST, port=port, log_level="warning")
    server = uvicorn.Server(config)
    # uvicorn skips signal-handler installation off the main thread, so serving
    # from a thread is safe while the main thread owns the GUI event loop.
    threading.Thread(target=server.run, name="uvicorn", daemon=True).start()
    return server


def _error_dialog_command(message: str) -> list[str] | None:
    """Return a command that shows `message` in a dialog, when one exists."""
    for program, args in (
        ("zenity", ["--error", "--title", WINDOW_TITLE, "--text", message]),
        ("kdialog", ["--error", message, "--title", WINDOW_TITLE]),
    ):
        if shutil.which(program):
            return [program, *args]
    return None


def report_error(message: str) -> None:
    """Surface a fatal error to the user, using a dialog whenever possible."""
    # A windowed bundle has no console, where PyInstaller sets stderr to None.
    if sys.stderr is not None:
        sys.stderr.write(f"{APP_NAME}: {message}\n")

    if sys.platform == "win32":
        try:
            import ctypes

            ctypes.windll.user32.MessageBoxW(0, message, WINDOW_TITLE, 0x10)
        except Exception:
            pass
        return

    command = _error_dialog_command(message)
    if command is not None:
        try:
            subprocess.run(command, check=False)
        except OSError:
            pass


def backend_hint() -> str:
    """Platform-specific advice for a webview backend that refused to start."""
    return BACKEND_HINTS.get("win32" if sys.platform == "win32" else "linux",
                             "the window backend could not start.")


def main() -> int:
    # config.py reads these variables at import time, so they must be set before
    # app.main is imported.
    root = resource_root()
    os.environ["AUTO_TTS_FRONTEND_DIST"] = str(root / "frontend" / "dist")
    os.environ["AUTO_TTS_DATA_DIR"] = str(user_data_dir())

    if not is_frozen():
        # From a checkout the `app` package lives outside the launcher directory.
        sys.path.insert(0, str(backend_dir()))

    port = pick_free_port()
    server = start_server(port)

    # Open the window only once the port answers, so the webview never races the
    # server and lands on a connection error.
    if not wait_for_server(port):
        server.should_exit = True
        report_error("the local server did not start in time. Restart auto-tts.")
        return 1

    try:
        import webview

        window = webview.create_window(
            WINDOW_TITLE,
            f"http://{HOST}:{port}/",
            width=WINDOW_WIDTH,
            height=WINDOW_HEIGHT,
            min_size=WINDOW_MIN_SIZE,
        )

        def on_closed() -> None:
            server.should_exit = True

        window.events.closed += on_closed

        # Linux uses the bundled Qt / QtWebEngine backend; Windows resolves to
        # the system EdgeChromium (WebView2) renderer on its own.
        if sys.platform.startswith("linux"):
            webview.start(gui="qt")
        else:
            webview.start()
    except Exception:
        report_error(backend_hint())
        return 1
    finally:
        server.should_exit = True

    return 0


if __name__ == "__main__":
    raise SystemExit(main())