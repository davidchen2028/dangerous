export function chooseLevel4Interaction(kind, mode, state) {
  state = state || {};
  if (!kind) return "";
  if (mode === "secondary") {
    if (kind === "l4_task_board") return "task_board";
    if (kind === "l4_water_cooler") return "inspect_cooler";
    return "";
  }
  if (kind === "l4_elevator_l3") return "exit_l3";
  if (kind === "l4_stairs_down") return "exit_l5";
  if (kind === "l4_vending_l61") return "exit_l61";
  if (kind === "l4_false_window") return "false_window";
  if (kind === "l4_bntg_liaison") return "bntg";
  if (kind === "l4_meg_member") return "meg";
  if (kind === "l4_storage_clerk") return "storage";
  if (kind === "wanderer") return "wanderer";
  if (kind === "l4_task_board") return mode === "smart" ? "task_board" : "";
  if (kind === "l4_water_cooler") {
    if (mode === "smart" && state.inspectTask && !state.inspected) {
      return "inspect_cooler";
    }
    return "water";
  }
  return "";
}

export function canCompleteLevel4Transition(survival) {
  return !!survival && !survival.dead;
}

export function isPlayerNearLevel4FalseWindow(px, pz, data) {
  if (!data || data.kind !== "l4_false_window") return false;
  var normalDistance = data.along ? Math.abs(pz - data.z) : Math.abs(px - data.x);
  var spanDistance = data.along ? Math.abs(px - data.x) : Math.abs(pz - data.z);
  return normalDistance <= 0.82 && spanDistance <= 10.8;
}
