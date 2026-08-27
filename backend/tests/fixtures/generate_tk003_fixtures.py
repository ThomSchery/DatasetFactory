from __future__ import annotations

import json
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from backend.app.config import Settings

ROOT = Path(__file__).resolve().parent
CROPS = ROOT / "hud-crops"
VIDEO = ROOT / "video"
EXPECTED = ROOT / "expected-ocr"
FONT = Path("C:/Windows/Fonts/consolab.ttf")
SAMPLES = (
    ("health", "HP100"),
    ("armour", "AR075"),
    ("negative", "-25"),
    ("score", "SCORE9"),
    ("level", "LEVEL7"),
    ("ammo", "AMMO42"),
    ("xp", "XP001"),
    ("wave", "WAVE3"),
    ("kills", "KILLS8"),
    ("mixed", "A1B2C3"),
    ("ratio", "77/100"),
)


def main() -> None:
    if not FONT.is_file():
        raise SystemExit(f"Fixture regeneration requires {FONT}")
    for directory in (CROPS, VIDEO, EXPECTED):
        directory.mkdir(parents=True, exist_ok=True)
    font = ImageFont.truetype(str(FONT), 56)
    frame = Image.new("RGB", (1280, 852), "#101318")
    records: list[dict[str, object]] = []
    for index, (sample_id, text) in enumerate(SAMPLES):
        crop = Image.new("RGB", (420, 96), "black")
        draw = ImageDraw.Draw(crop)
        boxes: list[dict[str, object]] = []
        for char_index, char in enumerate(text):
            cell_x = 12 + char_index * 62
            preliminary = draw.textbbox((0, 0), char, font=font, anchor="lt")
            glyph_width = preliminary[2] - preliminary[0]
            draw_x = cell_x + (54 - glyph_width) // 2
            draw_y = 14
            draw.text((draw_x, draw_y), char, font=font, fill="white", anchor="lt")
            cell_bounds = (cell_x, 0, cell_x + 54, 96)
            ink = crop.crop(cell_bounds).convert("L").getbbox()
            if ink is None:
                raise RuntimeError(f"Character {char!r} produced no visible pixels")
            left = cell_x + ink[0]
            top = ink[1]
            right = cell_x + ink[2]
            bottom = ink[3]
            boxes.append(
                {
                    "char": char,
                    "bbox": [left, top, right - left, bottom - top],
                }
            )
        crop_path = CROPS / f"{index:02d}-{sample_id}.png"
        crop.save(crop_path, optimize=True)
        frame_x = 40 if index % 2 == 0 else 680
        frame_y = 32 + (index // 2) * 132
        frame.paste(crop, (frame_x, frame_y))
        records.append(
            {
                "id": sample_id,
                "text": text,
                "crop": crop_path.relative_to(ROOT).as_posix(),
                "region_bbox": [frame_x, frame_y, 420, 96],
                "characters": boxes,
            }
        )
    frame_path = VIDEO / "synthetic-frame.png"
    frame.save(frame_path, optimize=True)
    ffmpeg = Settings().ffmpeg_path
    if not ffmpeg.is_file():
        raise SystemExit("Fixture regeneration requires DF_FFMPEG_PATH")
    subprocess.run(
        [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-loop",
            "1",
            "-i",
            str(frame_path),
            "-t",
            "1",
            "-c:v",
            "libx264rgb",
            "-crf",
            "0",
            "-preset",
            "veryslow",
            str(VIDEO / "synthetic-hud.mkv"),
        ],
        check=True,
        stdin=subprocess.DEVNULL,
        timeout=60,
    )
    (EXPECTED / "synthetic-hud.json").write_text(
        json.dumps(
            {
                "fixture_kind": "synthetic",
                "font": "Consolas Bold 56 px",
                "allowed_chars": "-/0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
                "samples": records,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
