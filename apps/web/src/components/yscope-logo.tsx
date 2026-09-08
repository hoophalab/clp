import {cn} from "~/lib/utils";


type YScopeLogoProps = {
    className?: string;
};

/**
 * Renders the YScope wordmark.
 *
 * @param props The component properties.
 * @param props.className CSS classes for the wordmark's size and layout.
 * @return The YScope wordmark.
 */
const YScopeLogo = ({className}: YScopeLogoProps) => {
    return (
        <span
            className={cn(
                "font-logo font-bold leading-[1.2] text-brand",
                className,
            )}
        >
            YScope
        </span>
    );
};


export {YScopeLogo};
