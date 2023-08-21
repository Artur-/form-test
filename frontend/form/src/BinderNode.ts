/*
 * Copyright 2000-2020 Vaadin Ltd.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 */
// TODO: Fix dependency cycle

import type { Binder } from './Binder.js';
import { _binderNode, getBinderNode } from './BinderNodeHelpers.js';
import { BinderRoot } from './BinderRoot.js';
import {
  _ItemModel,
  _key,
  _parent,
  _validators as _initialValidators,
  AbstractModel,
  ArrayModel,
  type ModelConstructor,
  type ModelValue,
  ObjectModel,
} from './Models.js';
import { StoreAdapter, StoreFactory } from './StoreAdapter.js';
import type { Validator, ValueError } from './Validation.js';
import { ValidityStateValidator } from './Validators.js';
import { _validity } from './Validity.js';

function getErrorPropertyName(valueError: ValueError<any>): string {
  return typeof valueError.property === 'string' ? valueError.property : getBinderNode(valueError.property).name;
}

const _visited = Symbol('_visited');
const _validators = Symbol('_validators');
const _ownErros = Symbol('_ownErros');

/**
 * The BinderNode<T, M> class provides the form binding related APIs
 * with respect to a particular model instance.
 *
 * Structurally, model instances form a tree, in which the object
 * and array models have child nodes of field and array item model
 * instances.
 */
export class BinderNode<T, M extends AbstractModel<T>> {
  public readonly model: M;

  private [_visited] = new StoreAdapter<boolean>(false);

  private [_validators] = new StoreAdapter<ReadonlyArray<Validator<T>>>([]);

  private [_ownErros] = new StoreAdapter<ReadonlyArray<ValueError<T>>>([]);

  private defaultArrayItemValue?: T;

  /**
   * The validity state read from the bound element, if any. Represents the
   * HTML element internal validation.
   *
   * For elements with `validity.valid === false`, the value in the
   * bound element is considered as invalid.
   */
  public [_validity]?: ValidityState;

  private readonly validityStateValidator: ValidityStateValidator<T>;

  public constructor(model: M) {
    this.model = model;
    model[_binderNode] = this;
    this.validityStateValidator = new ValidityStateValidator<T>();
    this.initializeValue();
    this[_validators].value = model[_initialValidators];
  }

  public delegateTo(useState: StoreFactory) {
    this[_visited].delegateTo(useState);
    this[_validators].delegateTo(useState);
    this[_ownErros].delegateTo(useState);
  }

  public undelegate() {
    this[_visited].undelegate();
    this[_validators].undelegate();
    this[_ownErros].undelegate();
  }

  /**
   * The parent node, if this binder node corresponds to a nested model,
   * otherwise undefined for the top-level binder.
   */
  public get parent(): BinderNode<any, AbstractModel<any>> | undefined {
    const modelParent = this.model[_parent];
    const parentNode = modelParent instanceof AbstractModel ? getBinderNode(modelParent) : undefined;
    return (parentNode === this) ? undefined : parentNode;
  }

  /**
   * The binder for the top-level model.
   */
  public get binder(): Binder<any, AbstractModel<any>> {
    return this.parent ? this.parent.binder : (this as any);
  }

