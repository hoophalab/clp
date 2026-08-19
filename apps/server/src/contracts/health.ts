import * as z from "zod";


const HealthResponseSchema = z.strictObject({
    status: z.literal("ok"),
});

type HealthResponse = z.infer<typeof HealthResponseSchema>;

export {
    type HealthResponse,
    HealthResponseSchema,
};
