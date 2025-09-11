import {FormEvent} from "react";

import {
    buildSearchQuery,
    BuildSearchQueryProps,
} from "../../sql-parser";
import {handlePrestoQuerySubmit} from "./SearchControls/Presto/presto-search-requests";


/**
 * Returns a temporary testing component.
 *
 * @return
 */
const BuildSqlTest = () => {
    return (
        <form
            onSubmit={(ev: FormEvent<HTMLFormElement>) => {
                ev.preventDefault();
                const formData = new FormData(ev.target as HTMLFormElement);
                const props = Object.fromEntries(formData) as unknown as BuildSearchQueryProps;
                const sqlString = buildSearchQuery(props);
                console.error(`Built SQL: ${sqlString}`);
                handlePrestoQuerySubmit({queryString: sqlString});
            }}
        >
            <label>select:</label>
            <input name={"selectItemList"}/>
            <label>from:</label>
            <input name={"relationList"}/>
            <label>where:</label>
            <input name={"booleanExpression"}/>
            <label>order:</label>
            <input name={"sortItemList"}/>
            <label>limit:</label>
            <input name={"limitValue"}/>
            <button type={"submit"}>
                Run
            </button>
        </form>
    );
};

export {BuildSqlTest};
