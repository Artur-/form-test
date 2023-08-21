// TODO: Fix dependency cycle

// eslint-disable-next-line import/no-cycle
import { BinderNode } from './BinderNode.js';
// eslint-disable-next-line import/no-cycle
import { _parent, AbstractModel, type ModelConstructor } from './Models.js';
// eslint-disable-next-line import/no-cycle
import {
  type InterpolateMessageCallback,
  runValidator,
  ServerValidator,
  ValidationError,
  type Validator,
  type ValueError,
} from './Validation.js';
// eslint-disable-next-line import/no-cycle
import { type FieldStrategy, getDefaultFieldStrategy } from './Field.js';
import { BinderRoot, BinderRootConfiguration } from './BinderRoot.js';

const _onChange = Symbol('onChange');

/**
 * A Binder controls all aspects of a single form.
 * Typically, it is used to get and set the form value,
 * access the form model, validate, reset, and submit the form.
 *
 * @param <T> is the type of the value that binds to a form
 * @param <M> is the type of the model that describes the structure of the value
 */
export class Binder<T, M extends AbstractModel<T>> extends BinderRoot<T, M> {
  private [_onChange]?: (oldValue: T | undefined) => void;

  /**
   *
   * @param context The form view component instance to update.
   * @param Model The constructor (the class reference) of the form model. The Binder instantiates the top-level model
   * @param config The options object, which can be used to config the onChange and onSubmit callbacks.
   *
   * ```
   * binder = new Binder(orderView, OrderModel);
   * or
   * binder = new Binder(orderView, OrderModel, {onSubmit: async (order) => {endpoint.save(order)}});
   * ```
   */
  public constructor(public context: Element, Model: ModelConstructor<T, M>, config?: BinderConfiguration<T>) {
    super(Model, {onSubmit: config?.onSubmit});
    this[_onChange] = config?.onChange;
  }

  protected override getCallbackContext() {
    return this.context;
  }

  protected override update(oldValue: T) {
    this[_onChange]?.call(this.getCallbackContext(), oldValue);
  }
}

export interface BinderConfiguration<T> extends BinderRootConfiguration<T> {
  onChange?: (oldValue?: T) => void;
  onSubmit?: (value: T) => Promise<T | void>;
}
