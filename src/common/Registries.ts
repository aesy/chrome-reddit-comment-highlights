import { browser } from "webextension-polyfill-ts";
import { FunctionRegistry } from "registry/FunctionRegistry";
import { RemoteFunctionBrowserExtensionRegistry } from "registry/RemoteFunctionBrowserExtensionRegistry";

export const extensionFunctionRegistry: FunctionRegistry = new RemoteFunctionBrowserExtensionRegistry(browser);
