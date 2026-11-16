from pathlib import Path
from zipfile import ZipFile, ZIP_STORED
from PIL import Image, ImageDraw, ImageFont
import os

root = Path(__file__).resolve().parent
shots = root / 'shots'
files = sorted(shots.glob('*.png'))
font_path = Path(os.environ.get('XIANWAI_FONT') or 'C:/Windows/Fonts/msyh.ttc')
title_font = ImageFont.truetype(str(font_path), 36)
label_font = ImageFont.truetype(str(font_path), 23)
thumb_width, thumb_height = 270, 585
margin, gap = 35, 26
columns = 3
rows = (len(files) + columns - 1) // columns
board = Image.new('RGB', (2 * margin + columns * thumb_width + 2 * gap,
    margin + 76 + rows * (thumb_height + 66)), '#eeeee6')
draw = ImageDraw.Draw(board)
draw.text((margin, margin - 4), '弦外 · Android 0.5.1', font=title_font, fill='#24392f')

for index, file in enumerate(files):
    row, column = divmod(index, columns)
    x = margin + column * (thumb_width + gap)
    y = margin + 72 + row * (thumb_height + 66)
    with Image.open(file) as screenshot:
        assert screenshot.size == (720, 1560), (file, screenshot.size)
        board.paste(screenshot.resize((thumb_width, thumb_height), Image.Resampling.LANCZOS), (x, y))
    draw.text((x, y + thumb_height + 10), file.stem.replace('-', '  ', 1), font=label_font, fill='#24392f')

overview = root / '弦外-Android页面总览.png'
board.save(overview)
bundle = root / '弦外-Android页面截图.zip'
with ZipFile(bundle, 'w', ZIP_STORED) as archive:
    for file in files:
        archive.write(file, file.name)
    archive.write(overview, overview.name)
with ZipFile(bundle) as archive:
    assert archive.testzip() is None and len(archive.namelist()) == len(files) + 1
print(f'{len(files)} original screenshots and contact sheet verified')
