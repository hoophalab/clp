import CommonConfig from "eslint-config-yscope/CommonConfig.mjs";
import ReactConfigArray from "eslint-config-yscope/ReactConfigArray.mjs";
import StylisticConfigArray from "eslint-config-yscope/StylisticConfigArray.mjs";
import TsConfigArray, {createTsConfigOverride} from "eslint-config-yscope/TsConfigArray.mjs";


const EslintConfig = [
    {
        ignores: [
            ".react-router/",
            "build/",
            "dist/",
            "node_modules/",
            "src/components/ui/",
        ],
    },
    CommonConfig,
    ...TsConfigArray,
    createTsConfigOverride(
        [
            "src/**/*.ts",
            "src/**/*.tsx",
            "*.ts",
        ],
        "./tsconfig.json",
    ),
    ...StylisticConfigArray,
    ...ReactConfigArray,
];


export default EslintConfig;
