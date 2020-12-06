import bind from "bind-decorator";
import { Browser } from "webextension-polyfill-ts";
import { FunctionRegistry } from "registry/FunctionRegistry";

interface InvocationRequest<T> {
    method: string;
    arg: T;
}

interface InvocationResponse<R> {
    method: string;
    error?: any;
    result?: R;
}

export class RemoteFunctionBrowserExtensionRegistry implements FunctionRegistry {
    private static readonly METHOD_PREFIX: string = "__RemoteFunctionBrowserExtensionRegistry__";
    private readonly functions: Map<string, Function> = new Map();

    public constructor(
        private readonly browser: Browser
    ) {
        if (this.browser.runtime) {
            this.browser.runtime.onMessage.addListener(this.messageListener);
        }
    }

    public register<T, R>(key: string, action: (arg: T) => R): void {
        const method = `${ RemoteFunctionBrowserExtensionRegistry.METHOD_PREFIX }${ key }`;

        this.functions.set(method, action);
    }

    public unregister<T, R>(key: string): void {
        const method = `${ RemoteFunctionBrowserExtensionRegistry.METHOD_PREFIX }${ key }`;

        this.functions.delete(method);
    }

    public async invoke<T, R>(key: string, arg?: T): Promise<R> {
        const func = this.functions.get(key as string);

        if (func) {
            // Function is not remote
            return func(arg);
        }

        const method = `${ RemoteFunctionBrowserExtensionRegistry.METHOD_PREFIX }${ key }`;

        const request: InvocationRequest<T> = {
            method, arg: arg as T
        };

        return new Promise((resolve, reject) => {
            const handler = (response: object | void): void => {
                const error = this.browser.runtime!.lastError;

                if (error) {
                    return reject(error);
                }

                const invocationResponse = response as InvocationResponse<R>;

                if (!invocationResponse) {
                    return reject();
                }

                if (!invocationResponse.method || invocationResponse.error) {
                    return reject(invocationResponse.error);
                }

                const result = invocationResponse.result;

                return resolve(result);
            };

            if (this.browser.runtime) {
                this.browser.runtime.sendMessage(request)
                    .then(handler);
            } else if (this.browser.tabs) {
                this.browser.tabs.query({})
                    .then(tabs => {
                        for (const tab of tabs) {
                            this.browser.tabs!.sendMessage(tab.id!, request)
                                .then(handler);
                        }
                    });
            }
        });
    }

    public dispose(): void {
        this.functions.clear();

        if (this.browser.runtime) {
            this.browser.runtime.onMessage.removeListener(this.messageListener);
        }
    }

    @bind
    private messageListener(request: object | void): Promise<InvocationResponse<unknown>> | void {
        if (!request) {
            return;
        }

        const invocationRequest = request as InvocationRequest<unknown>;
        const method = invocationRequest.method;
        const arg = invocationRequest.arg;
        const prefix = RemoteFunctionBrowserExtensionRegistry.METHOD_PREFIX;

        if (typeof method !== "string") {
            return;
        }

        if (!method.startsWith(prefix)) {
            // Message is not related to extension registry
            return;
        }

        const func = this.functions.get(method);
        const response: InvocationResponse<unknown> = { method };

        if (func) {
            try {
                const result = func(arg);

                if (result instanceof Promise) {
                    return result.then((actualResult: unknown) => {
                        response[ "result" ] = actualResult;
                        return response;
                    }).catch((error: any) => {
                        response[ "error" ] = error;
                        return response;
                    });
                } else {
                    response[ "result" ] = result;
                }
            } catch (error) {
                response[ "error" ] = error;
            }
        } else {
            const name = method.substring(prefix.length);

            response[ "error" ] = `No such function with name ${ name }`;
        }

        return Promise.resolve(response);
    }
}
