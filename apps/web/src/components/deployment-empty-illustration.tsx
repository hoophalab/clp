/**
 * Renders the background cloud and decorative marks.
 *
 * @return The illustration's background cloud and decorative marks.
 */
const DeploymentCloudArtwork = () => (
    <>
        <ellipse
            className={"fill-muted"}
            cx={"222"}
            cy={"210"}
            rx={"179"}
            ry={"10"}/>
        <g
            className={"stroke-brand/30"}
            strokeWidth={"3"}
        >
            <path
                strokeLinecap={"round"}
                d={`M109 142.5H98.5C71.7 142.5 50 121.1 50 94.8
                    C50 72 66.3 52.8 88.2 48.2C97.7 22.8 122.3 4.7 151.2 4.7
                    C184.5 4.7 212.1 28.7 217.1 60.1C222.9 57.9 229.2 56.7
                    235.8 56.7C264.6 56.7 288 79.7 288 108.1
                    C288 119.6 284.2 130.2 277.7 138.8`}/>
        </g>
        <g className={"fill-brand/20"}>
            <circle
                cx={"43"}
                cy={"63"}
                r={"4"}/>
            <circle
                cx={"348"}
                cy={"63"}
                r={"4"}/>
            <path
                d={`M310 43L314.5 53.5L325 58L314.5 62.5L310 73L305.5 62.5
                    L295 58L305.5 53.5L310 43Z`}/>
            <path
                d={`M300 104L303 111L310 114L303 117L300 124L297 117
                    L290 114L297 111L300 104Z`}/>
            <path
                d={`M36 164L39 171L46 174L39 177L36 184L33 177L26 174
                    L33 171L36 164Z`}/>
        </g>
    </>
);

/**
 * Renders the deployment servers and add-deployment target.
 *
 * @return The illustrated deployment servers and add-deployment target.
 */
const DeploymentServerArtwork = () => (
    <>
        <g
            className={"fill-card stroke-muted-foreground"}
            strokeWidth={"2.5"}
        >
            <rect
                height={"38"}
                rx={"7"}
                width={"108"}
                x={"118"}
                y={"91"}/>
            <rect
                height={"38"}
                rx={"7"}
                width={"108"}
                x={"118"}
                y={"126"}/>
            <rect
                height={"38"}
                rx={"7"}
                width={"108"}
                x={"118"}
                y={"161"}/>
        </g>
        <g className={"fill-brand"}>
            <circle
                cx={"136"}
                cy={"110"}
                r={"4"}/>
            <circle
                cx={"149"}
                cy={"110"}
                r={"4"}/>
            <circle
                cx={"136"}
                cy={"145"}
                r={"4"}/>
            <circle
                cx={"149"}
                cy={"145"}
                r={"4"}/>
            <circle
                cx={"136"}
                cy={"180"}
                r={"4"}/>
            <circle
                cx={"149"}
                cy={"180"}
                r={"4"}/>
        </g>
        <g
            className={"stroke-muted-foreground"}
            strokeLinecap={"round"}
            strokeWidth={"2.5"}
        >
            <path d={"M195 110H211"}/>
            <path d={"M195 145H211"}/>
            <path d={"M195 180H211"}/>
        </g>
        <path
            className={"stroke-muted-foreground"}
            d={"M226 161H303"}
            strokeDasharray={"7 8"}
            strokeWidth={"2.5"}/>
        <rect
            className={"fill-card stroke-brand/30"}
            height={"80"}
            rx={"11"}
            strokeDasharray={"7 7"}
            strokeWidth={"2.5"}
            width={"90"}
            x={"303"}
            y={"121"}/>
        <g
            className={"stroke-muted-foreground"}
            strokeLinecap={"round"}
            strokeWidth={"3"}
        >
            <path d={"M348 149V173"}/>
            <path d={"M336 161H360"}/>
        </g>
    </>
);

/**
 * Renders the illustration used by the deployment empty state.
 *
 * @return A decorative cloud deployment illustration.
 */
const DeploymentEmptyIllustration = () => (
    <svg
        aria-hidden={"true"}
        className={"h-56 w-[28rem] max-w-full"}
        fill={"none"}
        viewBox={"0 0 448 224"}
        xmlns={"http://www.w3.org/2000/svg"}
    >
        <DeploymentCloudArtwork/>
        <DeploymentServerArtwork/>
    </svg>
);


export {DeploymentEmptyIllustration};
