import type * as z from "zod";


/**
 * Validates a contract response immediately before Hono serializes it.
 *
 * The handler still calls context.json with a literal status so Hono RPC can
 * infer the exact body and status. This boundary catches runtime drift without
 * replacing Hono's official response typing pattern.
 *
 * @param schema The runtime response contract.
 * @param response The response value to validate.
 * @return The parsed response value.
 */
const parseContractResponse = <Schema extends z.ZodType>(
    schema: Schema,
    response: z.input<Schema>,
): z.output<Schema> => schema.parse(response);

export {parseContractResponse};
