import bind from "bind-decorator";
import { browser } from "webextension-polyfill-ts";
import { Actions } from "common/Actions";
import { Constants } from "common/Constants";
import { onSettingsChanged, onThreadVisitedEvent } from "common/Events";
import { extensionFunctionRegistry } from "common/Registries";
import { ThreadHistory, ThreadHistoryEntry } from "history/ThreadHistory";
import { TruncatingThreadHistory } from "history/TruncatingThreadHistory";
import { ConsoleSink } from "logger/ConsoleSink";
import { KeyValueLogger } from "logger/KeyValueLogger";
import { LogLevel } from "logger/Logger";
import { Logging } from "logger/Logging";
import { DefaultExtensionOptions } from "options/DefaultExtensionOptions";
import { ExtensionOptions, Options } from "options/ExtensionOptions";
import { PeriodicallyFlushedBrowserExtensionStorage } from "storage/BrowserExtensionStorage";
import { CachedStorage } from "storage/CachedStorage";
import { CompressedStorage } from "storage/CompressedStorage";
import { Storage } from "storage/Storage";
import { StorageMigrator } from "storage/StorageMigrator";

Logging.setLoggerFactory(KeyValueLogger.create);
Logging.setSink(new ConsoleSink());
Logging.setLogLevel(LogLevel.DEBUG);

const logger = Logging.getLogger("BackgroundScript");

class BackgroundScript {
    private constructor(
        private readonly optionsStorage: Storage<Partial<Options>>,
        private readonly threadStorage: Storage<ThreadHistoryEntry[]>,
        private readonly extensionOptions: ExtensionOptions,
        private readonly threadHistory: ThreadHistory
    ) {
        optionsStorage.onChange.subscribe(this.onOptionsChanged);
        extensionFunctionRegistry.register(Actions.GET_THREAD_BY_ID, this.getThreadById);
        extensionFunctionRegistry.register(Actions.SAVE_OPTIONS, this.saveOptions);
        extensionFunctionRegistry.register(Actions.GET_OPTIONS, this.getOptions);
        extensionFunctionRegistry.register(Actions.CLEAR_STORAGE, this.clearStorages);
        onThreadVisitedEvent.subscribe(this.onThreadVisisted);
    }

    public static async start(): Promise<BackgroundScript> {
        logger.info("Starting BackgroundScript");

        const optionsStorage = new CachedStorage(new PeriodicallyFlushedBrowserExtensionStorage(
            browser,
            "sync",
            Constants.OPTIONS_STORAGE_KEY,
            Constants.STORAGE_UPDATE_INTERVAL_SECONDS));
        const extensionOptions = new DefaultExtensionOptions(
            optionsStorage, Constants.OPTIONS_DEFAULTS);
        const options = await extensionOptions.get();

        if (options.debug) {
            logger.info("Enabling debug mode");
            Logging.setLogLevel(LogLevel.DEBUG);
        } else {
            logger.info("Disabling debug mode");
            Logging.setLogLevel(LogLevel.WARN);
        }

        let threadStorage: Storage<ThreadHistoryEntry[]>;
        let storageType: "sync" | "local";

        if (options.sync) {
            logger.debug("Using sync thread storage");
            storageType = "sync";
        } else {
            logger.debug("Using local thread storage");
            storageType = "local";
        }

        if (options.useCompression) {
            logger.info("Enabling storage compression");

            threadStorage = new CompressedStorage(new PeriodicallyFlushedBrowserExtensionStorage(
                browser,
                storageType,
                Constants.THREAD_STORAGE_KEY,
                Constants.STORAGE_UPDATE_INTERVAL_SECONDS));
        } else {
            threadStorage = new PeriodicallyFlushedBrowserExtensionStorage(
                browser,
                storageType,
                Constants.THREAD_STORAGE_KEY,
                Constants.STORAGE_UPDATE_INTERVAL_SECONDS);
        }

        threadStorage = new CachedStorage(threadStorage);

        const threadHistory = new TruncatingThreadHistory(
            threadStorage, options.threadRemovalTimeSeconds);
        const backgroundScript = new BackgroundScript(
            optionsStorage,
            threadStorage,
            extensionOptions,
            threadHistory);

        logger.debug("Successfully started BackgroundScript");

        return backgroundScript;
    }

