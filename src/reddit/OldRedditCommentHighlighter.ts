import { AbstractRedditCommentHighlighter } from "reddit/AbstractRedditCommentHighlighter";
import { Logging } from "logger/Logging";
import { injectCSS } from "util/DOM";

const logger = Logging.getLogger("OldRedditCommentHighlighter");

export class OldRedditCommentHighlighter extends AbstractRedditCommentHighlighter {
    private cssElement: Element | null = null;

    protected addCss() {
        logger.info("Injecting CSS");
        this.cssElement = injectCSS(this.getCSS(), document.head);
        logger.info("Successfully injected CSS")
    }

    protected removeCss() {
        logger.info("Removing CSS");

        let removed: boolean = false;

        if (this.cssElement) {
            const element = document.head.removeChild(this.cssElement);
            removed = Boolean(element);
        }

        if (removed) {
            logger.info("Successfully removed CSS");
        } else {
            logger.warn("No CSS was removed");
        }
    }

    private getCSS(): string {
        logger.debug("Generating CSS");

        if (this.options.customCSS) {
            logger.debug("Using custom CSS");

            return this.options.customCSS;
        }

        let css = `
            .comment.${ this.options.className }--transition  > .entry .md {
                transition-property: padding, border, background-color, color;
                transition-duration: ${ this.options.transitionDurationSeconds }s;
            }

            .comment.${ this.options.className } > .entry .md {
                padding: 2px;
                border: ${ this.options.border || "0" };
                border-radius: 2px;
                background-color: ${ this.options.backgroundColor };
                color: ${ this.options.normalTextColor };
            }
        `;

        if (this.options.linkTextColor) {
            css += `
                .comment.${ this.options.className } > .entry .md a {
                    color: ${ this.options.linkTextColor };
                }
            `;
        }

        if (this.options.quoteTextColor) {
            css += `
                .comment.${ this.options.className } > .entry .md blockquote {
                    color: ${ this.options.quoteTextColor };
                }
            `;
        }

        css += `
            .res-nightmode .comment.${ this.options.className } > .entry .md {
                padding: 2px;
                border: ${ this.options.border || "0" };
                border-radius: 2px;
                background-color: ${ this.options.backgroundColorDark };
                color: ${ this.options.normalTextColorDark };
            }
        `;

        if (this.options.linkTextColorDark) {
            css += `
                .res-nightmode .comment.${ this.options.className } > .entry .md a {
                    color: ${ this.options.linkTextColorDark };
                }
            `;
        }

        if (this.options.quoteTextColorDark) {
            css += `
                .res-nightmode .comment.${ this.options.className } > .entry .md blockquote {
                    color: ${ this.options.quoteTextColorDark };
                }
            `;
        }

        logger.debug("Successfully generated CSS");

        return css;
    }
}
