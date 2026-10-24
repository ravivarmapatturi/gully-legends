# Gully Legends — Game Design

Gully Legends is a free cricket strategy game built around one original idea: **Field Chess**. Every ball is a small duel between where the bowler puts the ball, where the captain puts the fielders, and where the batter decides to hit it. You can see everything that matters (the delivery, the field, your odds), and you win by reading it better than your opponent.

## The core loop: Field Chess

**When you bat**, the ball is bowled and you see where it pitched: its line (outside off, on the stumps, down leg) and length (yorker, full, good, short). You also see all nine fielders on a top-down map. You pick one of eight zones to hit into and a shot type:

- A **ground** shot is safer. If an inner-ring fielder stands in that zone, it's a dot or a single. If only a boundary fielder is there, you get one or two. If the zone is empty, you have a real chance of four.
- A **lofted** shot clears the ring. An empty boundary means a six or a four, but a boundary fielder in that zone can take the catch.

Some deliveries naturally go to some zones. A short ball outside off wants to go to point, and a full ball on the stumps wants to go straight. Hitting with the ball is far easier than hitting against it. Your batter's technique, power, placement and temperament, plus their traits and signature skill, shift the odds. The map shows the odds for every zone as a heatmap, and "Why?" lists exactly what moved them.

**When you bowl**, you set the field (presets or zone by zone, nine fielders, at most five on the boundary, optional slip) and pick a line and length. Each delivery cell shows how dangerous that ball is against this batter with your current field. The skill is *bowling to your field*: protect the zones your delivery feeds. Accuracy decides whether the ball lands where you aimed, and a missed yorker becomes a full toss.

The AI on both sides plays with the same rules and the same odds. It has no hidden information and no rubber-banding.

## Short sessions

Most players will open the game for a few minutes at a time, so a full loop has to fit in one sitting:

| Session piece | Time | Status |
|---|---|---|
| Claim free daily training | 10 s | v0.2 |
| Blitz match (2 overs a side, 3 wickets) — the default format | 3–4 min | v0.2 |
| Spend coins / training points on a player | 1 min | v0.2 |
| "Auto this over" / "Sim innings" when you only care about part of a match | instant | v0.2 |
| Daily Challenge: one scripted situation ("18 off the last over, 2 wickets left"), same for everyone, shareable result | 1–2 min | planned v0.3 |
| Longer formats (T5, T10) for when you have time | 10–25 min | v0.2 |

A league season is five matches, so a player can finish a season in a day or spread it across a week. Promotion and relegation give each season stakes.

## Progression

- **Coins** come from hitting (runs, fours, sixes), wickets and wins. They buy trait-token training.
- **Training points** come from every match, wins, level-ups and season finishes. They raise attributes, up to each player's potential.
- **XP and levels** per player reward actually playing your squad.
- **Trait tokens**: up to 10 per player, any mix, max 5 per trait, free respec. This lets you build the player *you* want.
- **Signature skills**: one per player, always on, unique to them (Helicopter Shot, Toe Crusher, Golden Arm…).
- **Divisions**: 5 → Premier. Top 2 go up, bottom goes down.

## Monetization (fair by design)

The promise is that **gameplay power is never for sale**. Every attribute, trait and player can be earned by playing. Revenue comes from things that make the game look and feel like *yours* or that support it:

1. **Cosmetics.** Team kits and colours, bat stickers and designs, helmet styles, stadium themes (night match, monsoon, gully street), celebration animations, and custom club badges. They're cheap to make and suit a 3D game.
2. **Supporter Pass (per season).** A free track with cosmetics for everyone, and a paid track with extra cosmetics plus quality-of-life features like more saved match history, full replays and early access to new stadiums. No coins, training points or stats.
3. **Stadium sponsorship.** The advertising boards and sight-screens in the 3D stadium are real ad inventory. Sell them to local businesses or brands ("your shop on the boundary board in every match"). This fits cricket naturally and doesn't interrupt play.
4. **Optional rewarded videos, capped daily.** For example, watch one to double a match's coin reward, at most 3 times a day. Optional only, never forced interstitials.
5. **Community tournaments** with sponsor-provided prizes once online play exists.

**Technical note:** in-app purchases through Google Play Billing need the Play Store build. The sideloaded beta APK can't take payments that way. Until the Play Store launch, cosmetics can be unlocked through play, and sponsorships can be sold directly.

## Roadmap

- **v0.2 (this release):** Field Chess engine, 3D stadium with animated players and two-handed batting, squad/XI, training, league seasons, scorecards, history.
- **v0.3:** Daily Challenge, cosmetics shop (earnable), club name and kit editor, match replays from the stored seed and decisions, sound design.
- **v0.4:** Momentum meter and Captain's Calls (one-off tactical cards per match), scouting market for new players.
- **v0.5+:** accounts and cloud save, async PvP (play against other people's saved squads), Play Store release, Supporter Pass.

## Engineering principles

- The engine (`www/js/engine.js`) is pure and seeded. The same config and decisions replay the same match, and the AI uses a separate random stream so replays stay exact.
- The 3D scene only animates engine results; it never decides them.
- `node --test tests/` checks valid odds, fielding effects, skill effects, cricket rules over many matches, replays and no-ball rules.
- `node tools/simulate.js 300 t5` prints a balance report (runs per over, boundary %, wickets, win rates by skill gap).
- Art is original or CC0 (Quaternius player models and animations). 3D uses three.js (MIT).
