/**
 * 后室实体生命值与准星目标注册。
 */

export const BACKROOMS_ENTITY_HEALTH = Object.freeze({
  chicken: 40,
  death_moth: 60,
  clump: 100,
  smiler: 150,
  hound: 90,
  partygoer: 120,
  faceling: 110,
  duller: 90,
});

/** @type {object[]} */
const _targets = [];

/**
 * @param {THREE.Object3D} group
 * @param {{
 *   kind: string,
 *   name: string,
 *   maxHp?: number,
 *   aimHeight?: number,
 *   onDamage?: (target: object, damage: number) => void,
 *   onDeath?: (target: object) => void,
 * }} opts
 */
export function registerBackroomsEntityTarget(group, opts) {
  opts = opts || {};
  var maxHp =
    opts.maxHp != null
      ? opts.maxHp
      : BACKROOMS_ENTITY_HEALTH[opts.kind] || 100;
  var target = {
    kind: opts.kind || "entity",
    name: opts.name || "实体",
    hp: maxHp,
    maxHp: maxHp,
    alive: true,
    group: group,
    aimHeight: opts.aimHeight != null ? opts.aimHeight : 1,
    takeDamage: function (damage) {
      if (!target.alive || !(damage > 0)) return false;
      target.hp = Math.max(0, target.hp - damage);
      if (opts.onDamage) opts.onDamage(target, damage);
      if (target.hp <= 0) {
        target.alive = false;
        if (opts.onDeath) opts.onDeath(target);
        else if (target.group) target.group.visible = false;
      }
      return true;
    },
  };
  if (group) group.userData.brEntityTarget = target;
  _targets.push(target);
  return target;
}

export function unregisterBackroomsEntityTarget(target) {
  if (!target) return;
  var i = _targets.indexOf(target);
  if (i >= 0) _targets.splice(i, 1);
  if (
    target.group &&
    target.group.userData &&
    target.group.userData.brEntityTarget === target
  ) {
    delete target.group.userData.brEntityTarget;
  }
}

export function getBackroomsEntityTargetFromObject(object) {
  var node = object;
  while (node) {
    if (node.userData && node.userData.brEntityTarget) {
      return node.userData.brEntityTarget;
    }
    node = node.parent;
  }
  return null;
}

/**
 * 是否真正可见：祖先任意一层 visible=false 就看不见。
 * L1.1 这类「同页多子区域」会把未激活的子世界整组隐藏，只看自身 visible 会误判。
 */
export function isBackroomsObjectVisible(object) {
  var node = object;
  while (node) {
    if (node.visible === false) return false;
    node = node.parent;
  }
  return true;
}

/** 返回当前页面仍存活、仍挂在场景中且真正可见的实体根节点 */
export function getBackroomsEntityTargetRoots(out) {
  out = out || [];
  out.length = 0;
  var i;
  for (i = 0; i < _targets.length; i++) {
    var target = _targets[i];
    if (!target.alive || !target.group || !target.group.parent) continue;
    if (!isBackroomsObjectVisible(target.group)) continue;
    out.push(target.group);
  }
  return out;
}
