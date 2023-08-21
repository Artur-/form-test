import { HasValue } from "./Models.js";

export type Dispatch<T> = (value: T) => void;

export type Initializer<T> = () => T;

export type Store<T> = [value: T, setValue: Dispatch<T>];

export type StoreFactory = <T>(initialValue: T | Initializer<T>) => Store<T>;

export class StoreAdapter<T> implements HasValue<T> {
  #value: T;
  #defaultSetValue = (value: T) => {};
  #setValue: Dispatch<T> = this.#defaultSetValue;

  constructor(initialValue: T) {
    this.#value = initialValue;
  }

  public delegateTo(useState: StoreFactory) {
    const store: Store<T> = useState(this.#value);
    [this.#value, this.#setValue] = store;
    return store; 
  }

  public undelegate() {
    this.#setValue = this.#defaultSetValue;
  }

  get value() {
    return this.#value;
  }

  set value(value: T) {
    this.#value = value;
    this.#setValue(value);
  }
}
