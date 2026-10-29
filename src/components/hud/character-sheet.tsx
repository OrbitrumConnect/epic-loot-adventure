/**
 * FICHA DO PERSONAGEM + MOCHILA (tecla I) — inventário elite, 29/10 (Pedro: "faltou o formato do herói ao lado, nome,
 * nível, XP, local pra equipar armadura… nível MIR4 pra cima").
 *  - Esquerda: identidade (nome, classe, nível, XP, PODER), o HERÓI 3D no pedestal com os 9 espaços em volta
 *    (cabeça/peito/luvas/calças · botas/amuleto/anéis · arma embaixo), status de combate e atributos.
 *  - Direita: mochila com abas (tudo/equip/usar/materiais), raridade na moldura, número da hotbar, e o DETALHE do item
 *    escolhido com as ações (equipar/tirar, beber, descartar). Arrastar pra hotbar continua igual.
 * As regras são as de sempre (equipItem/unequipSlot/dropItem/drinkPotion/allocateSkill) — só a apresentação é nova.
 */
import { lazy, Suspense, useMemo, useState } from 'react';
import { FlaskConical, Gem, Hand, Home, Package, Shield, Swords, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ItemSprite } from '@/components/hud/item-sprite';
import { useGameStore } from '@/game/state/game-store';
import { ITEMS } from '@/game/data/items';
import { ARMOR_SLOTS, equipmentKeyForArmorSlot, isEquipped, type EquipmentKey } from '@/game/systems/equipmentSlots';
import { effectiveAttributes } from '@/game/systems/attributesSystem';
import { getUsedSlots, getWeight } from '@/game/systems/inventorySystem';
import { bagTabOf, sheetStats, type BagTab } from '@/game/systems/characterSheetSystem';
import { RARITY_LABEL, type ArmorSlot, type Item } from '@/game/types/item';
import { DEV_INFINITE_POTIONS } from '@/game/config/dev-flags';
import { isUnlocked, unlockLevel } from '@/game/systems/unlockSystem';

const HeroPreview = lazy(() => import('./hero-preview'));

const SLOT_LABEL: Record<ArmorSlot, string> = {
  head: 'Cabeça', chest: 'Peitoral', gloves: 'Luvas', legs: 'Calças', boots: 'Botas',
  amulet: 'Amuleto', ring1: 'Anel 1', ring2: 'Anel 2',
};
const LEFT: ArmorSlot[] = ['head', 'chest', 'gloves', 'legs'];
const RIGHT: ArmorSlot[] = ['boots', 'amulet', 'ring1', 'ring2'];
const CATEGORY_LABEL: Record<string, string> = {
  weapon: 'Arma', armor: 'Armadura', tool: 'Ferramenta', consumable: 'Consumível', resource: 'Material', utility: 'Utilitário', skill: 'Habilidade',
};
const TABS: { id: BagTab; label: string }[] = [
  { id: 'all', label: 'Tudo' }, { id: 'gear', label: 'Equipamento' }, { id: 'use', label: 'Usar' }, { id: 'mat', label: 'Materiais' },
];
const ATTRS = [
  { key: 'damage', icon: '⚔', label: 'Dano', hint: 'Multiplica o dano de ataque' },
  { key: 'dexterity', icon: '✦', label: 'Destreza', hint: 'Crítico e cadência do especial' },
  { key: 'carry', icon: '🎒', label: 'Capacidade', hint: 'Aumenta o peso que a bolsa carrega' },
  { key: 'moveSpeed', icon: '»', label: 'Velocidade', hint: 'Aumenta a velocidade de movimento' },
] as const;

function statLines(item: Item): string[] {
  const s = item.stats ?? {};
  return [
    item.attackPower ? `Ataque +${item.attackPower}` : '',
    item.armor !== undefined ? `Defesa +${item.armor}` : s.defense ? `Defesa +${s.defense}` : '',
    s.health ? `Vida +${s.health}` : '',
    s.damage ? `Dano +${s.damage}` : '',
    s.resistance ? `Resistência +${s.resistance}` : '',
    s.speed ? `Velocidade +${s.speed}` : '',
    s.luck ? `Sorte +${s.luck}` : '',
    item.healAmount ? `Cura ${item.healAmount} de vida` : '',
  ].filter(Boolean);
}

