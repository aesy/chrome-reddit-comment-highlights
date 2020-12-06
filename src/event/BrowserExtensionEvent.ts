import bind from "bind-decorator";
import { Browser } from "webextension-polyfill-ts";
import { AsyncEvent } from "event/AsyncEvent";

interface EventPayload<T> {
    method: string;
    message: T;
}

/**
 * Asynchronous event that works across scripts by communicating through browser message
 * listeners.
 */
export class BrowserExtensionEvent<T> extends AsyncEvent<T> {
    private static readonly METHOD_PREFIX: string = "__BrowserExtensionEvent__";

    public constructor(
        private readonly browser: Browser,
        private readonly eventType: string
    ) {
        super();

        this.initialize();
    }

    public dispatch(data: T): this {
        const payload: EventPayload<T> = {
            method: `${ BrowserExtensionEvent.METHOD_PREFIX }${ this.eventType }`,
            message: data
        };

        if (this.browser.runtime) {
            this.browser.runtime.sendMessage(payload);
        }

        if (this.browser.tabs) {
            this.browser.tabs.query({})
                .then(tabs => {
                    for (const tab of tabs) {
                        this.browser.tabs!.sendMessage(tab.id!, payload);
                    }
                });
        }

        super.dispatch(data);

        return this;
    }

    public dispose(): void {
        super.dispose();

        if (this.browser.runtime) {
            this.browser.runtime.onMessage.removeListener(this.handleMessage);
        }
    }

    protected initialize(): void {
        if (this.browser.runtime) {
            this.browser.runtime.onMessage.addListener(this.handleMessage);
        }
    }

    @bind
    private handleMessage(obj: object | void): void {
        if (!obj) {
            return;
        }

        if (typeof obj !== "object") {
            return;
        }

        const payload = obj as EventPayload<T>;
        const method = payload.method;

        if (typeof method !== "string") {
            return;
        }

        if (!method.startsWith(BrowserExtensionEvent.METHOD_PREFIX)) {
            // Message is not related to extension events
            return;
        }

        const eventType = method.substring(BrowserExtensionEvent.METHOD_PREFIX.length);

        if (eventType !== this.eventType) {
            return;
        }

        super.dispatch(payload.message);
    }
}

// abstract class AbstractOnInstalledEvent<T> extends BrowserExtensionEvent<T> {
//     protected constructor(
//         private readonly browser: Browser,
//         private readonly reason: string
//     ) {
//         super(browser, reason);
//     }
//
//     public dispose(): void {
//         super.dispose();
//
//         if (this.browser.runtime && this.browser.runtime.onInstalled) {
//             this.browser.runtime.onInstalled.removeListener(this.handleInstallEvent);
//         }
//     }
//
//     protected initialize(): void {
//         super.initialize();
//
//         if (this.browser.runtime && this.browser.runtime.onInstalled) {
//             this.browser.runtime.onInstalled.addListener(this.handleInstallEvent);
//         }
//     }
//
//     protected abstract getMessage(details: any): T;
//
//     @bind
//     private handleInstallEvent(details: any): void {
//         if (this.reason !== details.reason) {
//             return;
//         }
//
//         this.dispatch(this.getMessage(details));
//     }
// }
//
// class OnInstalledEvent extends AbstractOnInstalledEvent<void> {
//     public constructor() {
//         super("install");
//     }
//
//     protected getMessage(): void {
//         return undefined;
//     }
// }
//
// class OnUpdatedEvent extends AbstractOnInstalledEvent<{ previousVersion: string }> {
//     public constructor() {
//         super("update");
//     }
//
//     protected getMessage(details: any): { previousVersion: string } {
//         return {
//             previousVersion: details.previousVersion
//         };
//     }
// }
//
// export const onInstallEvent: Subscribable<void> = new OnInstalledEvent();
//
// export const onUpdateEvent: Subscribable<{ previousVersion: string }> = new OnUpdatedEvent();
