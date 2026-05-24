import { seedEpoch } from '../epoch-ledger.mjs';
import { formatSequenceId } from './ids.mjs';

// 纯函数：把控制状态压缩成 checkpoint 指针补丁输入。
export function buildPointerState(controlState, initialCheckpointId) {
  return {
    active_checkpoint_id: controlState.active_checkpoint_id || initialCheckpointId,
    pre_update_ref_checkpoint_id: controlState.pre_update_ref_checkpoint_id ?? null,
    last_stable_checkpoint_id: controlState.last_stable_checkpoint_id || initialCheckpointId,
  };
}

export function buildEpoch({ epochNumber, phase, controlState, initialCheckpointId }) {
  return seedEpoch({
    update_epoch_id: formatSequenceId('epoch', epochNumber),
    phase,
    active_checkpoint_id: controlState.active_checkpoint_id || initialCheckpointId,
    pre_update_ref_checkpoint_id: controlState.pre_update_ref_checkpoint_id ?? null,
    admitted_trajectory_ids: [],
    comparison_results: [],
    completed_comparison_count: 0,
    comparison_failed_count: 0,
    degradation_streak: 0,
    close_reason: null,
    promotion_eligible: false,
  });
}

// 纯函数：创建可恢复控制快照的最小初始形态。
export function createInitialSnapshot(initialCheckpointId) {
  return {
    active_checkpoint_id: initialCheckpointId,
    pre_update_ref_checkpoint_id: null,
    last_stable_checkpoint_id: initialCheckpointId,
    mode: 'collection',
    applied_event_ids: [],
    last_event_id: null,
  };
}
