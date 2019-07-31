import bind from "bind-decorator";
import { Actions } from "common/Actions";
import { Constants } from "common/Constants";
import { onSettingsChanged, onThreadVisitedEvent } from "common/Events";
import { extensionFunctionRegistry } from "common/Registries";
import { ThreadHistoryEntry } from "history/ThreadHistory";
import { ConsoleSink } from "logger/ConsoleSink";
import { KeyValueLogger } from "logger/KeyValueLogger";
import { LogLevel } from "logger/Logger";
import { Logging } from "logger/Logging";
import { Options } from "options/ExtensionOptions";
import { OldRedditCommentHighlighter } from "reddit/OldRedditCommentHighlighter";
import { OldRedditPage } from "reddit/OldRedditPage";
import { HighlighterOptions, RedditCommentHighlighter } from "reddit/RedditCommentHighlighter";
import { isAtRootLevel, RedditComment, RedditCommentThread, RedditPage } from "reddit/RedditPage";
import { RedesignRedditCommentHighlighter } from "reddit/RedesignRedditCommentHighlighter";
import { RedesignRedditPage } from "reddit/RedesignRedditPage";

Logging.setLoggerFactory(KeyValueLogger.create);
Logging.setSink(new ConsoleSink());
Logging.setLogLevel(LogLevel.DEBUG);

const logger = Logging.getLogger("ContentScript");

class ContentScript {
    private currentThread: RedditCommentThread | null = null;
    private lastVisitedTimestamp: number | null | undefined = undefined;

    private constructor(
        private readonly reddit: RedditPage,
        private readonly highlighter: RedditCommentHighlighter
    ) {
        reddit.onThreadOpened.subscribe(this.onThreadVisited);
    }

    public static async start(): Promise<ContentScript> {
        logger.info("Starting ContentScript");

        const options = await extensionFunctionRegistry.invoke<void, Options>(Actions.GET_OPTIONS);

        if (options.debug) {
            logger.info("Enabling debug mode");
            Logging.setLogLevel(LogLevel.DEBUG);
        } else {
            logger.info("Disabling debug mode");
            Logging.setLogLevel(LogLevel.WARN);
        }

        let reddit: RedditPage;
        let highlighter: RedditCommentHighlighter;
        const highlightOptions: HighlighterOptions = {
            backgroundColor: options.backColor,
            backgroundColorDark: options.backNightColor,
            border: options.border,
            linkTextColor: options.linkColor,
            linkTextColorDark: options.linkNightColor,
            normalTextColor: options.frontColor,
            normalTextColorDark: options.frontNightColor,
            quoteTextColor: options.quoteTextColor,
            quoteTextColorDark: options.quoteTextNightColor,
            className: options.customCSSClassName,
            clearOnClick: options.clearCommentOnClick,
            customCSS: options.customCSS,
            includeChildren: options.clearCommentincludeChildren,
            transitionDurationSeconds: Constants.CSS_TRANSITION_DURATION_SECONDS
        };

        if (RedesignRedditPage.isSupported()) {
            logger.info("Detected redesign reddit page");
            reddit = new RedesignRedditPage(Constants.REDESIGN_EXTENSION_NAME);
            highlighter = new RedesignRedditCommentHighlighter(highlightOptions);
        } else if (OldRedditPage.isSupported()) {
            logger.info("Detected old reddit page");
            reddit = new OldRedditPage();
            highlighter = new OldRedditCommentHighlighter(highlightOptions);
        } else {
            throw "Failed to start ContentScript. Reason: no suitable reddit page implementation found.";
        }

        const contentScript = new ContentScript(reddit, highlighter);

        // Restart after settings changed
        onSettingsChanged.once(async () => {
            logger.info("Restarting ContentScript", {
                reason: "ExtensionOptions changed"
            });

            contentScript.stop();

            try {
                await ContentScript.start();
            } catch (error) {
                logger.error("Failed to start BackgroundScript", { error: JSON.stringify(error) });

                throw error;
            }
        });

        logger.debug("Successfully started ContentScript");

        return contentScript;
    }

    public stop(): void {
        logger.info("Stopping ContentScript");

        this.reddit.dispose();
        this.highlighter.dispose();

        if (this.currentThread) {
            this.currentThread.dispose();
        } else {
            logger.debug("No thread to dispose");
        }

        logger.debug("Successfully stopped ContentScript");
    }

    @bind
    private async onThreadVisited(thread: RedditCommentThread): Promise<void> {
        logger.info("Thread visited", { threadId: thread.id });

        this.lastVisitedTimestamp = undefined;

        if (this.currentThread) {
            logger.debug("Disposing previous thread", { threadId: this.currentThread.id });
            this.currentThread.dispose();
        }

        this.currentThread = thread;

        if (isAtRootLevel()) {
            // Only consider comment section viewed if at root level
            onThreadVisitedEvent.dispatch(thread.id);
        }

        thread.onCommentAdded.subscribe(this.highlightComments);

        await this.highlightComments(...thread.getAllComments());
    }

    @bind
    private async highlightComments(...comments: RedditComment[]): Promise<void> {
        if (!this.currentThread) {
            return;
        }

        if (this.lastVisitedTimestamp === undefined) {
            logger.debug("Fetching thread history entry", {
                thread: this.currentThread.id
            });

            const entry = await extensionFunctionRegistry.invoke<string, ThreadHistoryEntry | null>(
                Actions.GET_THREAD_BY_ID, this.currentThread.id);

            if (entry) {
                // Caching lastVisitedTimestamp so that we don't have to do a lot of unnecessary
                // inter-script communcation.
                this.lastVisitedTimestamp = entry.timestamp * 1000;

                logger.debug("Thread history entry found", {
                    thread: this.currentThread.id,
                    lastVisited: new Date(this.lastVisitedTimestamp).toISOString()
                });
            } else {
                this.lastVisitedTimestamp = null;

                logger.debug("No thread history entry exists, meaning thread visited for the first time.", {
                    thread: this.currentThread.id
                });
            }
        }

        if (this.lastVisitedTimestamp === null) {
            return;
        }

        const user = this.reddit.getLoggedInUser();

        for (const comment of comments) {
            if (user && user === comment.author) {
                // Users own comment, skip
                continue;
            }

            if (!comment.time) {
                // Deleted comment, skip
                continue;
            }

            if (comment.time.valueOf() < this.lastVisitedTimestamp) {
                // Comment already seen, skip
                continue;
            }

            logger.debug("Highlighting comment", {
                id: comment.id || "null",
                created: comment.time.toISOString()
            });

            this.highlighter.highlightComment(comment);
        }
    }
}

/* This script is injected into every reddit page */

(async function entrypoint(): Promise<void> {
    logger.info("ContentScript loaded");

    try {
        await ContentScript.start();
    } catch (error) {
        logger.error("Failed to start ContentScript", { error: JSON.stringify(error) });
    }
})();
