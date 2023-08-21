import { useState } from "react";
import { BinderNode } from "./src/BinderNode";
import { getBinderNode } from "./src/BinderNodeHelpers";
import { AbstractModel } from "./src/Models";
import { Dispatch } from "./src/StoreAdapter";
import { Validator, ValueError } from "./src/Validation";

export type ContextNode<T, M extends AbstractModel<T>> = Readonly<{
  model: M,
  name: string,
  required: boolean,
  value: T | undefined,
  setValue: Dispatch<T | undefined>,
  defaultValue: T,
  dirty: boolean,
  visited: boolean,
  setVisited: Dispatch<boolean>,
  validators: ReadonlyArray<Validator<T>>,
  setValidators: Dispatch<ReadonlyArray<Validator<T>>>,
  parent: ContextNode<unknown, AbstractModel<unknown>>,
  root: ContextRoot<unknown, AbstractModel<unknown>>,
  validate: () => Promise<ReadonlyArray<ValueError<unknown>>>,
  errors: ReadonlyArray<ValueError<unknown>>,
  ownErrors: ReadonlyArray<ValueError<T>>,
  invalid: boolean,
}>;

export type ContextRoot<T, M extends AbstractModel<T>> = ContextNode<T, M> & Readonly<{
}>;

export function useBinderNode<T, M extends AbstractModel<T>>(model: M): ContextNode<T, M> {
  const binderNode = getBinderNode(model) as BinderNode<T, M>;
  binderNode.delegateTo(useState);
  return {
    model,
    name: binderNode.name,
    required: binderNode.required,
    value: binderNode.value,
    setValue: (value: T | undefined) => binderNode.value = value,
    defaultValue: binderNode.defaultValue,
    dirty: binderNode.dirty,
    visited: binderNode.visited,
    setVisited: (visited) => binderNode.visited = visited,
    validators: binderNode.validators,
    setValidators: (validators) => binderNode.validators = validators,
    get parent() {
      return useBinderNode(((binderNode.parent || binderNode) as BinderNode<unknown, AbstractModel<unknown>>).model);
    },
    get root() {
      return useBinderNode(binderNode.binder.model);
    },
    validate: () => (binderNode.validate() as Promise<ReadonlyArray<ValueError<unknown>>>),
    errors: binderNode.errors,
    ownErrors: binderNode.ownErrors,
    invalid: binderNode.invalid,
  };
}