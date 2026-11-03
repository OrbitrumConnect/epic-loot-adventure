/**
 * Clips extras do herói só na Zona Sul (Mixamo do Pedro): dirigir, abrir a porta, nadar, boiar, surf e asa-delta.
 * 02/11 (Pedro, online: "amigo nadando vejo ele em pé na água; não vejo o skate; na prancha em pé, não deitado nem
 * surfando"): saíram do mundo pra cá — o MEU herói e o boneco dos OUTROS jogadores usam os mesmos (mesmo cache).
 */
export const ZS_HERO_CLIPS = { drive: '/zona-sul/anim/drive.glb', open_door: '/zona-sul/anim/open_door.glb', swim: '/zona-sul/anim/swim.glb', tread: '/zona-sul/anim/tread.glb',
  // SURF (28/10): remar = o nado deitado na prancha; levantar e base = Zombie Stand Up (Pedro: "só levanta direito depois
  // de 30%; a pose final é boa, meio surfista")
  paddle: '/zona-sul/anim/swim.glb', popup: '/zona-sul/anim/zombie_stand_up.glb', surf: '/zona-sul/anim/zombie_stand_up.glb',
  // ASA-DELTA (30/10): "Flying" do Mixamo (do Pedro) — corpo deitado, braços à frente, pendurado sob a asa
  glide: '/zona-sul/anim/glide.glb' };
/** Cortes: levantar = 30%→100% a 2× (≈ RIDE.POPUP_S); base = só o finalzinho (a pose final, segurada). */
// remar/nadar: o RITMO dos braços segue a velocidade real (Pedro 29/10: "remar parece câmera lenta" — a remada tocava
// fixa a 0,8×): remando 3,8 m/s = 1×, com Shift 6,1 = 1,6×; nadando 2,4 = 1×, rápido 4,2 = 1,75×
export const ZS_HERO_CUT = { open_door: { fixHips: true }, popup: { from: 0.3, speed: 2 }, surf: { from: 0.97 }, paddle: { sync: 1 / 3.8, syncMin: 0.6, syncMax: 1.7 }, swim: { sync: 1 / 2.4, syncMin: 0.6, syncMax: 1.8 } };
/** As ações desses clips (o boneco dos outros aceita quando vêm pela rede, na Zona Sul). */
export const ZS_HERO_ACTIONS = Object.keys(ZS_HERO_CLIPS);

/** EQUIPAMENTO pela rede (`RemotePose.g`): [tipo, altura acima do pé, rumo, rolagem, inclinação]. */
export const ZS_GEAR = { board: 1, skate: 2, glider: 3 } as const;
