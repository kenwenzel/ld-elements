import { getScope } from "@heximal/components";

export function getModel(node: Node) {
    while (true) {
        if (node.nodeType === Node.ELEMENT_NODE && (node as any)._model) {
            return (node as any)._model;
        }
        if (!node.parentNode) {
            return getScope(node) || {};
        }
        node = node.parentNode;
    }
};