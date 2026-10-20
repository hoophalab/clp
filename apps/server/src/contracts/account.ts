import * as z from "zod";


const MAX_NAME_LENGTH = 200;
const MAX_COMPANY_LENGTH = 200;

const EulaSchema = z.strictObject({
    url: z.url({protocol: /^https$/u}),
    version: z.string().trim()
        .min(1)
        .max(100),
});

const CompleteOnboardingRequestSchema = z.strictObject({
    name: z.string().trim()
        .min(1)
        .max(MAX_NAME_LENGTH),
    companyName: z.string().trim()
        .max(MAX_COMPANY_LENGTH)
        .default(""),
    acceptEula: z.literal(true),
    eulaVersion: z.string().min(1)
        .max(100),
});

const AccountOverviewResponseSchema = z.strictObject({
    companyName: z.string(),
    completed: z.boolean(),
    email: z.email(),
    eula: EulaSchema,
    name: z.string(),
});

type Eula = z.infer<typeof EulaSchema>;

type CompleteOnboardingRequest = z.infer<typeof CompleteOnboardingRequestSchema>;

type AccountOverviewResponse = z.infer<typeof AccountOverviewResponseSchema>;

export {
    type AccountOverviewResponse,
    AccountOverviewResponseSchema,
    type CompleteOnboardingRequest,
    CompleteOnboardingRequestSchema,
    type Eula,
    EulaSchema,
};
