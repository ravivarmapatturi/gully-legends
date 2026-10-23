#!/usr/bin/env bash
# Build a signed APK and publish it as a GitHub release.
#   ./release.sh 0.2.0 "What changed in this version"
set -euo pipefail
cd "$(dirname "$0")"
VER="${1:?usage: ./release.sh <version> \"notes\"}"
NOTES="${2:-New version}"
REPO="ravivarmapatturi/gully-legends"

# One version number everywhere: package.json (Gradle reads it) and the in-game updater.
node -e "const f='package.json',p=require('./'+f);p.version='$VER';require('fs').writeFileSync(f,JSON.stringify(p,null,2)+'\n')"
sed -i "s/^const APP_VERSION = '.*';/const APP_VERSION = '$VER';/" www/js/updater.js

export ANDROID_HOME="$HOME/Android/Sdk"
export JAVA_TOOL_OPTIONS="-Djava.net.preferIPv4Stack=true"
# Use a full JDK (the system Java here lacks javac). Override by setting JAVA_HOME yourself.
JDK=$(ls -d "$HOME"/.jdks/jdk-21* 2>/dev/null | head -1)
export JAVA_HOME="${JAVA_HOME:-$JDK}"
npx cap sync android
(cd android && ./gradlew --no-daemon -q assembleRelease)

mkdir -p dist
APK="dist/gully-legends-v$VER.apk"
cp android/app/build/outputs/apk/release/app-release.apk "$APK"
"$ANDROID_HOME/build-tools/35.0.0/apksigner" verify "$APK"
echo "Built $APK ($(du -h "$APK" | cut -f1))"

if [ "${NO_PUBLISH:-}" = "1" ]; then exit 0; fi
git add -A && git commit -qm "Release v$VER" && git tag "v$VER" && git push -q origin HEAD --tags
gh release create "v$VER" "$APK" --repo "$REPO" --title "Gully Legends v$VER" --notes "$NOTES"
echo "Released: https://github.com/$REPO/releases/tag/v$VER"
