/**
 * VEÍCULO QUE PROTEGE (Pedro 01/11: "carro com vida e barra igual à do herói; explodiu, builda outro"). Dirigindo, o dano
 * que viria no herói vai no VEÍCULO (vida própria): o mundo da Zona Sul registra `absorb` enquanto você está no volante
 * e tira o registro ao sair. `true` = o veículo tomou (o herói não perde vida). Sem registro (a pé, no Vale): nada muda.
 * Usado nos DOIS caminhos de dano no herói: o golpe do bicho local (hostile-ai) e o que chega pela rede
 * (takePlayerDamage: PvP, canhão, bicho do anfitrião).
 */
export const vehicleShield: { absorb: ((dmg: number, from: string) => boolean) | null } = { absorb: null };
