export type Factory<T> = () => T;

export type Value<T = unknown> = { surprise: unknown } | { current?: T };

export type Task<T> = {
  state: "pending" | "done" | "susprise";
  perform: () => T;
};

export const task = <T>(perform: () => T): Task<T> => {
  const result = {} as Value<T>;

  const task: Task<T> = {
    state: "pending",
    perform: () => {
      if ("current" in result) {
        return result.current!;
      }

      if ("surprise" in result) {
        throw result.surprise;
      }

      try {
        result.current = perform();
        task.state = "done";
        return result.current!;
      } catch (error) {
        Reflect.set(result, "surprise", error);
        task.state = "susprise";
        throw error;
      }
    },
  };

  return task;
};
export const singleton = <T>(factory: Factory<T>): Factory<T> => {
  const instance = { current: null as T | null };
  return () => {
    if (instance.current) {
      return instance.current;
    }

    instance.current = factory();
    return instance.current!;
  };
};

export function factory<T extends new (...args: any) => any>(
  ctor: T,
): (...args: ConstructorParameters<T>) => Factory<InstanceType<T>>;

export function factory<T extends (...args: any) => any>(
  fn: T,
): (...args: Parameters<T>) => Factory<ReturnType<T>>;

export function factory(fn: any) {
  return (...args: any) =>
    singleton(() => fn.prototype ? new fn(...args) : fn(...args));
}
