"use client";

import {
    useEffect,
    useState,
} from "react";

import {useAuth0} from "@auth0/auth0-react";


const ADMIN_ROLE = "admin";
const AUTH0_ROLES_CLAIM = "https://cloud.yscope.com/roles";
const BASE64_QUANTUM = 4;

type Claims = Record<string, unknown>;

type AccessTokenRoleState = {
    identityKey: string;
    isAdmin: boolean;
};

type ConsoleUser = {
    email: string;
    initials: string;
    isAdmin: boolean;
    name: string;
    picture?: string;
};

/**
 * Reports whether a claim collection contains the tenant's admin role.
 *
 * @param claims Decoded access-token claims.
 * @return Whether the namespaced roles claim contains `admin`.
 */
const hasAdminRole = (claims: unknown): boolean => {
    if (null === claims || "object" !== typeof claims) {
        return false;
    }

    const roles = (claims as Claims)[AUTH0_ROLES_CLAIM];

    return Array.isArray(roles) && roles.includes(ADMIN_ROLE);
};

/**
 * Decodes JWT payload claims for display-only navigation decisions.
 *
 * The API independently verifies the token and enforces administrator access.
 *
 * @param token Auth0 access token.
 * @return The decoded claims, or `null` for a malformed token.
 */
const decodeJwtClaims = (token: string): Claims | null => {
    const [, encodedPayload] = token.split(".");

    if (!encodedPayload) {
        return null;
    }

    const base64Payload = encodedPayload
        .replaceAll("-", "+")
        .replaceAll("_", "/");
    const paddingLength = (
        BASE64_QUANTUM - (base64Payload.length % BASE64_QUANTUM)
    ) % BASE64_QUANTUM;

    try {
        const claims: unknown = JSON.parse(
            atob(base64Payload.padEnd(base64Payload.length + paddingLength, "=")),
        );

        return null !== claims && "object" === typeof claims ?
            claims as Claims :
            null;
    } catch {
        return null;
    }
};

/**
 * Builds a compact two-character fallback for the user avatar.
 *
 * @param name Resolved display name.
 * @return Uppercase avatar initials.
 */
const getInitials = (name: string): string => {
    const nameParts = name.trim().split(/\s+/u);
    const initials = 1 < nameParts.length ?
        `${nameParts[0]?.[0] ?? ""}${nameParts.at(-1)?.[0] ?? ""}` :
        name.slice(0, 2);

    return initials.toUpperCase();
};

/**
 * Reads the current user's display profile and administrator role from Auth0.
 *
 * @return Auth0-backed sidebar user details.
 */
const useConsoleUser = (): ConsoleUser => {
    const {getAccessTokenSilently, user} = useAuth0();
    const identityKey = user?.sub ?? user?.email ?? "";
    const [accessTokenRole, setAccessTokenRole] =
        useState<AccessTokenRoleState | null>(null);

    useEffect(() => {
        let isActive = true;

        if ("" !== identityKey) {
            getAccessTokenSilently()
                .then((accessToken) => {
                    if (isActive) {
                        setAccessTokenRole({
                            identityKey: identityKey,
                            isAdmin: hasAdminRole(decodeJwtClaims(accessToken)),
                        });
                    }
                })
                .catch(() => {
                    if (isActive) {
                        setAccessTokenRole({identityKey: identityKey, isAdmin: false});
                    }
                });
        }

        return () => {
            isActive = false;
        };
    }, [getAccessTokenSilently,
        identityKey]);

    const email = user?.email?.trim() ?? "";
    const name = user?.name?.trim() ||
        user?.nickname?.trim() ||
        email ||
        "Signed-in user";
    const resolvedAccessTokenRole = accessTokenRole?.identityKey === identityKey ?
        accessTokenRole.isAdmin :
        null;

    return {
        email: email,
        initials: getInitials(name),
        isAdmin: resolvedAccessTokenRole ?? false,
        name: name,
        ...(user?.picture ?
            {picture: user.picture} :
            {}),
    };
};


export {useConsoleUser};
export type {ConsoleUser};
