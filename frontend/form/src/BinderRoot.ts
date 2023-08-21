import { BinderNode } from "./BinderNode.js";
import { StoreAdapter, StoreFactory } from "./StoreAdapter.js";
import { AbstractModel, ModelConstructor, _validators, _parent } from "./Models.js";
import { InterpolateMessageCallback, ServerValidator, ValidationError, Validator, ValueError, runValidator } from "./Validation.js";
import { FieldStrategy, getDefaultFieldStrategy } from "./Field.js";

const _emptyValue = Symbol('emptyValue');
const _value = Symbol('value');
const _defaultValue = Symbol('defaultValue');
const _submitting = Symbol('submitting');
const _onSubmit = Symbol('onSubmit');
const _validations = Symbol('validations');
const _validating = Symbol('validating');
const _validationRequest = Symbol('validationRequest');

export class BinderRoot<T, M extends AbstractModel<T>> extends BinderNode<T, M> {
  private [_emptyValue]: T;
  private [_value]: StoreAdapter<T>;
  private [_defaultValue]: StoreAdapter<T>;
  private [_submitting] = new StoreAdapter<boolean>(false);
  private [_validating] = new StoreAdapter<boolean>(false);
  private [_onSubmit]?: (value: T) => Promise<T | void>;
  private [_validationRequest]?: Promise<void>;

  private [_validations]: Map<AbstractModel<any>, Map<Validator<any>, Promise<ReadonlyArray<ValueError<any>>>>> =
    new Map();

  public static interpolateMessageCallback?: InterpolateMessageCallback<any>;

  constructor(Model: ModelConstructor<T, M>, config?: BinderRootConfiguration<T>) {
    const emptyValue = Model.createEmptyValue();
    const valueStoreAdapter = new StoreAdapter(emptyValue);
    const model = new Model(valueStoreAdapter, 'value', false);
    super(model);
    // @ts-ignore
    this.model[_parent] = this;
    this[_emptyValue] = emptyValue;
    this[_value] = valueStoreAdapter;
    this[_defaultValue] = new StoreAdapter(emptyValue);
    this[_onSubmit] = config?.onSubmit || this[_onSubmit];
    this.read(this[_emptyValue]);
  }

  public override delegateTo(useState: StoreFactory) {
    this[_value].delegateTo(useState);
    this[_defaultValue].delegateTo(useState);
    this[_submitting].delegateTo(useState);
    this[_validating].delegateTo(useState);
  }

  public undelegate() {
    this[_value].undelegate();
    this[_defaultValue].undelegate();
    this[_submitting].undelegate();
    this[_validating].undelegate();
  }

  public override get value() {
    return this[_value].value;
  }

  public override set value(value: T) {
    const oldValue = this[_value].value;
    if (value === oldValue) {
      return;
    }

    this[_value].value = value;
    this.update(oldValue);
    this.updateValidation();
  }

  public override get defaultValue() {
    return this[_defaultValue].value;
  }

  public override set defaultValue(defaultValue: T) {
    this[_defaultValue].value = defaultValue;
  }

  /**
   * Read the given value into the form and clear validation errors
   *
   * @param value Sets the argument as the new default
   * value before resetting, otherwise the previous default is used.
   */
  public read(value: T) {
    this.defaultValue = value;
    if (
      // Skip when no value is set yet (e. g., invoked from constructor)
      this.value &&
      // Clear validation state, then proceed if update is needed
      this.clearValidation() &&
      // When value is dirty, another update is coming from invoking the value
      // setter below, so we skip this one to prevent duplicate updates
      this.value === value
    ) {
      this.update(this.value);
    }

    this.value = this.defaultValue;
  }

  /**
   * Reset the form to the previous value
   */
  public reset() {
    this.read(this.defaultValue);
  }

  /**
   * Sets the form to empty value, as defined in the Model.
   */
  public clear() {
    this.read(this[_emptyValue]);
  }

