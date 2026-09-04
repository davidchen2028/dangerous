export function canStartLevel3Elevator(state) {
  return !!(
    state &&
    !state.transitionLock &&
    !state.elevatorRising &&
    !state.inventoryOpen &&
    !state.dead &&
    state.near
  );
}

export function getLevel3ElevatorRiseAction(elevatorRising, dead, progress) {
  if (!elevatorRising) return "idle";
  if (dead) return "cancel";
  return progress >= 1 ? "complete" : "continue";
}

export function createLevel3TapInteraction(tryStartElevator) {
  return { onTapInteract: tryStartElevator };
}
