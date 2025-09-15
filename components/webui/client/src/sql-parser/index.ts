/* eslint-disable max-classes-per-file */
import {
    CharStream,
    CommonTokenStream,
    ErrorListener,
    ParseTree,
    Recognizer,
    TerminalNode,
} from "antlr4";

import SqlBaseLexer from "./generated/SqlBaseLexer";
import SqlBaseParser, {
    BooleanExpressionContext,
    ColumnReferenceContext,
    PredicatedContext,
    QueryNoWithContext,
    QuerySpecificationContext,
    RelationListContext,
    SelectItemListContext,
    SortItemListContext,
} from "./generated/SqlBaseParser";
import SqlBaseVisitor from "./generated/SqlBaseVisitor";


type Nullable<T> = T | null;

class SyntaxError extends Error {
}

class SyntaxErrorListener<TSymbol> extends ErrorListener<TSymbol> {
    // eslint-disable-next-line max-params, class-methods-use-this
    override syntaxError (
        _recognizer: Recognizer<TSymbol>,
        _offendingSymbol: TSymbol,
        line: number,
        column: number,
        msg: string,
    ) {
        throw new SyntaxError(`line ${line}:${column}: ${msg}`);
    }
}

const LOWER_CASE_A_CHAR_CODE = 97;
const LOWER_CASE_Z_CHAR_CODE = 122;
const ASCII_CASE_OFFSET = 32;

class UpperCaseCharStream extends CharStream {
    // Override
    override LA (offset: number): number {
        // eslint-disable-next-line new-cap
        const c = super.LA(offset);
        if (0 >= c) {
            return c;
        }
        if (LOWER_CASE_A_CHAR_CODE <= c && LOWER_CASE_Z_CHAR_CODE >= c) {
            return c - ASCII_CASE_OFFSET;
        }

        return c;
    }
}

/**
 * Validate a SQL string for syntax errors.
 *
 * @param sqlString
 * @throws {SyntaxError} with line, column, and message details if a syntax error is found.
 */
const validate = (sqlString: string) => {
    const syntaxErrorListener = new SyntaxErrorListener();
    const lexer = new SqlBaseLexer(new UpperCaseCharStream(sqlString));
    lexer.removeErrorListeners();
    lexer.addErrorListener(syntaxErrorListener);
    const parser = new SqlBaseParser(new CommonTokenStream(lexer));
    parser.removeErrorListeners();
    parser.addErrorListener(syntaxErrorListener);
    parser.singleStatement();
};

/**
 * Creates a SQL parser for a given input string.
 *
 * @param input The SQL query string to be parsed.
 * @return The configured SQL parser instance ready to parse the input.
 */
const buildParser = (input: string): SqlBaseParser => {
    const syntaxErrorListener = new SyntaxErrorListener();
    const lexer = new SqlBaseLexer(new UpperCaseCharStream(input));
    lexer.removeErrorListeners();
    lexer.addErrorListener(syntaxErrorListener);
    const parser = new SqlBaseParser(new CommonTokenStream(lexer));
    parser.removeErrorListeners();
    parser.addErrorListener(syntaxErrorListener);

    return parser;
};

interface ModifierProps {
    selectItemList: SelectItemListContext;
    relationList: RelationListContext;
    booleanExpression: Nullable<BooleanExpressionContext>;
    sortItemList: Nullable<SortItemListContext>;
    limitValue: Nullable<TerminalNode>;
}

class Modifier extends SqlBaseVisitor<void> {
    constructor ({
        selectItemList,
        relationList,
        booleanExpression,
        sortItemList,
        limitValue,
    }: ModifierProps) {
        super();
        this.visitQuerySpecification = (ctx: QuerySpecificationContext) => {
            const children: ParseTree[] = [
                // eslint-disable-next-line new-cap
                ctx.SELECT(),
                selectItemList,
                // eslint-disable-next-line new-cap
                ctx.FROM(),
                relationList,
            ];

            if (null !== booleanExpression) {
                // eslint-disable-next-line new-cap
                children.push(ctx.WHERE(), booleanExpression);
            }
            ctx.children = children;
        };

        this.visitQueryNoWith = (ctx: QueryNoWithContext) => {
            this.visit(ctx.queryTerm());

            const children: ParseTree[] = [
                ctx.queryTerm(),
            ];

            if (null !== sortItemList) {
                // eslint-disable-next-line new-cap
                children.push(ctx.ORDER(), ctx.BY(), sortItemList);
            }
            if (null !== limitValue) {
                // eslint-disable-next-line new-cap
                children.push(ctx.LIMIT(), limitValue);
            }
            ctx.children = children;
        };
    }
}

