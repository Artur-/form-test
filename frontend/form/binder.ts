import { Ref, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AbstractModel, ModelConstructor, ModelValue, _fromString, hasFromString } from "./src/Models.js";
import { BinderRoot, BinderRootConfiguration } from "./src/BinderRoot.js";
import { useBinderNode } from "./binderNode.js";
import { AbstractFieldStrategy, FieldElement, getDefaultFieldStrategy } from "./src/Field.js";

export function createBinder<T, M extends AbstractModel<T>>(Model: ModelConstructor<T, M>, config?: BinderRootConfiguration<T>) {
  const emptyValue = Model.createEmptyValue();
  return new BinderRoot(Model, config);
}

export function useBinder<T, M extends AbstractModel<T>>(Model: ModelConstructor<T, M>, config?: BinderRootConfiguration<T>) {
  const binder = useMemo(() => createBinder(Model, config), []);
  // binder.delegateTo(useState);
  return {
    ...useBinderNode<T, M>(binder.model),
    submit: () => binder.submit(),
    reset: () => binder.reset(),
    clear: () => binder.clear()
  };
}

export function useField<M extends AbstractModel<any>, T = ModelValue<M>>(model: M) {
  const contextNode = useBinderNode<T, M>(model);

  const fieldRef = useRef<FieldElement<T>>(null);
  const strategyRef = useRef<AbstractFieldStrategy<T> | null>(null);

  useEffect(() => {
    strategyRef.current = getDefaultFieldStrategy(fieldRef.current!, model);
  }, [fieldRef.current, model]);

  useEffect(() => {
    strategyRef.current!.value = contextNode.value!;
  }, [strategyRef.current, contextNode.value]);

  useEffect(() => {
    strategyRef.current!.required = contextNode.required;
  }, [strategyRef.current, contextNode.required])

  useEffect(() => {
    strategyRef.current!.invalid = contextNode.invalid!;
  }, [strategyRef.current, contextNode.invalid]);

  useEffect(() => {
    strategyRef.current!.errorMessage = contextNode.ownErrors[0]?.message || "";
  }, [strategyRef.current, (contextNode.ownErrors[0]?.message || "")]);

  const updateValueEvent = (e: any) => {
    const elementValue = strategyRef.current!.value;
    const value = typeof elementValue === "string" && hasFromString(model) ? model[_fromString](elementValue) : elementValue;
    contextNode.setValue(value);
  }

  return {
    name: contextNode.name,
    ref: fieldRef as Ref<any>,
    // value: contextNode.value,
    // invalid: contextNode.invalid,
    // errorMessage: contextNode.ownErrors[0]?.message || "",
    onBlur: (e: any) => {
      updateValueEvent(e);
      contextNode.setVisited(true);
    },
    onChange: updateValueEvent,
    onInput: updateValueEvent
  }
}
