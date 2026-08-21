import type {RequestIdVariables} from "hono/request-id";


type AuthenticationVariables = {
    email: string;
    isAdmin: boolean;
    userId: string;
};

type ServerEnv = {
    Variables: AuthenticationVariables & RequestIdVariables;
};

export type {ServerEnv};