    public stop(): void {
        logger.info("Stopping BackgroundScript");

        this.optionsStorage.dispose();
        this.threadStorage.dispose();
        this.extensionOptions.dispose();
        this.threadHistory.dispose();
        this.optionsStorage.onChange.unsubscribe(this.onOptionsChanged);

        extensionFunctionRegistry.unregister(Actions.GET_THREAD_BY_ID);
        extensionFunctionRegistry.unregister(Actions.SAVE_OPTIONS);
        extensionFunctionRegistry.unregister(Actions.GET_OPTIONS);
        extensionFunctionRegistry.unregister(Actions.CLEAR_STORAGE);
        onThreadVisitedEvent.unsubscribe(this.onThreadVisisted);

        logger.debug("Successfully stopped BackgroundScript");
    }

    @bind
    private async getThreadById(threadId: string): Promise<ThreadHistoryEntry | null> {
        logger.info("Thread history entry requested", { threadId });

        let entry: ThreadHistoryEntry | null;

        try {
            entry = await this.threadHistory.get(threadId);
        } catch (error) {
            logger.error("Failed to get thread history entry", { threadId });

            throw error;
        }

        if (entry) {
            logger.debug("Thread history entry found", { threadId });
        } else {
            logger.debug("Thread history entry not found", { threadId });
        }

        return entry;
    }

    @bind
    private async saveOptions(options: Partial<Options>): Promise<void> {
        logger.info("Saving options");

        try {
            await this.extensionOptions.set(options);
        } catch (error) {
            logger.error("Failed to save options");

            throw error;
        }

        logger.debug("Successfully saved options");
    }

    @bind
    private async getOptions(): Promise<Options> {
        logger.debug("Options requested");
        logger.info("Fetching options");

        let options: Options;

        try {
            options = await this.extensionOptions.get();
        } catch (error) {
            logger.error("Failed to fetch options", { error: JSON.stringify(error) });

            throw error;
        }

        logger.debug("Successfully fetched options");

        return options;
    }

    @bind
    private async clearStorages(): Promise<void> {
        logger.debug("Storage reset requested");
        logger.info("Clearing storages");

        try {
            await Promise.all([
                this.extensionOptions.clear(),
                this.threadHistory.clear()
            ]);
        } catch (error) {
            logger.error("Failed to clear storages", { error: JSON.stringify(error) });

            throw error;
        }

        logger.debug("Successfully cleared storages");
    }

    @bind
    private async onThreadVisisted(threadId: string): Promise<void> {
        logger.debug("Thread visit notification", { threadId });
        logger.info("Saving thread in history", { threadId });

        try {
            await this.threadHistory.add(threadId);
        } catch (error) {
            logger.error("Failed to save thread in history",
                { threadId, error: JSON.stringify(error) });

            throw error;
        }

        logger.debug("Successfully saved thread in history", { threadId });
    }

    @bind
    private async onOptionsChanged(): Promise<void> {
        logger.info("Restarting BackgroundScript", {
            reason: "ExtensionOptions changed"
        });

        this.stop();

        let script: BackgroundScript;

        try {
            script = await BackgroundScript.start();
        } catch (error) {
            logger.error("Failed to start BackgroundScript", { error: JSON.stringify(error) });

            throw error;
        }

        try {
            await new StorageMigrator()
                .migrate(this.threadStorage, script.threadStorage);
        } catch (error) {
            logger.error("Failed to migrate storage", { error: JSON.stringify(error) });

            throw error;
        }

        onSettingsChanged.dispatch();
    }
}

/* This file should really be called 'eventScript' as it's only loaded when needed */

(async function entrypoint(): Promise<void> {
    logger.info("BackgroundScript loaded");

    try {
        await BackgroundScript.start();
    } catch (error) {
        logger.error("Failed to start BackgroundScript", { error: JSON.stringify(error) });
    }
})();
