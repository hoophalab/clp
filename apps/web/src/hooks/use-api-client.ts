import {useMemo} from "react";

import {useAuth0} from "@auth0/auth0-react";

import {
    type ApiClient,
    createApiClient,
} from "~/lib/api-client";


/**
 * Returns an API client that authenticates as the signed-in Auth0 user.
 *
 * @return The typed Cloud Console API client.
 */
const useApiClient = (): ApiClient => {
    const {getAccessTokenSilently} = useAuth0();

    return useMemo(
        () => createApiClient(() => getAccessTokenSilently()),
        [getAccessTokenSilently],
    );
};


export {useApiClient};
