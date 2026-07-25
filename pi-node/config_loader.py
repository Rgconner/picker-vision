"""Configuration loader for the Picker Vision Pi node.

Priority order (highest wins):
  1. Environment variables
  2. Config file  (~/.picker-vision.conf  or  $PICKER_CONFIG path)
  3. Built-in defaults

Config file format (simple KEY=VALUE, lines starting with # are ignored):

    # ~/.picker-vision.conf
    SERVER_URL=http://192.168.1.100:8000
    PICKER_ID=picker-1
    FRAME_WIDTH=640
    FRAME_HEIGHT=480
    FRAME_FPS=15
    MJPEG_QUALITY=80

Run this file directly to print the active configuration and exit:
    python config_loader.py
"""

import os
import sys
from pathlib import Path

# ── Defaults ──────────────────────────────────────────────────────────────────

DEFAULTS: dict[str, str] = {
    "SERVER_URL":              "",          # empty = must be set by user
    "PICKER_ID":               "picker-1",
    "CAMERA_INDEX":            "-1",        # -1 = auto-detect
    "FRAME_WIDTH":             "640",
    "FRAME_HEIGHT":            "480",
    "FRAME_FPS":               "15",
    "MJPEG_QUALITY":           "80",
    "STREAM_HOST":             "",          # empty = auto-detect via UDP probe
    "STREAM_PORT":             "8080",
    "CONTROL_PORT":            "8081",
    "STAGING_AREA_THRESHOLD":  "50,150",
    "MIN_STAGING_AREA":        "5000",
    "OFFLINE_BUFFER_PATH":     "/tmp/picker-events-offline.jsonl",
}

# ── Config file location ──────────────────────────────────────────────────────

_DEFAULT_CONFIG_PATH = Path.home() / ".picker-vision.conf"


def _load_config_file(path: Path) -> dict[str, str]:
    """Parse a KEY=VALUE config file. Returns empty dict if file not found."""
    if not path.exists():
        return {}
    result: dict[str, str] = {}
    for lineno, raw in enumerate(path.read_text().splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            print(f"[config] Warning: ignoring malformed line {lineno} in {path}: {raw!r}",
                  file=sys.stderr)
            continue
        key, _, value = line.partition("=")
        result[key.strip()] = value.strip()
    return result


def load() -> dict[str, str]:
    """Return the merged configuration dict.

    Reads the config file first, then overlays environment variables.
    All keys in DEFAULTS are guaranteed to be present in the result.
    """
    config_path = Path(os.environ.get("PICKER_CONFIG", str(_DEFAULT_CONFIG_PATH)))
    file_values = _load_config_file(config_path)

    result: dict[str, str] = {}
    for key, default in DEFAULTS.items():
        # Priority: env var > config file > default
        result[key] = os.environ.get(key) or file_values.get(key) or default

    return result


def get(key: str, default: str = "") -> str:
    """Convenience: get a single config value."""
    return load().get(key, default)


def require(key: str) -> str:
    """Get a config value, raising a clear error if it is empty."""
    value = get(key)
    if not value:
        config_path = Path(os.environ.get("PICKER_CONFIG", str(_DEFAULT_CONFIG_PATH)))
        raise SystemExit(
            f"\n"
            f"ERROR: Required setting '{key}' is not configured.\n"
            f"\n"
            f"Set it in one of these ways:\n"
            f"\n"
            f"  1. Environment variable:\n"
            f"       export {key}=<value>\n"
            f"\n"
            f"  2. Config file ({config_path}):\n"
            f"       echo '{key}=<value>' >> {config_path}\n"
            f"\n"
            f"  3. Inline when running:\n"
            f"       {key}=<value> ./start.sh\n"
        )
    return value


# ── CLI — print active config and exit ───────────────────────────────────────

if __name__ == "__main__":
    cfg = load()
    config_path = Path(os.environ.get("PICKER_CONFIG", str(_DEFAULT_CONFIG_PATH)))

    print("Picker Vision — active configuration")
    print(f"Config file : {config_path} {'(exists)' if config_path.exists() else '(not found — using defaults/env)'}")
    print()
    width = max(len(k) for k in cfg)
    for key, value in cfg.items():
        # Mask any key with "KEY" or "SECRET" in the name
        display = "***" if any(s in key.upper() for s in ("KEY", "SECRET", "TOKEN")) else value
        missing = "  ← NOT SET" if not value else ""
        print(f"  {key:<{width}} = {display}{missing}")
    print()
    if not cfg.get("SERVER_URL"):
        print("WARNING: SERVER_URL is not set — the node will not connect to any server.")
