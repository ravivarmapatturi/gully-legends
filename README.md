# Gully Legends

A free cricket squad game for Android. Build your squad, shape every player with trait tokens, and climb a 10-team league.

## Install on your phone

1. On your Android phone, open the [latest release](https://github.com/ravivarmapatturi/gully-legends/releases/latest) and download the `.apk` file.
2. Open the downloaded file. If Android asks, allow your browser to "install unknown apps".
3. Tap **Install**.

To update later, download the newer `.apk` the same way and install it over the old one. Your progress is kept. The game also shows an "Update available" banner on its home screen when a new version is out.

## How it plays

Gully Legends is built around **Field Chess**: every ball is a duel between the delivery, the field and the batter's choice.

- **Batting:** see where the ball pitched and where every fielder stands, then pick a zone and a ground or lofted shot. The field map shows your odds for every zone; "Why?" explains them.
- **Bowling:** set your field and pick a line and length. Each delivery shows how dangerous it is against this batter with your field: bowl to your field.
- **Squad:** pick your XI and batting order. Every player has a signature skill, attributes you train with training points, and up to 10 trait tokens you spend however you like.
- **League:** 5-match seasons, promotion and relegation from Division 5 up to the Premier Division.
- **Formats:** Blitz (2 overs, about 3 minutes), T5 and T10.

Full design, including the session and monetization plan: [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md).

## Developing

```bash
python3 -m http.server 8765 -d www   # play in a browser
node --test tests/engine.test.js      # engine tests
node tools/simulate.js 300 t5         # balance report
./release.sh 0.3.0 "What changed"     # test, build a signed APK and publish a GitHub release
```

Credits: player models and animations by [Quaternius](https://quaternius.com) (CC0). 3D rendering by [three.js](https://threejs.org) (MIT).

The release signing key lives in `~/.gully-legends/` and is not in this repo. Back it up: without it, future updates can't install over the existing app.
