/**
 * 关卡与 M.E.G. 任务系统之间的薄适配层。
 * 关卡只上报事实，不直接读写任务存档。
 */
import {
  TASK_DEFS,
  deliverMapTask,
  deliverPackageTask,
  getAcceptedTaskIds,
  getTaskDef,
  progressTasksForLevel,
  recordInspectTarget,
  recordReconSighting,
} from "./backrooms-tasks.js";

export function onTaskLevelEntered(levelId, onToast) {
  return progressTasksForLevel(levelId, onToast);
}

export function onTaskMapDraw(levelId) {
  var accepted = getAcceptedTaskIds();
  var results = [];
  for (var i = 0; i < accepted.length; i++) {
    var task = getTaskDef(accepted[i]);
    if (!task || task.type !== "map" || task.drawLevelId !== levelId) continue;
    results.push(deliverMapTask(task.id));
  }
  return results;
}

export function onTaskReconTarget(levelId, targetId) {
  var accepted = getAcceptedTaskIds();
  var results = [];
  for (var i = 0; i < accepted.length; i++) {
    var task = getTaskDef(accepted[i]);
    if (!task || task.type !== "recon" || task.reconLevelId !== levelId) continue;
    results.push(recordReconSighting(task.id, String(targetId)));
  }
  return results;
}

export function onTaskInspect(taskId, targetId) {
  return recordInspectTarget(taskId, String(targetId));
}

export function onTaskPackageHandoff(levelId) {
  var accepted = getAcceptedTaskIds();
  var results = [];
  for (var i = 0; i < accepted.length; i++) {
    var task = getTaskDef(accepted[i]);
    if (!task || task.type !== "package" || task.destinationLevelId !== levelId) continue;
    results.push(deliverPackageTask(task.id));
  }
  return results;
}

export function taskRuntimeBindings() {
  return TASK_DEFS.map(function (task) {
    return {
      id: task.id,
      lane: task.lane,
      type: task.type,
      levels:
        task.fieldLevelIds ||
        [task.drawLevelId || task.reconLevelId || task.destinationLevelId].filter(Boolean),
    };
  });
}
