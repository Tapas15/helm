import { randomUUID } from "node:crypto";
export function uid(prefix) {
    return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}
//# sourceMappingURL=id.js.map