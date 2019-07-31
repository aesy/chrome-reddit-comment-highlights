import { HighlighterOptions, RedditCommentHighlighter } from "reddit/RedditCommentHighlighter";
import { RedditComment } from "reddit/RedditPage";
import { Logging } from "logger/Logging";
import { wait } from "util/Time";

const logger = Logging.getLogger("AbstractRedditCommentHighlighter");

export abstract class AbstractRedditCommentHighlighter implements RedditCommentHighlighter {
    public constructor(
        protected readonly options: HighlighterOptions
    ) {
        this.addCss();
    }

    public highlightComment(comment: RedditComment): void {
        logger.info("Highlighting comment", {
            id: comment.id,
            time: comment.time ? comment.time.toISOString() : "null",
            className: this.options.className
        });

        comment.element.classList.add(this.options.className);
        comment.element.classList.add(`${ this.options.className }--transition`);

        if (!this.options.clearOnClick) {
            return;
        }

        logger.debug("Installing click listener");

        comment.onClick.once(async () => {
            logger.info("Comment clicked", {
                id: comment.id
            });

            // Comments to clear on click
            const clear: RedditComment[] = [];

            if (this.options.includeChildren) {
                const addComment = (comment: RedditComment): void => {
                    const comments = comment.getChildComments();

                    for (const comment of comments) {
                        addComment(comment);
                    }

                    clear.push(comment);
                };

                addComment(comment);
            } else {
                clear.push(comment);
            }

            logger.info("Clearing highlights", {
                count: String(clear.length)
            });

            for (const comment of clear) {
                comment.element.classList.remove(this.options.className);
            }

            // Transition class can't be removed before transition has finished
            await wait(this.options.transitionDurationSeconds * 1000 + 500);

            for (const comment of clear) {
                const className = `${ this.options.className }--transition`;
                comment.element.classList.remove(className);
            }
        });
    }

    public dispose(): void {
        logger.debug("Disposing comment highlighter");

        const elements = document.querySelectorAll(".comment");

        logger.debug("Removing all highlights", {
            count: String(elements.length)
        });

        for (const element of elements) {
            element.classList.remove(this.options.className);
            element.classList.remove(`${ this.options.className }--transition`);
        }

        this.removeCss();
    }

    protected abstract addCss(): void;

    protected abstract removeCss(): void;
}
