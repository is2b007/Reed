export type WorkspaceShortcut =
  | "graph"
  | "beats"
  | "playtest"
  | "translation"
  | "characters"
  | "validation"
  | "review"
  | "production"
  | "read";

const workspaceByKey: Record<string, WorkspaceShortcut> = {
  "1": "graph",
  "2": "beats",
  "3": "playtest",
  "4": "translation",
  "5": "characters",
  "6": "validation",
  "7": "review",
  "8": "production",
  "9": "read",
};

export function globalShortcut(key: string, modified: boolean): WorkspaceShortcut | "toggle-project" | null {
  if (!modified) return null;
  if (key.toLowerCase() === "k") return "toggle-project";
  return workspaceByKey[key] ?? null;
}

export function nextMenuIndex(current: number, count: number, key: string): number | null {
  if (count <= 0) return null;
  if (key === "ArrowDown") return (current + 1 + count) % count;
  if (key === "ArrowUp") return (current - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

export function promptValueIsValid(value: string, requiredValue?: string): boolean {
  if (requiredValue !== undefined) return value === requiredValue;
  return value.trim().length > 0;
}

type ConditionValue = string | number | boolean;
type Token =
  | { type: "keyword"; value: "and" | "or" | "not" | "true" | "false" | "Variable" }
  | { type: "string"; value: string }
  | { type: "number"; value: number }
  | { type: "operator"; value: "==" | "~=" | "!=" | ">" | ">=" | "<" | "<=" }
  | { type: "punctuation"; value: "(" | ")" | "[" | "]" };

export interface ConditionResult {
  allowed: boolean;
  supported: boolean;
}

function unquote(value: string): string {
  const body = value.slice(1, -1);
  return body.replace(/\\([\\'"nrt])/g, (_match, escaped: string) => {
    if (escaped === "n") return "\n";
    if (escaped === "r") return "\r";
    if (escaped === "t") return "\t";
    return escaped;
  });
}

function tokenize(source: string): Token[] | null {
  const tokens: Token[] = [];
  let offset = 0;
  const pattern = /\s*(?:(Variable|and|or|not|true|false)|('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")|(-?\d+(?:\.\d+)?)|(==|~=|!=|>=|<=|>|<)|(\(|\)|\[|\]))/y;
  while (offset < source.length) {
    if (source.slice(offset).trim().length === 0) break;
    pattern.lastIndex = offset;
    const match = pattern.exec(source);
    if (!match) return null;
    offset = pattern.lastIndex;
    if (match[1]) tokens.push({ type: "keyword", value: match[1] as Extract<Token, { type: "keyword" }>["value"] });
    else if (match[2]) tokens.push({ type: "string", value: unquote(match[2]) });
    else if (match[3]) tokens.push({ type: "number", value: Number(match[3]) });
    else if (match[4]) tokens.push({ type: "operator", value: match[4] as Extract<Token, { type: "operator" }>["value"] });
    else if (match[5]) tokens.push({ type: "punctuation", value: match[5] as Extract<Token, { type: "punctuation" }>["value"] });
  }
  return tokens;
}

export function evaluatePlaytestCondition(source: string, variables: Record<string, ConditionValue>): ConditionResult {
  if (!source.trim()) return { allowed: true, supported: true };
  const tokens = tokenize(source);
  if (!tokens) return { allowed: false, supported: false };
  let index = 0;
  let supported = true;
  const peek = () => tokens[index];
  const take = () => tokens[index++];
  const punctuation = (value: Extract<Token, { type: "punctuation" }>["value"]) => {
    const token = peek();
    if (token?.type !== "punctuation" || token.value !== value) return false;
    index += 1;
    return true;
  };
  const keyword = (value: Extract<Token, { type: "keyword" }>["value"]) => {
    const token = peek();
    if (token?.type !== "keyword" || token.value !== value) return false;
    index += 1;
    return true;
  };
  const operand = (): ConditionValue | undefined => {
    const token = take();
    if (!token) return undefined;
    if (token.type === "string" || token.type === "number") return token.value;
    if (token.type === "keyword" && (token.value === "true" || token.value === "false")) return token.value === "true";
    if (token.type === "keyword" && token.value === "Variable") {
      if (!punctuation("[")) return undefined;
      const name = take();
      if (name?.type !== "string" || !punctuation("]") || !(name.value in variables)) return undefined;
      return variables[name.value];
    }
    return undefined;
  };
  const compare = (left: ConditionValue, operator: Extract<Token, { type: "operator" }>["value"], right: ConditionValue): boolean => {
    if (operator === "==") return left === right;
    if (operator === "~=" || operator === "!=") return left !== right;
    if (typeof left !== typeof right || (typeof left !== "number" && typeof left !== "string")) return false;
    if (operator === ">") return left > right;
    if (operator === ">=") return left >= right;
    if (operator === "<") return left < right;
    return left <= right;
  };
  const primary = (): boolean => {
    if (punctuation("(")) {
      const value = parseOr();
      if (!punctuation(")")) supported = false;
      return value;
    }
    const left = operand();
    if (left === undefined) { supported = false; return false; }
    const next = peek();
    if (next?.type !== "operator") return Boolean(left);
    take();
    const right = operand();
    if (right === undefined) { supported = false; return false; }
    return compare(left, next.value, right);
  };
  const parseNot = (): boolean => keyword("not") ? !parseNot() : primary();
  const parseAnd = (): boolean => {
    let value = parseNot();
    while (keyword("and")) value = parseNot() && value;
    return value;
  };
  const parseOr = (): boolean => {
    let value = parseAnd();
    while (keyword("or")) value = parseAnd() || value;
    return value;
  };
  const allowed = parseOr();
  if (index !== tokens.length) supported = false;
  return { allowed: supported && allowed, supported };
}
