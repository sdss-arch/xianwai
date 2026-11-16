from pathlib import Path
from sys import argv
from zipfile import ZIP_DEFLATED, ZipFile

apk, assets, dex = map(Path, argv[1:])
with ZipFile(apk, 'a', compression=ZIP_DEFLATED, compresslevel=5) as package:
    package.write(dex, 'classes.dex')
    for file in sorted(assets.rglob('*')):
        if file.is_file():
            package.write(file, 'assets/' + file.relative_to(assets).as_posix())
