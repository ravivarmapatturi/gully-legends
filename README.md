# Gully Legends

A free cricket squad game for Android. Build your squad, shape every player with trait tokens, and climb a 10-team league.

## Install on your phone

1. On your Android phone, open the [latest release](https://github.com/ravivarmapatturi/gully-legends/releases/latest) and download the `.apk` file.
2. Open the downloaded file. If Android asks, allow your browser to "install unknown apps".
3. Tap **Install**.

To update later, download the newer `.apk` the same way and install it over the old one. Your progress is kept. The game also shows an "Update available" banner on its home screen when a new version is out.

## How it plays

- **You bowl first.** Pick a bowler each over and a delivery each ball (good length, yorker, bouncer, slower). Each batter has a scouted weakness, and repeating the same ball gets punished.
- **Then you bat.** Tap left, middle or right as the ball reaches the yellow ring. Your batter's traits change the timing window and the boundary odds.
- **Players.** Each has a built-in signature skill plus up to 10 trait tokens you can put into any traits, max 5 in one. Reset is free.
- **Coins.** Runs, fours, sixes and wickets earn coins. Spend them on training (+1 token), and get one free training every day.

## Developing

```bash
python3 -m http.server 8765 -d www   # play in a browser
./release.sh 0.2.0 "What changed"     # build a signed APK and publish a GitHub release
```

The release signing key lives in `~/.gully-legends/` and is not in this repo. Back it up: without it, future updates can't install over the existing app.
