type DeploymentQuota =
    | {
        mode: "trial";

        /** Non-negative integer deployment cap; zero allows none. */
        limit: number;

        /** Non-negative integer number of deployments in use. */
        used: number;
    } |
    {mode: "ppu"};


export type {DeploymentQuota};