class PrintVisitor extends SqlBaseVisitor<void> {
    tokens: Array<string> = [];

    override visitTerminal (node: TerminalNode) {
        this.tokens.push(node.getText());
    }
}

const TIMESTAMP_IDENTIFIERS = new Set(["timestamp",
    "\"timestamp\"",
    "`timestamp`"]);

class TimestampVisitor extends SqlBaseVisitor<void> {
    hasTimestamp: boolean;

    constructor () {
        super();
        this.visitPredicated = (ctx: PredicatedContext) => {
            const columnReference = ctx.valueExpression().getChild(0);
            if (columnReference instanceof ColumnReferenceContext) {
                const id = columnReference.identifier();
                if (TIMESTAMP_IDENTIFIERS.has(id.getText())) {
                    this.hasTimestamp = true;
                }
            } else {
                this.visitChildren(ctx);
            }
        };
    }
}

class BooleanExpressionHasTimestampError extends Error {
}

interface BuildSearchQueryProps {
    selectItemList: string;
    relationList: string;
    booleanExpression: string;
    sortItemList: string;
    limitValue: string;
}

const SEARCH_QUERY_TEMPLATE = "SELECT item FROM relation WHERE TRUE ORDER BY item LIMIT 1";
const SEARCH_QUERY_TEMPLATE_TREE = buildParser(SEARCH_QUERY_TEMPLATE).queryNoWith();

/**
 * Constructs a SQL search query string from a set of structured components.
 *
 * @param props
 * @param props.selectItemList
 * @param props.relationList
 * @param props.booleanExpression
 * @param props.sortItemList
 * @param props.limitValue
 * @return
 * @throws {SyntaxError} if any of the input is not valid.
 * @throws {Error} if the constructed SQL string is not valid.
 */
const buildSearchQuery = ({
    selectItemList,
    relationList,
    booleanExpression,
    sortItemList,
    limitValue,
}: BuildSearchQueryProps): string => {
    let booleanExpressionTree = null;
    if ("" !== booleanExpression) {
        booleanExpressionTree = buildParser(booleanExpression)
            .standaloneBooleanExpression()
            .booleanExpression();
        const visitor = new TimestampVisitor();
        visitor.visit(booleanExpressionTree);
        if (visitor.hasTimestamp) {
            throw new BooleanExpressionHasTimestampError(
                "Direct reference of timestamp column is not allowed."
            );
        }
    }

    new Modifier({
        /* eslint-disable sort-keys */
        selectItemList: buildParser(selectItemList)
            .standaloneSelectItemList()
            .selectItemList(),
        relationList: buildParser(relationList)
            .standaloneRelationList()
            .relationList(),
        booleanExpression: booleanExpressionTree,
        sortItemList: "" === sortItemList ?
            null :
            buildParser(sortItemList)
                .standaloneSortItemList()
                .sortItemList(),
        limitValue: "" === limitValue ?
            null :
            buildParser(limitValue).standaloneIntegerValue()
            // eslint-disable-next-line new-cap
                .INTEGER_VALUE(),
        /* eslint-enable sort-keys */
    }).visit(SEARCH_QUERY_TEMPLATE_TREE);

    const printVisitor = new PrintVisitor();
    printVisitor.visit(SEARCH_QUERY_TEMPLATE_TREE);
    const sqlString = printVisitor.tokens.join(" ");
    try {
        validate(sqlString);
    } catch (err: unknown) {
        throw new Error(`The constructed SQL is not valid: ${sqlString}`, {cause: err});
    }

    return sqlString;
};

export {
    buildSearchQuery,
    SyntaxError,
    validate,
};

export type {BuildSearchQueryProps};
