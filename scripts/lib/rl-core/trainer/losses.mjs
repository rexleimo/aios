import { createTrainerConfig } from './config.mjs';

// 纯函数：计算两个权重向量的平均绝对差，用作轻量 KL 近似。
export function averageAbsoluteDifference(left, right) {
  const size = Math.max(left.length, right.length);
  if (size === 0) return 0;
  let total = 0;
  for (let index = 0; index < size; index += 1) {
    total += Math.abs(Number(left[index] || 0) - Number(right[index] || 0));
  }
  return total / size;
}

// 纯函数：把 RL、蒸馏、KL 三类损失合成为训练总损失。
export function computeLosses({ rlLoss, distillLoss, klLoss, distillationStatus, config = createTrainerConfig() }) {
  const distillLossWeight = distillationStatus === 'applied' ? config.distill_loss_weight : 0;
  return {
    distillLossWeight,
    totalLoss: rlLoss + distillLossWeight * distillLoss + config.kl_loss_weight * klLoss,
  };
}

// 纯函数：按折扣回报生成 advantage/return 序列，供多步轨迹更新复用。
export function computeAdvantages({ rewards, config = createTrainerConfig() }) {
  const sequence = Array.isArray(rewards) ? rewards.map((value) => Number(value || 0)) : [];
  const returns = new Array(sequence.length).fill(0);
  let running = 0;
  for (let index = sequence.length - 1; index >= 0; index -= 1) {
    running = sequence[index] + config.gamma * running;
    returns[index] = running;
  }
  return {
    advantages: [...returns],
    returns,
  };
}
