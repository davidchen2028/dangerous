/**
 * 后室地面掉落物：玩家按 G 丢下的快捷栏物品。
 *
 * 掉落记录按“空间”保存（例如 Level 0 主世界、马尼拉房间），坐标为世界坐标。
 * 空间根节点重建时重新挂上网格，所以离开再回来东西还在原地；整页刷新后清空。
 */
import * as THREE from "three";
import {
  requestAlmondBottleModel,
  ALMOND_BOTTLE_HEIGHT,
  ALMOND_BOTTLE_SOURCE_HEIGHT,
} from "./backrooms-almond-bottle.js";

export const DROPPED_ITEM_KIND = "dropped_item";

const MAX_DROPS_PER_SPACE = 40;
const FALL_SECONDS = 0.45;

export function createWorldDrops() {
  /** @type {Map<string, Array<{ id: number, item: { id: string, name: string }, x: number, y: number, z: number, yaw: number }>>} */
  var records = new Map();
  /** @type {Map<string, { root: THREE.Object3D, holder: THREE.Group, pickMeshes: THREE.Mesh[] }>} */
  var attached = new Map();
  var nextId = 1;

  var crateGeometry = new THREE.BoxGeometry(0.26, 0.18, 0.2).translate(0, 0.09, 0);
  var crateMaterial = new THREE.MeshStandardMaterial({ color: 0x8a6a3c, roughness: 0.85 });
  var pickGeometry = new THREE.BoxGeometry(0.5, 0.6, 0.5).translate(0, 0.3, 0);
  var pickMaterial = new THREE.MeshBasicMaterial({ visible: false });
  var fallbackBottleGeometry = new THREE.CylinderGeometry(0.06, 0.065, ALMOND_BOTTLE_HEIGHT, 10).translate(
    0,
    ALMOND_BOTTLE_HEIGHT * 0.5,
    0
  );
  var fallbackBottleMaterial = new THREE.MeshStandardMaterial({
    color: 0xe8ece6,
    roughness: 0.4,
  });

  function listFor(space) {
    var list = records.get(space);
    if (!list) {
      list = [];
      records.set(space, list);
    }
    return list;
  }

  function buildVisual(record) {
    var node = new THREE.Group();
    node.name = "DroppedItem:" + record.item.id;
    node.userData.dropId = record.id;
    if (record.item.id === "almond_water") {
      var fallback = new THREE.Mesh(fallbackBottleGeometry, fallbackBottleMaterial);
      node.add(fallback);
      requestAlmondBottleModel(function (template) {
        if (!template || !fallback.parent) return;
        node.remove(fallback);
        var bottle = new THREE.Mesh(template.geometry, template.material);
        bottle.scale.setScalar(ALMOND_BOTTLE_HEIGHT / ALMOND_BOTTLE_SOURCE_HEIGHT);
        node.add(bottle);
      });
    } else {
      node.add(new THREE.Mesh(crateGeometry, crateMaterial));
    }
    var pick = new THREE.Mesh(pickGeometry, pickMaterial);
    pick.name = "DroppedItemPick";
    pick.userData.brInteract = { kind: DROPPED_ITEM_KIND, dropId: record.id };
    node.add(pick);
    return { node: node, pick: pick };
  }

  function placeNode(entry, record, node) {
    var shownY = record.fromY + (record.y - record.fromY) * record.fall * record.fall;
    var local = new THREE.Vector3(record.x, shownY, record.z);
    entry.root.updateWorldMatrix(true, false);
    entry.root.worldToLocal(local);
    node.position.copy(local);
  }

  function mountRecord(entry, record) {
    var built = buildVisual(record);
    built.node.rotation.y = record.yaw;
    placeNode(entry, record, built.node);
    entry.holder.add(built.node);
    entry.pickMeshes.push(built.pick);
    entry.nodes.set(record.id, built.node);
  }

  /** 把某个空间的掉落物挂到新的根节点上（进入房间、重建场景时调用）。 */
  function attachSpace(space, root) {
    detachSpace(space);
    if (!root) return;
    var holder = new THREE.Group();
    holder.name = "WorldDrops:" + space;
    root.add(holder);
    var entry = { root: root, holder: holder, pickMeshes: [], nodes: new Map() };
    attached.set(space, entry);
    var list = listFor(space);
    for (var i = 0; i < list.length; i++) mountRecord(entry, list[i]);
  }

  /** 在根节点销毁前摘下掉落物，记录保留。 */
  function detachSpace(space) {
    var entry = attached.get(space);
    if (!entry) return;
    if (entry.holder.parent) entry.holder.parent.remove(entry.holder);
    entry.holder.clear();
    entry.pickMeshes.length = 0;
    entry.nodes.clear();
    attached.delete(space);
  }

  /**
   * @param {string} space
   * @param {{ id: string, name: string }} item
   * @param {{ x: number, y?: number, z: number, yaw?: number }} at 世界坐标
   * @returns {boolean}
   */
  function drop(space, item, at) {
    if (!item || !item.id || !at) return false;
    var list = listFor(space);
    if (list.length >= MAX_DROPS_PER_SPACE) return false;
    var record = {
      id: nextId++,
      item: { id: item.id, name: item.name || item.id },
      x: at.x,
      y: Number.isFinite(at.y) ? at.y : 0,
      z: at.z,
      yaw: Number.isFinite(at.yaw) ? at.yaw : 0,
      fromY: Number.isFinite(at.fromY) ? at.fromY : (Number.isFinite(at.y) ? at.y : 0),
      fall: Number.isFinite(at.fromY) && at.fromY !== at.y ? 0 : 1,
    };
    list.push(record);
    var entry = attached.get(space);
    if (entry) mountRecord(entry, record);
    return true;
  }

  function findRecord(space, dropId) {
    var list = records.get(space);
    if (!list) return -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === dropId) return i;
    }
    return -1;
  }

  /** @returns {{ id: string, name: string } | null} */
  function peek(space, data) {
    if (!data || data.kind !== DROPPED_ITEM_KIND) return null;
    var index = findRecord(space, data.dropId);
    if (index < 0) return null;
    return records.get(space)[index].item;
  }

  /** 从地上移除并返回物品；调用方负责放进背包，失败时用 drop 放回。 */
  function take(space, data) {
    if (!data || data.kind !== DROPPED_ITEM_KIND) return null;
    var index = findRecord(space, data.dropId);
    if (index < 0) return null;
    var record = records.get(space).splice(index, 1)[0];
    var entry = attached.get(space);
    if (entry) {
      for (var i = entry.pickMeshes.length - 1; i >= 0; i--) {
        var pick = entry.pickMeshes[i];
        if (pick.userData.brInteract.dropId !== record.id) continue;
        entry.pickMeshes.splice(i, 1);
        entry.nodes.delete(record.id);
        if (pick.parent && pick.parent.parent) pick.parent.parent.remove(pick.parent);
      }
    }
    return record.item;
  }

  /** 放回刚取走的物品（背包满时），保持原位置。 */
  function restore(space, item, at) {
    return drop(space, item, at);
  }

  function getPickMeshes(space) {
    var entry = attached.get(space);
    return entry ? entry.pickMeshes : [];
  }

  function getRecordPosition(space, data) {
    if (!data) return null;
    var index = findRecord(space, data.dropId);
    if (index < 0) return null;
    var record = records.get(space)[index];
    return { x: record.x, y: record.y, z: record.z, yaw: record.yaw };
  }

  function update(dt) {
    var step = Math.min(0.05, Math.max(0, dt)) / FALL_SECONDS;
    if (!step) return;
    attached.forEach(function (entry, space) {
      var list = records.get(space);
      if (!list) return;
      var i;
      for (i = 0; i < list.length; i++) {
        var record = list[i];
        if (record.fall >= 1) continue;
        record.fall = Math.min(1, record.fall + step);
        var node = entry.nodes.get(record.id);
        if (node) placeNode(entry, record, node);
      }
    });
  }

  function dispose() {
    attached.forEach(function (_entry, space) {
      detachSpace(space);
    });
    records.clear();
    crateGeometry.dispose();
    crateMaterial.dispose();
    pickGeometry.dispose();
    pickMaterial.dispose();
    fallbackBottleGeometry.dispose();
    fallbackBottleMaterial.dispose();
  }

  return {
    attachSpace: attachSpace,
    detachSpace: detachSpace,
    drop: drop,
    update: update,
    peek: peek,
    take: take,
    restore: restore,
    getPickMeshes: getPickMeshes,
    getRecordPosition: getRecordPosition,
    dispose: dispose,
  };
}
