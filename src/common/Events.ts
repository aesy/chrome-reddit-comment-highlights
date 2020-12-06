import { browser } from "webextension-polyfill-ts";
import { Event } from "event/Event";
import { BrowserExtensionEvent } from "event/BrowserExtensionEvent";

export const onThreadVisitedEvent: Event<string> = new BrowserExtensionEvent(browser, "onThreadVisitedEvent");
export const onSettingsChanged: Event<void> = new BrowserExtensionEvent(browser, "onSettingsChanged");
