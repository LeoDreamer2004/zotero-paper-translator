#!/bin/sh
# Package addon/ into build/paper-translator-<version>.xpi
set -eu
cd "$(dirname "$0")/.."
version=$(python3 -c 'import json; print(json.load(open("addon/manifest.json"))["version"])')
out="build/paper-translator-$version.xpi"
mkdir -p build
rm -f "$out"
(cd addon && zip -qr -X "../$out" . -x '.*' -x '*/.*' -x '*/__pycache__/*')
echo "$out"
