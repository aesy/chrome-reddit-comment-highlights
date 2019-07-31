import bind from "bind-decorator";
import { AbstractRedditCommentHighlighter } from "reddit/AbstractRedditCommentHighlighter";
import { HighlighterOptions } from "reddit/RedditCommentHighlighter";
import { Logging } from "logger/Logging";
import { hexToRgb, relativeLuminance } from "util/Color";
import { injectCSS } from "util/DOM";

const logger = Logging.getLogger("RedesignRedditCommentHighlighter");

export class RedesignRedditCommentHighlighter extends AbstractRedditCommentHighlighter {
    private readonly darkModeObserver: MutationObserver;
    private cssElement: Element | null = null;

    public constructor(
        options: HighlighterOptions
    ) {
        super(options);

        this.darkModeObserver = new MutationObserver(this.onStyleChange);
    }

    protected addCss(): void {
        if (this.cssElement) {
            this.removeCss();
        }

        logger.info("Injecting CSS");
        logger.debug("Detecting style");

        const root = document.getElementById("2x-container");

        if (!root) {
            throw "Failed to inject CSS. Reason: 2x-container element not found.";
        }

        const element = root.firstElementChild;

        if (!element) {
            throw "Failed to inject CSS. Reason: 2x-container has no children.";
        }

        const style = element.getAttribute("style");

        if (!style) {
            throw "Failed to inject CSS. Reason: 2x-container child has no style.";
        }

        const kvRegex = /--(\w+):#(\w+)/g;
        const matches: { [keys: string]: string } = {};
        let kv: RegExpExecArray | null;

        while ((kv = kvRegex.exec(style)) !== null) {
            matches[ kv[ 1 ] ] = kv[ 2 ];
        }

        if (!Object.keys(matches).length) {
            throw `Failed to inject CSS. Reason: Failed to parse style attribute '${ style }'.`;
        }

        if (!matches.background) {
            throw `Failed to inject CSS. Reason: background property missing from style attribute '${ style }'.`;
        }

        const color = hexToRgb(matches.background);
        const luma = relativeLuminance(color);
        const darkMode = luma < 0.5;

        logger.debug("Successfully detected style", { darkMode: String(darkMode) });

        this.cssElement = injectCSS(this.getCSS(darkMode), document.head);

        logger.debug("Installing style observer");

        this.darkModeObserver.observe(element, {
            attributes: true,
            attributeFilter: [ "style" ]
        });

        logger.info("Successfully injected CSS")
    }

    protected removeCss(): void {
        logger.info("Removing CSS");

        if (!this.cssElement) {
            logger.info("No CSS to remove");

            return;
        }

        logger.debug("Uninstalling style observer");

        this.darkModeObserver.disconnect();

        const removed = document.head.removeChild(this.cssElement);
        this.cssElement = null;

        if (removed) {
            logger.info("Successfully removed CSS");
        } else {
            logger.warn("No CSS was removed");
        }
    }

    private getCSS(darkMode: boolean): string {
        logger.debug("Generating CSS");

        if (this.options.customCSS) {
            logger.debug("Using custom CSS");

            return this.options.customCSS;
        }

        let css = `
            .Comment.${ this.options.className }--transition [data-test-id="comment"] {
                transition-property: margin, padding, border, background-color, color;
                transition-duration: ${ this.options.transitionDurationSeconds }s;
            }

            .Comment.${ this.options.className } [data-test-id="comment"] {
                margin-top: 4px;
                padding: 4px 10px;
                border: ${ this.options.border || '0' };
                border-radius: 4px;
                background-color: ${ darkMode ? this.options.backgroundColorDark : this.options.backgroundColor };
                color: ${ darkMode ? this.options.normalTextColorDark : this.options.normalTextColor };
            }
        `;

        if (this.options.linkTextColor && this.options.linkTextColorDark) {
            css += `
                .Comment.${ this.options.className } [data-test-id="comment"] a {
                    color: ${ darkMode ? this.options.linkTextColorDark : this.options.linkTextColor };
                }
            `;
        }

        if (this.options.quoteTextColor && this.options.quoteTextColorDark) {
            css += `
                .Comment.${ this.options.className } [data-test-id="comment"] blockquote {
                    color: ${ darkMode ? this.options.quoteTextColorDark : this.options.quoteTextColor };
                }
            `;
        }

        logger.debug("Successfully generated CSS");

        return css;
    }

    @bind
    private onStyleChange(): void {
        logger.warn("Style change detected");

        this.removeCss();
        this.addCss();
    }
}
