#!/usr/bin/env node

import {IamStack} from "../lib/iam-stack";
import {
    createApp,
    getConsoleServerUserNames,
    getEnv,
} from "./app-context";


const app = createApp();

// eslint-disable-next-line no-new
new IamStack(app, "Iam", {
    consoleServerUserNames: getConsoleServerUserNames(app),
    env: getEnv(),
});
