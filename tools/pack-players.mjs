// Packs the CC0 Quaternius Universal Animation Library mannequin into one small GLB,
// keeping only the animations the game uses.  node tools/pack-players.mjs <in.gltf> <out.glb>
import { NodeIO } from '@gltf-transform/core';
import { prune, dedup, weld, quantize } from '@gltf-transform/functions';
const KEEP = new Set(['Idle_Loop', 'Sword_Idle', 'Sword_Attack', 'Sprint_Loop', 'Jog_Fwd_Loop', 'Walk_Loop',
  'Spell_Simple_Shoot', 'Crouch_Idle_Loop', 'Roll', 'Jump_Start', 'Jump_Loop', 'Dance_Loop', 'Death01',
  'PickUp_Table', 'Punch_Jab', 'Hit_Chest']);
const [, , inp, out] = process.argv;
const io = new NodeIO();
const doc = await io.read(inp);
for (const a of doc.getRoot().listAnimations()) if (!KEEP.has(a.getName())) a.dispose();
await doc.transform(dedup(), weld(), prune());
await io.write(out, doc);
console.log('animations:', doc.getRoot().listAnimations().map(a => a.getName()).join(', '));
