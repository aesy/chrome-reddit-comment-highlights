export interface FunctionRegistry {
    register<T, R>(key: string, action: (arg: T) => R): void;
    unregister<T, R>(key: string): void;
    invoke<T, R>(key: string, arg?: T): Promise<R>;
    dispose(): void;
}