  /**
   * Submit the current form value to a predefined
   * onSubmit callback.
   *
   * It's a no-op if the onSubmit callback is undefined.
   */
  public async submit(): Promise<T | void> {
    if (this[_onSubmit] !== undefined) {
      return this.submitTo(this[_onSubmit]);
    }
    return undefined;
  }

  /**
   * Submit the current form value to callback
   *
   * @param endpointMethod the callback function
   */
  public async submitTo<V>(endpointMethod: (value: T) => Promise<V>): Promise<V> {
    const errors = await this.validate();
    if (errors.length) {
      throw new ValidationError(errors);
    }

    this[_submitting].value = true;
    this.update(this.value);
    try {
      return await endpointMethod.call(this.getCallbackContext(), this.value);
    } catch (error: any) {
      if (error.validationErrorData && error.validationErrorData.length) {
        const valueErrors: Array<ValueError<any>> = [];
        error.validationErrorData.forEach((data: any) => {
          const res =
            /Object of type '(.+)' has invalid property '(.+)' with value '(.+)', validation error: '(.+)'/.exec(
              data.message,
            );
          const [property, value, message] = res ? res.splice(2) : [data.parameterName, undefined, data.message];
          valueErrors.push({ property, value, validator: new ServerValidator(message), message });
        });
        this.setErrorsWithDescendants(valueErrors);
        throw new ValidationError(valueErrors);
      }

      throw error;
    } finally {
      this[_submitting].value = false;
      this.defaultValue = this.value;
      this.update(this.value);
    }
  }

  public async requestValidation<NT, NM extends AbstractModel<NT>>(
    model: NM,
    validator: Validator<NT>,
  ): Promise<ReadonlyArray<ValueError<NT>>> {
    let modelValidations: Map<Validator<NT>, Promise<ReadonlyArray<ValueError<NT>>>>;
    if (this[_validations].has(model)) {
      modelValidations = this[_validations].get(model) as Map<Validator<NT>, Promise<ReadonlyArray<ValueError<NT>>>>;
    } else {
      modelValidations = new Map();
      this[_validations].set(model, modelValidations);
    }

    await this.performValidation();

    if (modelValidations.has(validator)) {
      return modelValidations.get(validator) as Promise<ReadonlyArray<ValueError<NT>>>;
    }

    const promise = runValidator(model, validator, BinderRoot.interpolateMessageCallback);
    modelValidations.set(validator, promise);
    const valueErrors = await promise;

    modelValidations.delete(validator);
    if (modelValidations.size === 0) {
      this[_validations].delete(model);
    }
    if (this[_validations].size === 0) {
      this.completeValidation();
    }

    return valueErrors;
  }

  /**
   * Determines and returns the field directive strategy for the bound element.
   * Override to customise the binding strategy for a component.
   * The Binder extends BinderNode, see the inherited properties and methods below.
   *
   * @param elm the bound element
   * @param model the bound model
   */
  public getFieldStrategy<T>(elm: any, model?: AbstractModel<T>): FieldStrategy {
    return getDefaultFieldStrategy(elm, model);
  }

  /**
   * Indicates the submitting status of the form.
   * True if the form was submitted, but the submit promise is not resolved yet.
   */
  public get submitting() {
    return this[_submitting].value;
  }

  /**
   * Indicates the validating status of the form.
   * True when there is an ongoing validation.
   */
  public get validating() {
    return this[_validating].value;
  }

  protected getCallbackContext(): any {
    return this;
  }

  protected performValidation(): Promise<void> | void {
    if (!this[_validationRequest]) {
      this[_validating].value = true;
      this[_validationRequest] = Promise.resolve().then(() => {
        this[_validationRequest] = undefined;
      });
    }
    return this[_validationRequest];
  }

  protected completeValidation() {
    this[_validating].value = false;
  }

  protected override initializeValue(requiredByChildNode: boolean = false) {
    if (requiredByChildNode) {
      super.initializeValue(requiredByChildNode);
    }
    // No-op
  }
}

export type BinderRootConfiguration<T> = Readonly<{
  onSubmit?: (value: T) => Promise<T | void>,
}>;
