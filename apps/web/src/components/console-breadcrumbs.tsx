import {Fragment} from "react";
import {Link} from "react-router";

import {HomeIcon} from "lucide-react";

import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "~/components/ui/breadcrumb";
import type {ConsoleBreadcrumb} from "~/lib/console-route";
import {cn} from "~/lib/utils";


/**
 * Renders the appropriate element for a breadcrumb's position and destination.
 *
 * @param props The breadcrumb properties.
 * @param props.crumb The label and optional destination.
 * @param props.isCurrent Whether this is the active page.
 * @return A link, section label, or current-page label.
 */
const BreadcrumbLabel = ({crumb, isCurrent}: {
    crumb: ConsoleBreadcrumb;
    isCurrent: boolean;
}) => {
    if (isCurrent) {
        return (
            <BreadcrumbPage className={"truncate"}>
                {crumb.label}
            </BreadcrumbPage>
        );
    }
    if (crumb.to) {
        return (
            <BreadcrumbLink
                className={"truncate"}
                render={<Link to={crumb.to}/>}
            >
                {crumb.label}
            </BreadcrumbLink>
        );
    }

    return (
        <span className={"truncate"}>
            {crumb.label}
        </span>
    );
};

/**
 * Renders page-owned breadcrumbs with a linked parent and a non-clickable current page.
 *
 * @param props The breadcrumb properties.
 * @param props.breadcrumbs The active page's navigation hierarchy.
 * @return The responsive console breadcrumb trail.
 */
const ConsoleBreadcrumbs = ({breadcrumbs}: {breadcrumbs: readonly ConsoleBreadcrumb[]}) => {
    const firstMobileIndex = breadcrumbs.findIndex(
        (crumb, index) => crumb.to || index === breadcrumbs.length - 1,
    );

    return (
        <Breadcrumb className={"min-w-0"}>
            <BreadcrumbList className={"flex-nowrap"}>
                <BreadcrumbItem className={"hidden shrink-0 sm:inline-flex"}>
                    <BreadcrumbLink
                        aria-label={"Cloud Console home"}
                        render={<Link to={"/"}/>}
                    >
                        <HomeIcon className={"size-4"}/>
                    </BreadcrumbLink>
                </BreadcrumbItem>
                {breadcrumbs.map((crumb, index) => {
                    const isCurrent = index === breadcrumbs.length - 1;
                    const isSection = !isCurrent && !crumb.to;
                    const visibility = isSection ?
                        "hidden sm:inline-flex" :
                        "inline-flex";

                    return (
                        <Fragment key={crumb.label}>
                            <BreadcrumbSeparator
                                className={cn(
                                    "shrink-0",
                                    index <= firstMobileIndex || isSection ?
                                        "hidden sm:block" :
                                        "block",
                                )}/>
                            <BreadcrumbItem className={cn("min-w-0", visibility)}>
                                <BreadcrumbLabel
                                    crumb={crumb}
                                    isCurrent={isCurrent}/>
                            </BreadcrumbItem>
                        </Fragment>
                    );
                })}
            </BreadcrumbList>
        </Breadcrumb>
    );
};


export {ConsoleBreadcrumbs};