/** O que está escolhido no detalhe: um slot da mochila OU um espaço de equipamento. */
type Pick = { bag: number } | { equip: EquipmentKey } | null;

export function CharacterSheet({ onHome }: { onHome: () => void }) {
  const player = useGameStore(s => s.player);
  const selectedHotbar = useGameStore(s => s.ui.selectedHotbar);
  const equipItem = useGameStore(s => s.equipItem);
  const unequipSlot = useGameStore(s => s.unequipSlot);
  const dropItem = useGameStore(s => s.dropItem);
  const drinkPotion = useGameStore(s => s.drinkPotion);
  const allocateSkill = useGameStore(s => s.allocateSkill);
  const deallocateSkill = useGameStore(s => s.deallocateSkill);
  const [tab, setTab] = useState<BagTab>('all');
  const [pick, setPick] = useState<Pick>(null);

  const inv = player.inventory;
  const eq = inv.equipment;
  const heldSlot = inv.hotbar.slots[selectedHotbar];
  const heldId = heldSlot != null ? inv.slots[heldSlot]?.itemId ?? null : null;
  // ARMA: o jogo só grava `primary` quando você troca de slot — até lá o espaço mostra o que está NA MÃO (é ela que bate)
  const heldGear = heldId && ITEMS[heldId]?.equippable && bagTabOf(heldId) === 'gear' ? heldId : null;
  const st = useMemo(() => sheetStats(player, heldId), [player, heldId]);
  const attrs = effectiveAttributes(player);
  const weight = getWeight(inv);
  const used = getUsedSlots(inv);
  const xpPct = player.xpToNext > 0 ? Math.min(100, (player.xp / player.xpToNext) * 100) : 0;
  const points = player.skillPoints ?? 0;
  // índice da mochila → tecla da hotbar (1..0)
  const hotkey = useMemo(() => {
    const m = new Map<number, string>();
    inv.hotbar.slots.forEach((idx, i) => { if (idx != null && !m.has(idx)) m.set(idx, i === 9 ? '0' : String(i + 1)); });
    return m;
  }, [inv.hotbar.slots]);

  const pickedId = pick == null ? null : 'bag' in pick ? inv.slots[pick.bag]?.itemId ?? null : eq[pick.equip] ?? (pick.equip === 'primary' ? heldGear : null);
  const picked = pickedId ? ITEMS[pickedId] ?? null : null;
  const pickedQty = pick && 'bag' in pick ? inv.slots[pick.bag]?.quantity ?? 0 : 1;
  const pickedEquipped = !!pickedId && isEquipped(eq, pickedId);
  const equippedKey = (id: string): EquipmentKey | null =>
    (Object.keys(eq) as EquipmentKey[]).find(k => eq[k] === id) ?? null;

  const slotButton = (key: EquipmentKey, label: string, Icon: typeof Shield, extra = '') => {
    const id = eq[key] ?? (key === 'primary' ? heldGear : null);
    const it = id ? ITEMS[id] : null;
    const on = !!pick && 'equip' in pick && pick.equip === key;
    return (
      <button key={key} type="button" className={`cs-slot rarity-${it?.rarity ?? 'empty'} ${extra}`} data-filled={!!it} data-picked={on || undefined}
        title={it ? `${it.name} · ${RARITY_LABEL[it.rarity]}` : `${label} (vazio)`}
        aria-label={it ? `${label}: ${it.name}` : `${label} vazio`}
        onClick={() => setPick(it ? { equip: key } : null)}
        onDoubleClick={() => { if (it) { unequipSlot(key); setPick(null); } }}>
        {it ? <ItemSprite itemId={id!} size={40} /> : <Icon strokeWidth={1.3} />}
        <span>{it ? it.name : label}</span>
      </button>
    );
  };
  const armorSlot = (s: ArmorSlot) => slotButton(equipmentKeyForArmorSlot(s), SLOT_LABEL[s], s === 'amulet' || s === 'ring1' || s === 'ring2' ? Gem : Shield);

  const visible = inv.slots.map((slot, i) => ({ slot, i })).filter(({ slot }) => tab === 'all' || (slot.itemId != null && bagTabOf(slot.itemId) === tab));

  return (
    <div className="cs">
      <section className="cs-hero" aria-label="Personagem">
        <header className="cs-ident">
          <div className="cs-level" title={`Nível ${player.level}`}><small>NV</small>{player.level}</div>
          <div className="cs-name">
            <strong>{player.name}</strong>
            <small>Guerreiro</small>
            <div className="cs-xp" title={`XP ${player.xp} / ${player.xpToNext} (total ${player.totalXp})`}>
              <i style={{ width: `${xpPct}%` }} />
              <span>XP {player.xp.toLocaleString('pt-BR')} / {player.xpToNext.toLocaleString('pt-BR')} · {xpPct.toFixed(1)}%</span>
            </div>
          </div>
          <div className="cs-power" title="Poder de combate: resumo do ataque (com crítico) e da resistência (vida e defesa). Serve pra comparar equipamentos.">
            <small>PODER</small><strong>{st.power.toLocaleString('pt-BR')}</strong>
          </div>
        </header>

        <div className="cs-doll">
          <div className="cs-col">{LEFT.map(armorSlot)}</div>
          <div className="cs-stage">
            <Suspense fallback={<div className="hero-preview hero-preview--loading" />}>
              <HeroPreview />
            </Suspense>
          </div>
          <div className="cs-col">{RIGHT.map(armorSlot)}</div>
          <div className="cs-weapon">
            {slotButton('primary', 'Arma', Swords, 'cs-slot--wide')}
            {inv.equipment.accessory && slotButton('accessory', 'Acessório', Gem, 'cs-slot--wide')}
          </div>
        </div>

        <div className="cs-stats" aria-label="Status">
          <div><span>Ataque</span><strong>{st.attack}</strong></div>
          <div><span>Defesa</span><strong>{st.defense}</strong></div>
          <div><span>Vida</span><strong>{player.hp} / {st.maxHp}</strong></div>
          <div title="De um golpe de 100, quanto passa pela armadura e resistência"><span>Dano recebido</span><strong>{st.takenOf100}%</strong></div>
          <div><span>Crítico</span><strong>{(st.critChance * 100).toFixed(1)}% · ×{st.critMult.toFixed(2)}</strong></div>
          <div><span>Resistência</span><strong>{Math.round(st.resistance * 100)}%</strong></div>
          <div><span>Velocidade</span><strong>+{st.moveSpeed}%</strong></div>
          <div><span>Sorte</span><strong>+{Math.round(st.luck * 100)}%</strong></div>
          <div><span>Alcance</span><strong>{st.range.toFixed(1)} m</strong></div>
          <div><span>Carga</span><strong>{st.carryKg} kg</strong></div>
        </div>

        <div className="cs-attrs" aria-label="Atributos">
          <div className="cs-attrs-head"><strong>Atributos</strong><span data-has={points > 0}>{points} ponto{points === 1 ? '' : 's'}</span></div>
          {ATTRS.map(row => {
            const own = player.attributes?.[row.key] ?? 0;
            return (
              <div className="cs-attr" key={row.key} title={row.hint}>
                <span>{row.icon} {row.label}</span>
                <i><b style={{ width: `${attrs[row.key]}%` }} /></i>
                <em>+{attrs[row.key]}%</em>
                <Button variant="ghost" className="attr-btn" aria-label={`Diminuir ${row.label}`} disabled={own <= 0} onClick={() => deallocateSkill(row.key)}>−</Button>
                <Button variant="ghost" className="attr-btn" aria-label={`Aumentar ${row.label}`} disabled={points <= 0 || own >= 60} onClick={() => allocateSkill(row.key)}>+</Button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="cs-bag" aria-label="Mochila">
        <div className="cs-tabs" role="tablist">
          {TABS.map(t => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} data-on={tab === t.id || undefined} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>
        <div className="cs-grid">
          {visible.map(({ slot, i }) => {
            const it = slot.itemId ? ITEMS[slot.itemId] : null;
            if (!it) return <div key={i} className="cs-cell cs-cell--empty" aria-hidden="true" />;
            const equipped = it.equippable && isEquipped(eq, it.id);
            const on = !!pick && 'bag' in pick && pick.bag === i;
            return (
              <button key={i} type="button" draggable className={`cs-cell rarity-${it.rarity}`} data-picked={on || undefined} data-equipped={equipped || undefined}
                title={`${it.name}${slot.quantity > 1 ? ` × ${slot.quantity}` : ''} · ${RARITY_LABEL[it.rarity]}${it.equippable ? ' · 2 cliques = equipar' : ''}`}
                aria-label={`${it.name}${slot.quantity > 1 ? ` × ${slot.quantity}` : ''}`}
                onClick={() => setPick({ bag: i })}
                onDoubleClick={() => { if (it.equippable && !equipped) equipItem(it.id); }}
                onDragStart={e => e.dataTransfer.setData('text/plain', String(i))}>
                <ItemSprite itemId={it.id} size={40} />
                {slot.quantity > 1 && <em>{slot.quantity > 999 ? `${Math.floor(slot.quantity / 1000)}k` : slot.quantity}</em>}
                {hotkey.has(i) && <kbd>{hotkey.get(i)}</kbd>}
                {!isUnlocked(it.id, player.level) && <b className="cs-lock" title={`Libera no nível ${unlockLevel(it.id)}`}>Nv {unlockLevel(it.id)}</b>}
                {equipped && <i className="cs-eq">E</i>}
              </button>
            );
          })}
        </div>
        <div className="cs-load">
          <div title="Peso"><span>Peso</span><i><b style={{ width: `${Math.min(100, (weight / Math.max(1, inv.maxWeight)) * 100)}%` }} data-full={weight >= inv.maxWeight || undefined} /></i><strong>{weight.toFixed(1)} / {inv.maxWeight} kg</strong></div>
          <div title="Espaços"><span>Espaços</span><strong>{used} / {inv.maxSlots}</strong></div>
        </div>

        <div className={`cs-detail ${picked ? `rarity-${picked.rarity}` : ''}`} aria-live="polite">
          {picked ? (
            <>
              <div className="cs-detail-head">
                <ItemSprite itemId={picked.id} size={52} />
                <div>
                  <strong>{picked.name}</strong>
                  <small><b className={`cs-rar rarity-${picked.rarity}`}>{RARITY_LABEL[picked.rarity]}</b> · {CATEGORY_LABEL[picked.category] ?? picked.category}{pickedQty > 1 ? ` · × ${pickedQty}` : ''}</small>
                </div>
              </div>
              {!isUnlocked(picked.id, player.level) && <p className="cs-locked">🔒 Libera no nível {unlockLevel(picked.id)} · você está no {player.level}</p>}
              <ul>{statLines(picked).map(l => <li key={l}>{l}</li>)}<li className="cs-muted">Peso {picked.weight} kg{picked.dropOnDeath ? ' · cai ao morrer' : ''}</li></ul>
              <div className="cs-actions">
                {picked.equippable && !pickedEquipped && <Button size="sm" disabled={!isUnlocked(picked.id, player.level)} onClick={() => equipItem(picked.id)}><Hand />Equipar</Button>}
                {pickedEquipped && <Button size="sm" variant="outline" onClick={() => { const k = pick && 'equip' in pick ? pick.equip : equippedKey(picked.id); if (k) unequipSlot(k); setPick(null); }}>Tirar</Button>}
                {picked.id === 'health_potion' || (picked.usable && (picked.healAmount ?? 0) > 0)
                  ? <Button size="sm" variant="outline" disabled={!DEV_INFINITE_POTIONS && player.hp >= st.maxHp} onClick={drinkPotion}><FlaskConical />Beber</Button> : null}
                {pick && 'bag' in pick && (
                  <Button size="sm" variant="ghost" className="cs-drop" onClick={() => { dropItem(pick.bag); setPick(null); }}><Trash2 />Descartar</Button>
                )}
              </div>
            </>
          ) : (
            <p className="cs-muted"><Package /> Toque num item pra ver os detalhes. Dois cliques equipam · arraste pra hotbar.</p>
          )}
        </div>
        <div className="panel-actions"><Button variant="outline" onClick={onHome}><Home />Retornar à base</Button></div>
      </section>
    </div>
  );
}
