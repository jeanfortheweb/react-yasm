// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React, {
  createContext,
  Dispatch,
  FunctionComponent,
  ReactNode,
  SetStateAction,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

interface Action<State, Services extends ServiceRecord> {
  (deps: ActionArgs<State, Services>, ...args: unknown[]): void | Promise<void>;
}

interface Selector<State, Value> {
  (state: State): Value;
}

type ActionRecord<State, Services extends ServiceRecord> = Record<
  string,
  Action<State, Services>
>;

type ServiceRecord = Record<string, unknown>;

export interface Model<
  State,
  Services extends ServiceRecord,
  Actions extends ActionRecord<State, Services>
> {
  Provider: ModelProvider<State, Services>;
  Consumer: ModelConsumer<State, Services, Actions>;
  use(): [State, BoundActionRecord<State, Services, Actions>];
  use<Value>(
    fn: Selector<State, Value>,
    deps?: unknown[],
  ): Readonly<[Value, BoundActionRecord<State, Services, Actions>]>;
}

export type ModelProvider<
  State,
  Services extends ServiceRecord
> = FunctionComponent<StateProps<State> & ServiceProps<Services>>;

export type ModelConsumer<
  State,
  Services extends ServiceRecord,
  Actions extends ActionRecord<State, Services>
> = FunctionComponent<ConsumerProps<State, Services, Actions>>;

export type ServiceProps<
  Services extends ServiceRecord
> = Services extends Record<string, unknown>
  ? Omit<
      { [key in keyof Services]: Services[key] },
      keyof StateService<unknown>
    >
  : unknown;

export interface StateService<State> {
  get(): State;
  set: Dispatch<SetStateAction<State>>;
}

export type ActionArgs<State, Services = unknown> = Services extends Record<
  string,
  unknown
>
  ? StateService<State> & Services
  : StateService<State>;

export interface StateProps<State> {
  state: State;
}

type BoundActionRecord<
  State,
  Services extends ServiceRecord,
  Actions extends ActionRecord<State, Services>
> = {
  [key in keyof Actions]: Actions[key] extends (
    state: ActionArgs<State, Services>,
    ...args: infer Args
  ) => // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any
    ? (...args: Args) => Promise<void>
    : never;
};

type ModelContext<
  State,
  Services extends ServiceRecord,
  Actions extends ActionRecord<State, Services>
> = [Readonly<State>, BoundActionRecord<State, Services, Actions>];

interface ConsumerArgs<
  State,
  Services extends ServiceRecord,
  Actions extends ActionRecord<State, Services>
> {
  actions: BoundActionRecord<State, Services, Actions>;
  state: State;
}

interface ConsumerProps<
  State,
  Services extends ServiceRecord,
  Actions extends ActionRecord<State, Services>
> {
  children(helpers: ConsumerArgs<State, Services, Actions>): ReactNode;
}

export function model<
  State,
  Services extends ServiceRecord,
  Actions extends ActionRecord<State, Services>
>(actions: Actions): Model<State, Services, Actions> {
  const context = createContext<ModelContext<State, Services, Actions>>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    null as any,
  );

  const defaultSelector = (state: State) => state;

  const use = (
    fn: Selector<State, unknown> = defaultSelector,
    deps: unknown[] = [],
  ): [unknown, BoundActionRecord<State, Services, Actions>] => {
    const [state, actions] = useContext(context);
    const value = useMemo(() => fn(state), [state, ...deps]);

    return [value, actions];
  };

  const Provider: FunctionComponent<
    StateProps<State> & ServiceProps<Services>
  > = (props: StateProps<State> & ServiceProps<Services>) => {
    const [state, setState] = useState(props.state);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { children, ...deps } = props as any;
    const stateRef = useRef(state);

    const boundActions = useMemo(
      () =>
        Object.freeze(
          Object.entries(actions).reduce(
            (actions, [name, fn]) => ({
              ...actions,
              [name]: async (...args: unknown[]) => {
                await fn(
                  { ...deps, get: () => stateRef.current, set: setState },
                  ...args,
                );
              },
            }),
            {},
          ),
        ) as BoundActionRecord<State, Services, Actions>,
      [],
    );

    const value = useMemo<ModelContext<State, Services, Actions>>(
      () => [state, boundActions],
      [boundActions, state],
    );

    useEffect(() => {
      stateRef.current = state;
    }, [state]);

    return <context.Provider value={value}>{children}</context.Provider>;
  };

  const Consumer: ModelConsumer<State, Services, Actions> = (
    props: ConsumerProps<State, Services, Actions>,
  ) => {
    const { children } = props;
    const [state, actions] = use();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const args = ({ actions, state } as any) as ConsumerArgs<
      State,
      Services,
      Actions
    >;

    return <>{children(args)}</>;
  };

  return Object.freeze({
    Provider,
    Consumer,
    use,
  }) as Model<State, Services, Actions>;
}