  get #binderRoot(): BinderRoot<unknown, AbstractModel<unknown>> {
    return this.parent ? this.parent.#binderRoot : (this as any);
  }

  /**
   * The name generated from the model structure, used to set the name
   * attribute on the field components.
   */
  public get name(): string {
    let model = this.model as AbstractModel<any>;
    const strings = [];
    while (model[_parent] instanceof AbstractModel) {
      strings.unshift(String(model[_key]));
      model = model[_parent] as AbstractModel<any>;
    }
    return strings.join('.');
  }

  /**
   * The current value related to the model
   */
  public get value(): T | undefined {
    const parent = this.parent || this.binder;
    if (parent.value === undefined) {
      parent.initializeValue(true);
    }
    return parent.value[this.model[_key]];
  }

  public set value(value: T | undefined) {
    if (value !== this.value) {
      this.setValueState(value);
    }
  }

  /**
   * The default value related to the model
   */
  public get defaultValue(): T {
    const parent = this.parent || this.binder;
    if (this.parent && this.parent.model instanceof ArrayModel) {
      if (!this.parent.defaultArrayItemValue) {
        this.parent.defaultArrayItemValue = this.parent.model[_ItemModel].createEmptyValue();
      }

      return this.parent.defaultArrayItemValue;
    }

    return (this.parent || this.binder).defaultValue[this.model[_key]];
  }

  /**
   * True if the current value is different from the defaultValue.
   */
  public get dirty(): boolean {
    return this.value !== this.defaultValue;
  }

  /**
   * The array of validators for the model. The default value is defined in the
   * model.
   */
  public get validators(): ReadonlyArray<Validator<T>> {
    return this[_validators].value;
  }

  public set validators(validators: ReadonlyArray<Validator<T>>) {
    this[_validators].value = validators;
  }

  /**
   * Returns a binder node for the nested model instance.
   *
   * @param model The nested model instance
   */
  public for<NM extends AbstractModel<any>>(model: NM): BinderNode<ReturnType<NM['valueOf']>, NM> {
    const binderNode = getBinderNode(model);
    if (binderNode.binder !== this.binder) {
      throw new Error('Unknown binder');
    }

    return binderNode;
  }

  /**
   * Runs all validation callbacks potentially affecting this
   * or any nested model. Returns the combined array of all
   * errors as in the errors property.
   */
  public async validate(): Promise<ReadonlyArray<ValueError<any>>> {
    // TODO: Replace reduce() with flat() when the following issue is solved
    //  https://github.com/vaadin/flow/issues/8658
    const errors = (
      await Promise.all([...this.requestValidationOfDescendants(), ...this.requestValidationWithAncestors()])
    )
      .reduce((acc, val) => acc.concat(val), [])
      .filter((valueError) => valueError) as ReadonlyArray<ValueError<any>>;
    this.setErrorsWithDescendants(errors.length ? errors : undefined);
    this.update();
    return errors;
  }

  /**
   * A helper method to add a validator
   *
   * @param validator a validator
   */
  public addValidator(validator: Validator<T>) {
    this[_validators].value = [...this.validators, validator];
  }

  /**
   * True if the bound field was ever focused and blurred by the user.
   */
  public get visited() {
    return this[_visited].value;
  }

  public set visited(v) {
    if (this[_visited].value !== v) {
      this[_visited].value = v;
      this.updateValidation();
    }
  }

  /**
   * The combined array of all errors for this node’s model and all its nested
   * models
   */
  public get errors(): ReadonlyArray<ValueError<any>> {
    const descendantsErrors = [...this.getChildBinderNodes()].reduce(
      (errors, childBinderNode) => [...errors, ...childBinderNode.errors],
      [] as ReadonlyArray<any>,
    );
    return descendantsErrors.concat(this.ownErrors);
  }

  /**
   * The array of validation errors directly related with the model.
   */
  public get ownErrors() {
    return this[_ownErros].value;
  }

  /**
   * Indicates if there is any error for the node's model.
   */
  public get invalid() {
    return this.errors.length > 0;
  }

  /**
   * True if the value is required to be non-empty.
   */
  public get required() {
    return this.validators.some((validator) => validator.impliesRequired);
  }

  /**
   * Append an item to the array value.
   *
   * Requires the context model to be an array reference.
   *
   * @param itemValue optional new item value, an empty item is
   * appended if the argument is omitted
   */
  public appendItem<IT extends ModelValue<M extends ArrayModel<any, infer IM> ? IM : never>>(itemValue?: IT) {
    if (!(this.model instanceof ArrayModel)) {
      throw new Error('Model is not an array');
    }

    if (!itemValue) {
      itemValue = this.model[_ItemModel].createEmptyValue();
    }
    this.value = [...(this.value as unknown as ReadonlyArray<IT>), itemValue] as unknown as T;
  }

  /**
   * Prepend an item to the array value.
   *
   * Requires the context model to be an array reference.
   *
   * @param itemValue optional new item value, an empty item is prepended if
   * the argument is omitted
   */
  public prependItem<IT extends ModelValue<M extends ArrayModel<any, infer IM> ? IM : never>>(itemValue?: IT) {
    if (!(this.model instanceof ArrayModel)) {
      throw new Error('Model is not an array');
    }

    if (!itemValue) {
      itemValue = this.model[_ItemModel].createEmptyValue();
    }
    this.value = [itemValue, ...(this.value as unknown as ReadonlyArray<IT>)] as unknown as T;
  }

  /**
   * Remove itself from the parent array value.
   *
   * Requires the context model to be an array item reference.
   */
  public removeSelf() {
    if (!(this.model[_parent] instanceof ArrayModel)) {
      throw new TypeError('Model is not an array item');
    }
    const itemIndex = this.model[_key] as number;
    this.parent!.value = (this.parent!.value as ReadonlyArray<T>).filter((_, i) => i !== itemIndex);
  }

  protected clearValidation(): boolean {
    if (this.visited) {
      this.visited = false;
    }
    let needsUpdate = false;
    if (this.ownErrors.length) {
      this[_ownErros].value = [];
      needsUpdate = true;
    }
    if ([...this.getChildBinderNodes()].filter((childBinderNode) => childBinderNode.clearValidation()).length > 0) {
      needsUpdate = true;
    }
    return needsUpdate;
  }

  protected async updateValidation() {
    if (this.visited) {
      await this.validate();
    } else if (this.dirty || this.invalid) {
      await Promise.all([...this.getChildBinderNodes()].map((childBinderNode) => childBinderNode.updateValidation()));
    }
  }

  protected update(_?: T): void {
    if (this.parent) {
      this.parent.update();
    }
  }

  protected setErrorsWithDescendants(errors?: ReadonlyArray<ValueError<any>>) {
    if (errors === undefined) {
      return;
    }

    const { name } = this;
    const ownErrors = errors.filter((valueError) => getErrorPropertyName(valueError) === name);
    const relatedErrors = errors.filter((valueError) => getErrorPropertyName(valueError).startsWith(name));
    this[_ownErros].value = ownErrors;
    for (const childBinderNode of this.getChildBinderNodes()) {
      childBinderNode.setErrorsWithDescendants(relatedErrors);
    }
  }

  private *getChildBinderNodes(): Generator<BinderNode<unknown, AbstractModel<unknown>>> {
    if (this.value === undefined) {
      // Undefined value cannot have child properties and items.
      return;
    }

    if (this.model instanceof ObjectModel) {
      // We need to skip all non-initialised optional fields here in order to
      // prevent infinite recursion for circular references in the model.
      // Here we rely on presence of keys in `defaultValue` to detect all
      // initialised fields. The keys in `defaultValue` are defined for all
      // non-optional fields plus those optional fields whose values were set
      // from initial `binder.read()` or `binder.clear()` or by using a
      // binder node (e. g., form binding) for a nested field.
      if (this.defaultValue) {
        for (const [, getter] of ObjectModel.getOwnAndParentGetters(this.model)) {
          const childModel = getter.call(this.model) as AbstractModel<unknown>;
          if (childModel) {
            yield getBinderNode(childModel);
          }
        }
      }
    } else if (this.model instanceof ArrayModel) {
      for (const childBinderNode of this.model) {
        yield childBinderNode;
      }
    }
  }

  private runOwnValidators(): ReadonlyArray<Promise<ReadonlyArray<ValueError<any>>>> {
    if (this[_validity] && !this[_validity].valid) {
      // The element's internal validation reported invalid state.
      // This means the `value` cannot be used and even meaningfully
      // validated with the validators in the binder, because it is
      // possibly cannot be parsed due to bad input in the element,
      // for example, if date is typed with incorrect format.
      //
      // Skip running the validators, and instead assume the error
      // from the validity state.
      return [this.#binderRoot.requestValidation(this.model, this.validityStateValidator)];
    }

    return this.validators.map((validator) => this.#binderRoot.requestValidation(this.model, validator));
  }

  private requestValidationOfDescendants(): ReadonlyArray<Promise<ReadonlyArray<ValueError<any>>>> {
    return [...this.getChildBinderNodes()].reduce(
      (promises, childBinderNode) => [
        ...promises,
        ...childBinderNode.runOwnValidators(),
        ...childBinderNode.requestValidationOfDescendants(),
      ],
      [] as ReadonlyArray<Promise<ReadonlyArray<ValueError<any>>>>,
    );
  }

  private requestValidationWithAncestors(): ReadonlyArray<Promise<ReadonlyArray<ValueError<any>>>> {
    return [...this.runOwnValidators(), ...(this.parent ? this.parent.requestValidationWithAncestors() : [])];
  }

  protected initializeValue(requiredByChildNode = false) {
    // First, make sure parents have value initialized
    if (this.parent && (this.parent.value === undefined || this.parent.defaultValue === undefined)) {
      this.parent.initializeValue(true);
    }

    let value = this.parent ? this.parent.value[this.model[_key]] : undefined;

    if (value === undefined) {
      // Initialize value if a child node is accessed or for the root-level node
      if (requiredByChildNode || !this.parent) {
        value = value !== undefined ? value : (this.model.constructor as ModelConstructor<T, M>).createEmptyValue();
        this.setValueState(value, this.defaultValue === undefined);
      } else if (this.parent && this.parent.model instanceof ObjectModel && !(this.model[_key] in this.parent.value)) {
        this.setValueState(undefined, this.defaultValue === undefined);
      }
    }
  }

  private setValueState(value: T | undefined, keepPristine = false) {
    const modelParent = this.model[_parent];
    if (modelParent instanceof ObjectModel) {
      // Value contained in object - replace object in parent
      const object = {
        ...this.parent!.value,
        [this.model[_key]]: value,
      };
      this.parent!.setValueState(object, keepPristine);
      return;
    }

    if (value === undefined) {
      throw new TypeError('Unexpected undefined value');
    }

    if (modelParent instanceof ArrayModel) {
      // Value contained in array - replace array in parent
      const array = (this.parent!.value as ReadonlyArray<T>).slice();
      array[this.model[_key] as number] = value;
      this.parent!.setValueState(array, keepPristine);
    } else {
      // Value contained elsewhere, probably binder - use value property setter
      const binder = modelParent as Binder<T, M>;
      if (keepPristine && !binder.dirty) {
        binder.defaultValue = value;
      }
      binder.value = value!;
    }
  }
}