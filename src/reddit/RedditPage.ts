import { Subscribable } from "event/Event";

export interface RedditPage {
    readonly onThreadOpened: Subscribable<RedditCommentThread>;

    getLoggedInUser(): string | null;
    dispose(): void;
}

export interface RedditCommentThread {
    readonly onCommentAdded: Subscribable<RedditComment>;
    readonly id: string;

    getCommentById(id: string): RedditComment | null;
    getAllComments(): RedditComment[];
    dispose(): void;
}

export interface RedditComment {
    readonly element: Element;
    readonly onClick: Subscribable<void>;
    readonly id: string;
    readonly author: string | null;
    readonly time: Date | null;

    getChildComments(): RedditComment[];
    dispose(): void;
}

export function isACommentThread(): boolean {
    const pathPieces = document.location.pathname.split("/");

    // Check if url is in the form of '/r/<subreddit>/comments/...'
    return pathPieces[ 1 ] === "r" && pathPieces[ 3 ] === "comments";
}

export function isAtRootLevel(): boolean {
    if (!isACommentThread()) {
        return false;
    }

    // Check so that url doesn't include direct link to comment
    return document.location.pathname.split("/").length < 8;
}

export function isMobileSite(): boolean {
    return document.location.hostname === "m.reddit.com";
}
