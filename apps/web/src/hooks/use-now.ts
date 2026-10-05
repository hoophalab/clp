import {
    useEffect,
    useState,
} from "react";


const SECOND_MS = 1000;
const MINUTE_MS = 60_000;

/**
 * Tracks the current time so that statuses derived from timestamps stay
 * current while the page is open.
 *
 * @param isCountingDown Whether something on the page shows seconds, in which
 * case the clock ticks every second instead of every minute.
 * @return The current time.
 */
const useNow = (isCountingDown: boolean): Date => {
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        const timer = setInterval(
            () => {
                setNow(new Date());
            },
            isCountingDown ?
                SECOND_MS :
                MINUTE_MS,
        );

        return () => {
            clearInterval(timer);
        };
    }, [isCountingDown]);

    return now;
};


export {useNow};
