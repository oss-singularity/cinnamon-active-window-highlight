#!/usr/bin/env python3
"""Build deterministic Cinnamon Spices and install candidates."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import zipfile
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "packaging" / "files.json"
FORBIDDEN_METADATA_FIELDS = {"icon", "dangerous", "last-edited"}
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
MIN_SCREENSHOT_WIDTH = 256
MIN_SCREENSHOT_HEIGHT = 240


def fail(message: str) -> None:
    raise SystemExit(message)


def load_manifest() -> dict[str, Any]:
    try:
        manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        fail(f"Could not read {MANIFEST_PATH}: {error}")
    if not isinstance(manifest, dict):
        fail("Packaging manifest must contain a JSON object.")
    required = ("uuid", "author", "payload", "screenshot", "submission-readme")
    for key in required:
        if key not in manifest:
            fail(f"Packaging manifest is missing '{key}'.")
    if not isinstance(manifest["payload"], list) or not manifest["payload"]:
        fail("Packaging manifest payload must be a non-empty list.")
    return manifest


def safe_relative(value: object, field: str) -> Path:
    path = Path(str(value))
    if path.is_absolute() or ".." in path.parts:
        fail(f"{field} must stay inside the repository: {value}")
    return path


def source_path(relative: Path, field: str) -> Path:
    raw_path = ROOT / relative
    if raw_path.is_symlink():
        fail(f"{field} is not a regular file: {relative}")
    path = raw_path.resolve()
    try:
        path.relative_to(ROOT)
    except ValueError:
        fail(f"{field} escapes the repository: {relative}")
    if not path.is_file():
        fail(f"{field} is not a regular file: {relative}")
    return path


def png_dimensions(path: Path) -> tuple[int, int]:
    data = path.read_bytes()
    if len(data) < 24 or data[:8] != PNG_SIGNATURE or data[12:16] != b"IHDR":
        fail(f"Not a valid PNG with an IHDR header: {path}")
    width = int.from_bytes(data[16:20], "big")
    height = int.from_bytes(data[20:24], "big")
    if width <= 0 or height <= 0:
        fail(f"PNG dimensions must be positive: {path}")
    return width, height


def validate_sources(manifest: dict[str, Any]) -> tuple[str, dict[str, Any], list[tuple[str, Path]]]:
    uuid = str(manifest["uuid"])
    author = str(manifest["author"])
    if not uuid or any(char.isspace() for char in uuid):
        fail(f"Invalid UUID in packaging manifest: {uuid!r}")
    if not author or any(char.isspace() for char in author):
        fail(f"Invalid author in packaging manifest: {author!r}")

    metadata_path = source_path(Path("metadata.json"), "metadata")
    try:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        fail(f"Could not parse metadata.json: {error}")
    if not isinstance(metadata, dict):
        fail("metadata.json must contain a JSON object.")
    for field in ("uuid", "name", "description", "version"):
        if field not in metadata:
            fail(f"metadata.json is missing '{field}'.")
    if metadata["uuid"] != uuid:
        fail(f"metadata.json UUID does not match the manifest: {metadata['uuid']!r}")
    forbidden = sorted(FORBIDDEN_METADATA_FIELDS.intersection(metadata))
    if forbidden:
        fail("metadata.json contains fields forbidden by validate-spice: " + ", ".join(forbidden))
    for field, value in metadata.items():
        try:
            str(value).encode("ascii")
        except UnicodeEncodeError:
            fail(f"metadata.json contains non-ASCII data in '{field}'.")

    payload: list[tuple[str, Path]] = []
    seen: set[str] = set()
    for item in manifest["payload"]:
        relative = safe_relative(item, "payload path")
        key = relative.as_posix()
        if key in seen:
            fail(f"Duplicate payload path: {key}")
        seen.add(key)
        payload.append((key, source_path(relative, "payload path")))

    required_payload = {"metadata.json", "extension.js", "icon.png"}
    if not required_payload.issubset(seen):
        fail("Payload must include metadata.json, extension.js and icon.png.")

    icon_width, icon_height = png_dimensions(source_path(Path("icon.png"), "icon"))
    if icon_width != icon_height:
        fail(f"icon.png must be square, got {icon_width}x{icon_height}.")

    screenshot = source_path(safe_relative(manifest["screenshot"], "screenshot"), "screenshot")
    screenshot_width, screenshot_height = png_dimensions(screenshot)
    if screenshot_width < MIN_SCREENSHOT_WIDTH or screenshot_height < MIN_SCREENSHOT_HEIGHT:
        fail(f"Screenshot is unexpectedly small: {screenshot_width}x{screenshot_height}.")

    readme = source_path(
        safe_relative(manifest["submission-readme"], "submission README"),
        "submission README",
    )
    return uuid, metadata, payload + [("__screenshot__", screenshot), ("__readme__", readme)]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
    path.chmod(0o644)


def copy_regular(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, destination)
    destination.chmod(0o644)


def write_deterministic_zip(files: list[tuple[str, Path]], destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, source in sorted(files):
            info = zipfile.ZipInfo(name)
            info.date_time = (1980, 1, 1, 0, 0, 0)
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, source.read_bytes())


def git_revision() -> str | None:
    try:
        return subprocess.run(
            ["git", "-C", str(ROOT), "rev-parse", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None


def git_dirty() -> bool | None:
    try:
        result = subprocess.run(
            ["git", "-C", str(ROOT), "status", "--porcelain", "--untracked-files=all"],
            check=True,
            capture_output=True,
            text=True,
        )
        return bool(result.stdout.strip())
    except (OSError, subprocess.CalledProcessError):
        return None


def build(output_dir: Path, manifest: dict[str, Any]) -> None:
    uuid, metadata, files = validate_sources(manifest)
    if output_dir.exists():
        if not output_dir.is_dir() or output_dir.is_symlink():
            fail(f"Refusing to replace non-directory output: {output_dir}")
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True)

    submission_root = output_dir / "submission" / uuid
    payload_root = submission_root / "files" / uuid
    submission_root.mkdir(parents=True)
    write_json(submission_root / "info.json", {"author": str(manifest["author"])})
    copy_regular(dict(files)["__screenshot__"], submission_root / "screenshot.png")
    copy_regular(dict(files)["__readme__"], submission_root / "README.md")

    payload_files: list[tuple[str, Path]] = []
    payload_hashes: dict[str, str] = {}
    for relative, source in files:
        if relative.startswith("__"):
            continue
        destination = payload_root / relative
        copy_regular(source, destination)
        payload_files.append((f"{uuid}/{relative}", destination))
        payload_hashes[relative] = sha256(destination)

    install_zip = output_dir / f"{uuid}-install.zip"
    write_deterministic_zip(payload_files, install_zip)
    submission_files = [
        (path.relative_to(output_dir / "submission").as_posix(), path)
        for path in (output_dir / "submission").rglob("*")
        if path.is_file()
    ]
    submission_zip = output_dir / f"{uuid}-submission.zip"
    write_deterministic_zip(submission_files, submission_zip)

    receipt = {
        "uuid": uuid,
        "version": str(metadata["version"]),
        "author": str(manifest["author"]),
        "sourceCommit": git_revision(),
        "sourceDirty": git_dirty(),
        "payloadFiles": payload_hashes,
        "artifacts": {
            "installZip": sha256(install_zip),
            "submissionZip": sha256(submission_zip),
        },
    }
    write_json(output_dir / "package-receipt.json", receipt)
    print(f"Built {uuid} {metadata['version']} in {output_dir}")
    print(f"Payload files: {len(payload_hashes)}")
    print(f"Install ZIP SHA256: {receipt['artifacts']['installZip']}")
    print(f"Submission ZIP SHA256: {receipt['artifacts']['submissionZip']}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="validate sources without writing dist/")
    parser.add_argument(
        "--output-dir",
        type=Path,
        help="candidate output directory (default: dist/spices-ready/UUID-VERSION)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    manifest = load_manifest()
    uuid, metadata, _ = validate_sources(manifest)
    if args.check:
        print(f"Packaging sources valid for {uuid} {metadata['version']}.")
        return 0
    output_dir = args.output_dir or ROOT / "dist" / "spices-ready" / f"{uuid}-{metadata['version']}"
    if not output_dir.is_absolute():
        output_dir = ROOT / output_dir
    build(output_dir.resolve(), manifest)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
