import type { ModelOption } from '../intent-routing-section';

export function modelLabel(model: ModelOption): string {
  return `${model.provider || '未绑定供应商'} / ${model.label || model.id}`;
}

export function modelName(models: ModelOption[], id: string): string {
  const model = models.find((item) => item.id === id);
  return model ? modelLabel(model) : id;
}
