import {
    type ClassValue,
    clsx,
} from "clsx";
import {twMerge} from "tailwind-merge";


/**
 * Combines conditional class names and resolves Tailwind CSS conflicts.
 *
 * @param inputs The class values to combine.
 * @return The merged class-name string.
 */
const cn = (...inputs: ClassValue[]) => {
    return twMerge(clsx(inputs));
};


export {cn};
