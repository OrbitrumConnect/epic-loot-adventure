// Mostra o que tem num GLB de clip (nós, malhas, peles, animações, trilhas do quadril). Uso: node tools/glb-anim-info.mjs <arquivo.glb>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f), root = doc.getRoot();
  const anims = root.listAnimations();
  const out = { arquivo: f, nos: root.listNodes().length, malhas: root.listMeshes().length, peles: root.listSkins().length, texturas: root.listTextures().length, animacoes: [] };
  for (const a of anims) {
    let dur = 0;
    const hips = a.listChannels().filter((c) => /hips/i.test(c.getTargetNode()?.getName() ?? '') && c.getTargetPath() === 'translation');
    for (const s of a.listSamplers()) { const t = s.getInput()?.getArray(); if (t?.length) dur = Math.max(dur, t[t.length - 1]); }
    const h = hips[0]?.getSampler()?.getOutput()?.getArray();
    out.animacoes.push({ nome: a.getName(), canais: a.listChannels().length, duracao: +dur.toFixed(3),
      quadril: h ? { y0: +h[1].toFixed(4), yMin: +Math.min(...Array.from({ length: h.length / 3 }, (_, i) => h[i * 3 + 1])).toFixed(4), dz: +(h[h.length - 1] - h[2]).toFixed(4), dx: +(h[h.length - 3] - h[0]).toFixed(4) } : null });
  }
  console.log(JSON.stringify(out));
}
