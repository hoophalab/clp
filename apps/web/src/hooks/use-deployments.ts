import {
    useEffect,
    useState,
} from "react";

import type {DeploymentResponse} from "@cloud.yscope.com/server/contracts";

import type {ApiClient} from "~/lib/api-client";


const POLL_INTERVAL_MS = 10_000;
const PAGE_LIMIT = 100;
const REFRESH_EVENT = "deployments:refresh";

type DeploymentList = {
    deployments: readonly DeploymentResponse[] | null;
    hasLoadFailed: boolean;
};

/**
 * Loads every page of deployments available to the caller.
 *
 * @param apiClient
 * @return The deployments in the order returned by the API.
 */
const getAllDeployments = async (apiClient: ApiClient): Promise<readonly DeploymentResponse[]> => {
    const deployments: DeploymentResponse[] = [];
    let page = 1;
    let total: number | null = null;

    while (null === total || deployments.length < total) {
        const response = await apiClient.api.v1.deployments.$get({
            query: {
                limit: String(PAGE_LIMIT),
                page: String(page),
            },
        });

        if (!response.ok) {
            throw new Error("Failed to load deployments.");
        }

        const {data, total: resultTotal} = await response.json();

        deployments.push(...data);
        total = resultTotal;
        if (deployments.length < total && 0 === data.length) {
            throw new Error("Deployment pagination ended before reaching the reported total.");
        }

        ++page;
    }

    return deployments;
};

/** Asks every mounted deployment list to reload now. */
const refreshDeployments = () => {
    window.dispatchEvent(new Event(REFRESH_EVENT));
};

/**
 * Requests asynchronous deletion of a deployment.
 *
 * @param apiClient
 * @param deploymentId
 */
const deleteDeployment = async (
    apiClient: ApiClient,
    deploymentId: string,
): Promise<void> => {
    const response = await apiClient.api.v1.deployments[":id"].$delete({
        param: {id: deploymentId},
    });

    if (!response.ok) {
        throw new Error("Failed to delete deployment.");
    }
};

/**
 * Loads the caller's deployments and keeps them current by polling.
 *
 * @param apiClient
 * @return The deployment list.
 */
const useDeployments = (apiClient: ApiClient) => {
    const [list, setList] = useState<DeploymentList>({
        deployments: null,
        hasLoadFailed: false,
    });

    useEffect(() => {
        let isActive = true;
        const load = async () => {
            try {
                const deployments = await getAllDeployments(apiClient);

                if (isActive) {
                    setList({deployments: deployments, hasLoadFailed: false});
                }
            } catch {
                if (isActive) {
                    setList(({deployments}) => ({deployments: deployments, hasLoadFailed: true}));
                }
            }
        };
        const reload = () => {
            load().catch(() => {
                // load() handles its own failures.
            });
        };

        reload();
        const timer = setInterval(reload, POLL_INTERVAL_MS);
        window.addEventListener(REFRESH_EVENT, reload);

        return () => {
            isActive = false;
            clearInterval(timer);
            window.removeEventListener(REFRESH_EVENT, reload);
        };
    }, [apiClient]);

    return list;
};


export {
    deleteDeployment,
    refreshDeployments,
    useDeployments,
};
