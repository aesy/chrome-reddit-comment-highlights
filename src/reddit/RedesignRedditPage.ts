import bind from "bind-decorator";
import { Subscribable } from "event/Event";
import { SyncEvent } from "event/SyncEvent";
import { isACommentThread, isMobileSite, RedditComment, RedditCommentThread, RedditPage } from "reddit/RedditPage";
import { Logging } from "logger/Logging";
import { findClosestParent } from "util/DOM";
import { makeRequest } from "util/HTTP";

const logger = Logging.getLogger("RedesignRedditCommentPage");

class RedesignRedditComment implements RedditComment {
    private readonly _onClick: SyncEvent<void> = new SyncEvent();

    public constructor(
        public readonly id: string,
        public readonly author: string | null,
        public readonly time: Date | null,
        public readonly element: Element,
        // We need a reference to the thread to be able to fetch child comments...
        private readonly thread: RedditCommentThread
    ) {
        element.addEventListener(
            "click",
            this.onElementClick,
            {
                capture: false,
                once: false,
                passive: true
            }
        );
    }

    public get onClick(): Subscribable<void> {
        return this._onClick;
    }

    public getChildComments(): RedditComment[] {
        const elements = document.getElementsByClassName(`t1_${ this.id }`);
        const comments: RedditComment[] = [];

        for (let element of elements) {
            if (!element.parentElement || !element.parentElement.nextElementSibling) {
                continue;
            }

            const childElement = element.parentElement.nextElementSibling;

            if (!childElement.classList.contains("Comment")) {
                continue;
            }

            const id = childElement.parentElement!.id.replace("t1_", "");
            const comment = this.thread.getCommentById(id);

            if (comment) {
                comments.push(comment);
            }
        }

        return comments;
    }

    public dispose(): void {
        this._onClick.dispose();
        this.element.removeEventListener("click", this.onElementClick);
    }

    @bind
    private onElementClick(event: Event): void {
        const target = event.target as Node | null;

        if (!target) {
            return;
        }

        const comment = findClosestParent(target, ".Comment");

        if (this.element === comment) {
            logger.debug("Comment clicked", { id: this.id });
            this._onClick.dispatch();
        }
    }
}

class RedesignRedditCommentThread implements RedditCommentThread {
    private readonly _onCommentAdded: SyncEvent<RedditComment> = new SyncEvent();
    private readonly comments: Map<string, RedditComment> = new Map();

    public constructor(
        public readonly id: string,
        meta: HTMLMetaElement
    ) {
        document.addEventListener("reddit", this.addRedditEvent, true);

        // Re-firing ready event will re-emit already existing nodes
        // We do this because we want to know of want all comments
        // This may create duplicate events
        meta.dispatchEvent(new CustomEvent("reddit.ready"));

        logger.debug("Thread opened", { id: this.id });
    }

    public get onCommentAdded(): Subscribable<RedditComment> {
        return this._onCommentAdded;
    }

    public getCommentById(id: string): RedditComment | null {
        return this.comments.get(id) || null;
    }

    public getAllComments(): RedditComment[] {
        return Array.from(this.comments.values());
    }

    public dispose(): void {
        document.removeEventListener("reddit", this.addRedditEvent);

        this._onCommentAdded.dispose();
        this.comments.forEach(comment => comment.dispose());
        this.comments.clear();
    }

    @bind
    private addRedditEvent(event: any): void {
        if (event.detail.type !== "comment") {
            return;
        }

        const element = findClosestParent(event.target, ".Comment") as Element | null;

        if (!element) {
            throw "Failed to handle comment event. Reason: event target is missing .Comment parent.";
        }

        const author: string = event.detail.data.author;
        const id: string = event.detail.data.id.replace("t1_", "");
        const createdAt: Date = new Date(event.detail.data.created * 1000);
        const comment = new RedesignRedditComment(id, author, createdAt, element, this);

        if (this.comments.has(id)) {
            this.comments.get(id)!.dispose();
            this.comments.delete(id);
        }

        this.comments.set(comment.id, comment);
        this._onCommentAdded.dispatch(comment);
    }
}

