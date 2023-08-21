import { BinderNode } from "./BinderNode";
import type { AbstractModel, ModelValue } from "./Models";

export const _binderNode = Symbol('binderNode');

export function getBinderNode<M extends AbstractModel<any>, T = ModelValue<M>>(model: M): BinderNode<T, M> {
  if (!model[_binderNode]) {
    model[_binderNode] = new BinderNode(model);
  }

  return model[_binderNode]!;
}
