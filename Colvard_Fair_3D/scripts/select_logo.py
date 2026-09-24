"""Pick the Colvard Sausages logo with a File Explorer dialog and copy it into assets/.

Usage: python scripts/select_logo.py
Then rebuild with: npm run build
"""

import datetime
import logging
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
LOGS = ROOT / "logs"
START_DIR = Path.home() / "Desktop"
ALLOWED = {".png", ".jpg", ".jpeg", ".svg"}


def setup_logging() -> Path:
    LOGS.mkdir(parents=True, exist_ok=True)
    stamp = datetime.datetime.now().strftime("%Y%m%d_%H%M")
    log_path = LOGS / f"select_logo_{stamp}.log"
    logging.basicConfig(
        level=logging.INFO,
        format="[%(asctime)s] %(levelname)s %(message)s",
        handlers=[logging.FileHandler(log_path, encoding="utf-8"), logging.StreamHandler(sys.stdout)],
    )
    return log_path


def choose_file() -> str:
    import tkinter as tk
    from tkinter import filedialog

    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    path = filedialog.askopenfilename(
        title="Choose the Colvard Sausages logo",
        initialdir=str(START_DIR if START_DIR.exists() else Path.home()),
        filetypes=[
            ("Logo images", "*.png *.jpg *.jpeg *.svg"),
            ("PNG", "*.png"),
            ("JPEG", "*.jpg *.jpeg"),
            ("SVG", "*.svg"),
        ],
    )
    root.destroy()
    return path


def main() -> int:
    log_path = setup_logging()
    logging.info("Logo picker started. Log file: %s", log_path)
    chosen = choose_file()
    if not chosen:
        logging.warning("No file chosen. Nothing copied.")
        return 1
    src = Path(chosen)
    logging.info("Original logo path: %s", chosen)
    ext = src.suffix.lower()
    if ext not in ALLOWED:
        logging.error("Unsupported file type %s. Use PNG, JPG or SVG.", ext)
        return 1
    ASSETS.mkdir(parents=True, exist_ok=True)
    for old in ASSETS.glob("logo.*"):
        logging.info("Removing previous logo copy: %s", old)
        old.unlink()
    dest = ASSETS / f"logo{'.jpg' if ext == '.jpeg' else ext}"
    shutil.copy2(src, dest)
    logging.info("Copied to %s (%d bytes)", dest, dest.stat().st_size)
    logging.info("Next step: npm run build, then node scripts/render.mjs --preview")
    return 0


if __name__ == "__main__":
    sys.exit(main())