export class RedesignRedditPage implements RedditPage {
    private readonly _onThreadOpened: SyncEvent<RedditCommentThread> = new SyncEvent();
    private thread: RedditCommentThread | null = null;
    private meta: HTMLMetaElement | null = null;
    private loggedInUser: string | null = null;
    private initialized: boolean = false;

    public constructor(
        private readonly extensionName: string
    ) {
        logger.debug("Fetching currently logged in user");

        makeRequest<unknown>("https://www.reddit.com/api/me.json")
            .then(String)
            .then(JSON.parse)
            .then(response => response.data.name)
            .then((name: string): void => {
                if (name) {
                    this.loggedInUser = name;

                    logger.info("Successfully fetched logged in user", {
                        username: name
                    });
                } else {
                    logger.info("No user currently logged in");
                }
            })
            .catch((error: any): void => {
                logger.warn("Failed to fetch currently logged in user", {
                    error: JSON.stringify(error)
                });
            });
    }

    public get onThreadOpened(): Subscribable<RedditCommentThread> {
        const self = this;

        // Initialize after first listener is attached
        return {
            listener(): MethodDecorator {
                return self._onThreadOpened.listener();
            },
            once(listener: <T>(data: RedditCommentThread) => void): Subscribable<RedditCommentThread> {
                self._onThreadOpened.once(listener);

                if (!self.initialized) {
                    self.initialize();
                    self.initialized = true;
                }

                return this;
            },
            subscribe(listener: <T>(data: RedditCommentThread) => void): Subscribable<RedditCommentThread> {
                self._onThreadOpened.subscribe(listener);

                if (!self.initialized) {
                    self.initialize();
                    self.initialized = true;
                }

                return this;
            },
            unsubscribe(listener: <T>(data: RedditCommentThread) => void): Subscribable<RedditCommentThread> {
                self._onThreadOpened.unsubscribe(listener);

                return this;
            }
        };
    }

    public getLoggedInUser(): string | null {
        return this.loggedInUser;
    }

    public dispose(): void {
        logger.debug("Disposing reddit page");

        this._onThreadOpened.dispose();
        document.removeEventListener("reddit.urlChanged", this.onUrlChanged);

        if (this.meta) {
            logger.debug("Removing jsapi meta element");

            document.head.removeChild(this.meta);
            this.meta = null;
        }

        if (this.thread) {
            this.thread.dispose();
            this.thread = null;
        }
    }

    public static isSupported(): boolean {
        if (isMobileSite()) {
            return false;
        }

        const meta = document.querySelector("meta[name=\"jsapi\"]");

        return Boolean(meta);
    }

    private initialize(): void {
        logger.info("Initializing reddit page");
        logger.debug("Installing urlChanged eventlistener");

        document.addEventListener("reddit.urlChanged", this.onUrlChanged, { capture: true });

        logger.debug("Injecting jsapi meta element");

        // Register extension as JSAPI consumer
        this.meta = document.createElement("meta");
        this.meta.name = "jsapi.consumer";
        this.meta.content = this.extensionName;
        document.head.appendChild(this.meta);

        this.meta.dispatchEvent(new CustomEvent("reddit.ready"));

        // If starting page is a thread, no urlChanged event is emitted
        if (isACommentThread()) {
            const id = document.location.pathname.split("/")[ 4 ];

            logger.debug("Determined current page to be a comment thread", { id });

            this.thread = new RedesignRedditCommentThread(id, this.meta);
            this._onThreadOpened.dispatch(this.thread);
        }

        logger.info("Successfully initialized reddit page");
    }

    @bind
    private onUrlChanged(event: any): void {
        logger.debug("urlChanged event received", {
            action: event.detail.action
        });

        if (!this.meta) {
            throw "Failed to handle url changed event. Reason: meta element missing.";
        }

        if (event.detail.action !== "PUSH") {
            return;
        }

        const id = event.detail.urlParams.partialPostId;

        if (!id) {
            return;
        }

        if (this.thread && this.thread.id === id) {
            // There may be duplicate events for some reason, return if an event has already been processed...
            return;
        }

        logger.debug("urlChanged event received", { id });

        const thread = new RedesignRedditCommentThread(id, this.meta);

        if (this.thread) {
            this.thread.dispose();
        }

        this.thread = thread;

        this._onThreadOpened.dispatch(thread);
    }
}
