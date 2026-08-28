import * as React from "react";


const MOBILE_BREAKPOINT = 768;
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

/**
 * Returns the stable server-side viewport classification.
 *
 * @return Always false because no viewport is available during server rendering.
 */
const getServerSnapshot = (): boolean => {
    return false;
};

/**
 * Reads whether the current browser viewport matches the mobile breakpoint.
 *
 * @return Whether the viewport is mobile-sized.
 */
const getSnapshot = (): boolean => {
    return window.matchMedia(MOBILE_QUERY).matches;
};

/**
 * Subscribes to changes in the mobile media query.
 *
 * @param onStoreChange Callback invoked when the query result changes.
 * @return A function that removes the media-query listener.
 */
const subscribe = (onStoreChange: () => void) => {
    const mediaQuery = window.matchMedia(MOBILE_QUERY);

    mediaQuery.addEventListener("change", onStoreChange);

    return () => {
        mediaQuery.removeEventListener("change", onStoreChange);
    };
};

/**
 * Reports whether the current viewport is mobile-sized.
 *
 * @return Whether the viewport is below the mobile breakpoint.
 */
const useIsMobile = (): boolean => {
    return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
};


export {useIsMobile};
