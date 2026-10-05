import {
    Field,
    FieldLabel,
} from "~/components/ui/field";
import {Input} from "~/components/ui/input";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "~/components/ui/select";
import {
    CUSTOM_EXPIRY,
    EXPIRY_PRESET_DAYS,
    formatDateTime,
    NO_EXPIRY,
    resolveExpiry,
} from "~/lib/api-tokens";


type TokenExpiryFieldProps = {
    customDate: string;
    onCustomDateChange: (date: string) => void;
    onOptionChange: (option: string) => void;

    /** A number of days, "custom", or "never". */
    option: string;
};

const OPTIONS = [
    ...EXPIRY_PRESET_DAYS.map(String),
    CUSTOM_EXPIRY,
    NO_EXPIRY,
];

/**
 * Names an expiry option, with the date it resolves to when there is one.
 *
 * @param option
 * @param customDate The date field's value, used with `CUSTOM_EXPIRY`.
 * @return A label such as "90 days (expires Dec 28, 2026, 11:43 PM)".
 */
const getOptionLabel = (option: string, customDate: string): string => {
    if (NO_EXPIRY === option) {
        return "No expiration";
    }

    const name = CUSTOM_EXPIRY === option ?
        "Custom date" :
        `${option} days`;
    const expiresAt = resolveExpiry(option, customDate);

    return null === expiresAt ?
        name :
        `${name} (expires ${formatDateTime(expiresAt)})`;
};

/**
 * Renders the expiration controls of the create-token form.
 *
 * @param props
 * @param props.customDate
 * @param props.onCustomDateChange
 * @param props.onOptionChange
 * @param props.option
 * @return The labeled dropdown, and the date field when needed.
 */
const TokenExpiryField = ({
    customDate,
    onCustomDateChange,
    onOptionChange,
    option,
}: TokenExpiryFieldProps) => (
    <Field>
        <FieldLabel htmlFor={"token-expiry"}>Expiration</FieldLabel>
        <Select
            value={option}
            onValueChange={(value) => {
                if (null !== value) {
                    onOptionChange(value);
                }
            }}
        >
            <SelectTrigger
                className={"w-full"}
                id={"token-expiry"}
            >
                <SelectValue>
                    {getOptionLabel(option, customDate)}
                </SelectValue>
            </SelectTrigger>
            <SelectContent>
                <SelectGroup>
                    {OPTIONS.map((value) => (
                        <SelectItem
                            key={value}
                            value={value}
                        >
                            {getOptionLabel(value, customDate)}
                        </SelectItem>
                    ))}
                </SelectGroup>
            </SelectContent>
        </Select>
        {CUSTOM_EXPIRY === option ?
            <Input
                aria-label={"Expiration date"}
                required={true}
                type={"date"}
                value={customDate}
                onChange={(event) => {
                    onCustomDateChange(event.target.value);
                }}/> :
            null}
    </Field>
);


export {TokenExpiryField};
