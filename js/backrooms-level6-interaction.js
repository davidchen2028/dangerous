/**
 * Level 6 交互决策保持纯函数，供键盘、触屏与测试共用。
 */
export function canCompleteLevel6Transition(survival, transitionLock, uiBlocked) {
  return !!survival && !survival.dead && !transitionLock && !uiBlocked;
}

export function chooseLevel6Interaction(kind, opts) {
  opts = opts || {};
  if (
    !kind ||
    !canCompleteLevel6Transition(opts.survival, opts.transitionLock, opts.uiBlocked)
  ) {
    return null;
  }
  if (kind === "l6_exit_l5") return "exit_l5";
  if (kind === "l6_exit_l7") return "exit_l7";
  if (kind === "l6_dead_switch") return "dead_switch";
  if (kind === "l6_iron_door_129") return "iron_door";
  return null;
}

export function getLevel6InteractionLabel(kind, switchUsed) {
  if (kind === "l6_exit_l5") return "返回 Level 5 锅炉房";
  if (kind === "l6_exit_l7") return "沿楼梯井下行至 Level 7";
  if (kind === "l6_dead_switch") {
    return switchUsed ? "电灯开关毫无反应" : "按下电灯开关";
  }
  if (kind === "l6_iron_door_129") return "检查极冷的巨大铁门";
  return "";
}

export function shouldTriggerLevel6Wire(layout, state, px, pz, isNearFeature) {
  if (!layout || !state || state.wireTriggered || typeof isNearFeature !== "function") {
    return false;
  }
  return isNearFeature(layout, "wire", px, pz, 0.78);
}
