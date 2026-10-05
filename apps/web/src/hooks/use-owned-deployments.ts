import {
    useCallback,
    useEffect,
    useState,
} from "react";

import type {DeploymentResponse} from "@cloud.yscope.com/server/contracts";

import type {ApiClient} from "~/lib/api-client";


const PAGE_LIMIT = 100;
const AUTH0_SUBJECT_PREFIX = "auth0|";

type OwnedDeploymentList = {

    /** The deployments the user owns, or null until the first load succeeds. */
    deployments: readonly DeploymentResponse[] | null;

    /** Whether the latest load failed. */
    hasLoadFailed: boolean;

    /** Loads the list again. */
    reload: () => void;
};

/**
 * Loads every page of the caller's deployments.
 *
 * @param api The API client.
 * @return All deployments the API lists for the caller.
 */
const loadAllDeployments = async (api: ApiClient): Promise<DeploymentResponse[]> => {
    const deployments: DeploymentResponse[] = [];
    let page = 1;
    let total = Infinity;

    while (deployments.length < total) {
        const response = await api.api.v1.deployments.$get({
            query: {limit: String(PAGE_LIMIT), page: String(page)},
        });

        if (!response.ok) {
            throw new Error("Failed to load deployments.");
        }

        const body = await response.json();

        deployments.push(...body.data);
        ({total} = body);
        if (body.data.length < PAGE_LIMIT) {
            break;
        }
        page += 1;
    }

    return deployments;
};

/**
 * Loads the deployments the signed-in user owns, on every page the API
 * returns.
 *
 * TODO: Admins are listed every deployment but see only their own here.
 * Revisit once the console has an admin view.
 *
 * @param api The API client.
 * @param subject The user's Auth0 subject, as `useAuth0().user.sub` reports it.
 * @return The owned deployments and a way to load them again.
 */
const useOwnedDeployments = (api: ApiClient, subject: string): OwnedDeploymentList => {
    const [list, setList] = useState<Omit<OwnedDeploymentList, "reload">>({
        deployments: null,
        hasLoadFailed: false,
    });
    const [loadCount, setLoadCount] = useState(0);

    useEffect(() => {
        let isActive = true;

        // Deployments record the owner without the "auth0|" prefix.
        const ownerId = subject.startsWith(AUTH0_SUBJECT_PREFIX) ?
            subject.slice(AUTH0_SUBJECT_PREFIX.length) :
            subject;

        loadAllDeployments(api)
            .then((deployments) => {
                if (isActive) {
                    setList({
                        deployments: deployments.filter(
                            ({metadata}) => metadata.owner_id === ownerId,
                        ),
                        hasLoadFailed: false,
                    });
                }
            })
            .catch(() => {
                if (isActive) {
                    setList(({deployments}) => ({deployments: deployments, hasLoadFailed: true}));
                }
            });

        return () => {
            isActive = false;
        };
    }, [api,
        loadCount,
        subject]);

    const reload = useCallback(() => {
        setLoadCount((count) => count + 1);
    }, []);

    return {...list, reload: reload};
};


export {
    type OwnedDeploymentList,
    useOwnedDeployments,
};
