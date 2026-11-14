#!/bin/sh
# Build into build.next and swap it into build/ only when the build succeeded.
#
# `react-scripts build` empties its output folder before compiling, so building
# straight into the folder nginx serves takes the site down for the length of
# the build, and a failed build leaves it down. This keeps the previous build
# in place until the new one is complete; the build before that stays in
# build.prev for a quick rollback (mv build build.bad && mv build.prev build).
set -e
cd "$(dirname "$0")/.."

rm -rf build.next
trap 'rm -rf build.next' EXIT

BUILD_PATH=build.next npx react-scripts build
test -f build.next/index.html

rm -rf build.prev
if [ -d build ]; then
  mv build build.prev
fi
mv build.next build
echo "New build is in build/ (previous build kept in build.prev/)."
