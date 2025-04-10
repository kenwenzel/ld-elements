import { CompiledTemplate, CompiledTemplateResult, nothing, render as renderLit, TemplateInstance, TemplateResult } from 'lit-html';
import { _$LH } from 'lit-html/private-ssr-support.js';

import { EvalAstFactory, parse, Parser } from '@heximal/expressions';
import type { Expression, Scope } from '@heximal/expressions/lib/eval';
import { defaultHandlers, Renderers, TemplateFunction, TemplateHandler, TemplateHandlers } from '@heximal/templates';

const bindingRegex = /(?<!\\){{(.*?)(?:(?<!\\)}})/g;

const hasEscapedBindingMarkers = (s: string) => /(?:\\{{)|(?:\\}})/g.test(s);

const unescapeBindingMarkers = (s: string) => s.replace(/\\{{/g, '{{').replace(/\\}}/g, '}}');

const getTemplateHtml = _$LH.getTemplateHtml

export function rdfa(strings: TemplateStringsArray, ...values: unknown[]): TemplateResult<any> {
    const result = {
        ['_$litType$']: 1,
        ['_$isRdfa$']: true,
        strings,
        values,
    }
    return result
}

export function toHtml(template: TemplateResult<any>, newValues: Array<any> = []) {
    const newStrings = new Array<string>();
    // required dummy to make getTemplateHtml work
    (newStrings as any).raw = [""]
    expandTemplates(template, newStrings, newValues)
    return getTemplateHtml(newStrings as any as TemplateStringsArray, 1)
}

function expandTemplates(template: TemplateResult<any>, newStrings: Array<string>, newValues: Array<any>) {
    var appendNext = false
    for (var i = 0; i < template.strings.length; i++) {
        const str = template.strings[i]
        // directly append the next string part to ensure that lit doesn't insert a value marker
        // TODO it is maybe necessary to check if appending is allowed here, e.g. in the case of
        // attribute expressions
        if ((i == 0 || appendNext) && newStrings.length > 0) {
            newStrings[newStrings.length - 1] += str
        } else {
            newStrings.push(str)
        }
        appendNext = false
        if (i < template.values.length) {
            const value: any = template.values[i]
            if (value.hasOwnProperty('_$isRdfa$')) {
                expandTemplates(value as TemplateResult, newStrings, newValues)
                appendNext = true
            } else {
                newValues.push(value)
            }
        }
    }
}

const { AttributePart, PropertyPart, BooleanAttributePart, EventPart } = _$LH;

const astFactory = new EvalAstFactory();
const expressionCache = new Map<string, Expression | undefined>();

const toCamelCase = (s: string) =>
    s.replace(/-(-|\w)/g, (_, p1: string) => p1.toUpperCase());

/**
 * Replace all expression by their values within a given string.
 * 
 * @param s the string with expressions
 * @param model the current model
 * @returns string with replaced expressions
 */
export function replaceExpressions(s: string, model: any): string {
    const splitValue = s.split(bindingRegex);
    if (splitValue.length === 1) {
        return hasEscapedBindingMarkers(s) ? unescapeBindingMarkers(s) : s;
    }

    const results = [unescapeBindingMarkers(splitValue[0])];
    const exprs: Array<Expression> = [];
    for (let i = 1; i < splitValue.length; i += 2) {
        const exprText = splitValue[i];
        results.push(getSingleValue(`{{ ${exprText} }}`, model))
        results.push(unescapeBindingMarkers(splitValue[i + 1]));
    }

    return results.join('');
}

/**
 * Gets the value from a string that contains a delimted expression: {{ ... }}
 */
const getSingleValue = (s: string, model: any) => {
    let ast = expressionCache.get(s);
    if (ast === undefined) {
        if (expressionCache.has(s)) {
            return undefined;
        }
        s = s.trim();
        if (s.startsWith('{{') && s.endsWith('}}')) {
            const expression = s.substring(2, s.length - 2).trim();
            ast = new Parser(expression, astFactory).parse();
            expressionCache.set(s, ast);
        }
    }
    return ast?.evaluate(model);
};

/**
 * Groups elements of an array by a given key function.
 *
 * @param array The array with the elements
 * @param keyFunc The key function
 * @returns map of grouped elements
 */
const groupBy = function <E>(array: E[], keyFunc: (e: E) => string | undefined): Map<string, E[]> {
    return array.reduce((grouped, x) => {
        const key = keyFunc(x);
        if (key !== undefined) {
            let list = grouped.get(key)
            if (!list) {
                list = []
                grouped.set(key, list)
            }
            list?.push(x)
        }
        return grouped;
    }, new Map<string, E[]>());
}

type BindingInfo = {
    optional: boolean
    attributes: string[]
}

function findTemplateVars(template: Element): Map<string, BindingInfo> {
    const attributeNames = template.getAttributeNames();
    const bindings = attributeNames.reduce((prev, name) => {
        const value = template.getAttribute(name)!
        if (value.startsWith("?") || value.startsWith("$")) {
            // this is an attribute that needs a binding
            const optional = value.startsWith("??") || value?.startsWith("?$")
            const varName = value.replace(/^[?]?[?$]/, "")
            const bindingInfo: BindingInfo = prev.get(varName) || { optional: false, attributes: [] }
            bindingInfo.optional = optional
            bindingInfo.attributes.push(name)
            prev.set(varName, bindingInfo)
        }
        return prev
    }, new Map<string, BindingInfo>());
    return bindings
}

const bindHandler: TemplateHandler = (
    template: HTMLTemplateElement,
    model: any,
    handlers: TemplateHandlers,
    renderers: Renderers
) => {
    const element = template.content.firstElementChild!
    const templateVars = findTemplateVars(element)
    // group results by binding combinations
    // {
    //   "s": { "type": "uri" , "value": "http://example.org/someThing" } ,
    //   "label": { "type": "literal" , "value": "Thing 1" }
    // }
    const groupedBindings = groupBy(model['bindings'] as any[] || [], (e: any) => {
        let key = ""
        for (const [varName, bindingInfo] of templateVars) {
            const value = e[varName]
            if (!value && !bindingInfo.optional) {
                // do not add to a group if required binding is missing
                return undefined
            }
            key += JSON.stringify(value)
        }
        return key
    })

    const litTemplate = getLitTemplate(template);

    let index = -1;
    const result = [];
    for (const [key, bindings] of groupedBindings) {
        index++;
        const itemModel = Object.create(model);
        itemModel.bindings = bindings;
        itemModel.index = index;
        itemModel['this'] = model['this'] ?? model;
        for (const binding of bindings) {
            for (const [varName, v] of Object.entries(binding)) {
                itemModel[varName] = (v as any)?.value;
            }
        }

        const resultValues: Array<unknown> = [];
        litTemplate.parts.map((part) => {
            const value = part.update(itemModel, handlers, renderers);
            if (part.type === 1) {
                resultValues.push(...(value as Iterable<unknown>));
            } else {
                resultValues.push(value);
            }
        });
        const templateResult: CompiledTemplateResult = {
            _$litType$: litTemplate,
            values: resultValues,
        };
        result.push(templateResult);
    }
    return result.length > 0 ? result : nothing;
};

/**
 * @returns {Function} a template function of the form (model) => TemplateResult
 */
export const prepareTemplate = (
    template: HTMLTemplateElement,
    handlers: TemplateHandlers = defaultHandlers,
    renderers: Renderers = {},
    superTemplate?: HTMLTemplateElement
): TemplateFunction => {
    const litTemplate = getLitTemplate(template);
    const templateRenderers = litTemplate.renderers;
    if (superTemplate) {
        // TODO how to combine values and super template?
        const superLitTemplate = getLitTemplate(superTemplate);
        const superRenderers = superLitTemplate.renderers;
        const superCallRenderer = templateRenderers['super'];

        if (superCallRenderer !== undefined) {
            // Explicit super call

            // render the sub template with:
            renderers = {
                // sub template's own renderes
                ...templateRenderers,
                // passed-in renderers
                ...renderers,
                // a super call renderer
                super: (model, handlers, renderers) => {
                    // This renderer delegates to the super block in the sub template,
                    // which in turn delegates back to the super renderer below, but with
                    // the inner blocks of the super call.
                    // when the super call goes, render with:
                    renderers = {
                        // super template's own blocks
                        ...superRenderers,
                        // passed-in renderers
                        ...renderers,
                        // sub template's overrides will be added by the inner super call
                        super: (model, handlers, renderers) => {
                            return evaluateTemplate(
                                superTemplate,
                                model,
                                handlers,
                                renderers
                            );
                        },
                    };
                    return superCallRenderer(model, handlers, renderers);
                },
            };
        } else {
            // Implicit super call

            // Wrap the whole template in an implicit super call by rendering the
            // super template first, but using the block renderers from this template.
            // Render the super template with:
            renderers = {
                // super template's own blocks
                ...superRenderers,
                // sub template's overrides
                ...templateRenderers,
                // passed-in renderers
                ...renderers,
            };
            template = superTemplate;
        }
    } else {
        // No super call
        renderers = {
            ...renderers,
            ...templateRenderers,
        };
    }
    return (model) => evaluateTemplate(template, model, handlers, renderers);
};

/**
 * Renders a template element containing a Stampino template.
 *
 * This is a convenience function wrapper around:
 *
 * ```
 * import {render} from 'lit';
 * const templateFn = prepareTemplate(templateEl);
 * render(templateFn(model), container);
 * ```
 */
export const render = (
    template: HTMLTemplateElement,
    container: HTMLElement,
    model: any,
    handlers: TemplateHandlers = defaultHandlers
) => {
    const litTemplate = prepareTemplate(template, handlers);
    renderLit(litTemplate(model), container);
};

/**
 * Evaluates the given template and returns its result
 *
 * @param template
 * @param model
 * @param handlers
 * @param renderers
 * @returns
 */
export const evaluateTemplate = (
    template: HTMLTemplateElement,
    model: any,
    handlers: TemplateHandlers = defaultHandlers,
    renderers: Renderers = {}
) => {
    const litTemplate = getLitTemplate(template);
    const resultValues: Array<unknown> = [];
    for (const part of litTemplate.parts) {
        const value = part.update(model, handlers, renderers);
        if (part.type === 1) {
            resultValues.push(...(value as Iterable<unknown>));
        } else {
            resultValues.push(value);
        }
    }
    const templateResult: CompiledTemplateResult = {
        _$litType$: litTemplate,
        values: resultValues,
    };
    return templateResult;
};

type TemplatePart = TemplateInstance['_$template']['parts'][0];

type UpdatableTemplatePart = TemplatePart & {
    update: PartUpdater;
};

type PartUpdater = (
    model: object,
    handlers: TemplateHandlers,
    blocks: Renderers
) => unknown;

interface ExtendedTemplate extends CompiledTemplate {
    parts: Array<UpdatableTemplatePart>;
    renderers: Renderers;
}

const litTemplateCache = new Map<Element, ExtendedTemplate>();

const createAttributeBinder = (attributeName: string, value: string): PartUpdater => {
    // this is an attribute that needs a binding
    const optional = value.startsWith("??") || value?.startsWith("?$")
    const varName = value.replace(/^[?]?[?$]/, "")
    return (model: any, _handlers: TemplateHandlers, _renderers: Renderers) => {
        return [model['bindings']?.[0]?.[varName]?.value]
    }
}

export const getLitTemplate = (
    template: HTMLTemplateElement,
): ExtendedTemplate => {
    let litTemplate = litTemplateCache.get(template);
    if (litTemplate === undefined) {
        litTemplateCache.set(template, (litTemplate = makeLitTemplate(template)));
    }
    return litTemplate;
};

const makeLitTemplate = (template: HTMLTemplateElement): ExtendedTemplate => {
    const litTemplate: ExtendedTemplate = {
        h: undefined as unknown as TemplateStringsArray,
        el: template.cloneNode(true) as HTMLTemplateElement,
        parts: [],
        renderers: {},
    };
    const walker = document.createTreeWalker(
        litTemplate.el!.content,
        NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT | NodeFilter.SHOW_COMMENT,
    );
    let node: Node | null = walker.currentNode;
    let nodeIndex = -1;
    const elementsToRemove = [];

    while ((node = walker.nextNode()) !== null) {
        if (node.nodeType === Node.COMMENT_NODE) {
            nodeIndex++;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            nodeIndex++;
            const element = node as Element;
            const attributeNames = element.getAttributeNames();
            const skip = element.hasAttribute("_skipRdfa");
            if (skip) {
                element.removeAttribute("_skipRdfa");
            }
            if (!skip && attributeNames.find(name => {
                if (name.endsWith("$lit$")) {
                    // ignore attributes bound by expressions
                    return false
                } else {
                    const value = element.getAttribute(name)
                    return value?.startsWith("?") || value?.startsWith("$")
                }
            }) !== undefined) {
                // very important: go to next sibling before element is removed by re-parenting
                const hasSibling = walker.nextSibling();

                element.setAttribute("_skipRdfa", "true");
                element.parentNode!.insertBefore(document.createComment(''), element);
                // wrap element by template which is rendered using the bind handler
                const bindTemplate = document.createElement('TEMPLATE') as HTMLTemplateElement;
                bindTemplate.setAttribute("type", "rdfa-bind");
                bindTemplate.content.appendChild(element);

                // this node requires bindings
                let update = (model: any, handlers: TemplateHandlers, renderers: Renderers) => {
                    return bindHandler(
                        bindTemplate,
                        model,
                        handlers,
                        renderers
                    );
                };
                litTemplate.parts.push({
                    type: 2, // text binding
                    index: nodeIndex,
                    update,
                });

                // either go to next sibling or stop processing
                if (!hasSibling) {
                    break;
                }
                // skip attribute bindings
                continue;
            } else if (element.tagName === 'TEMPLATE') {
                const type = element.getAttribute('type');
                const name = element.getAttribute('name');
                const call = element.getAttribute('call');

                if (call !== null || type !== null || name !== null) {
                    element.parentNode!.insertBefore(document.createComment(''), element);
                    elementsToRemove.push(element);
                    let update: PartUpdater;

                    if (call !== null) {
                        // This is a sub-template call, like <template call="foo">
                        const templateName = call.trim();
                        const templateNameIsExpression =
                            templateName.startsWith('{{') && templateName.endsWith('}}');

                        update = (
                            model: object,
                            handlers: TemplateHandlers,
                            renderers: Renderers,
                        ) => {
                            const dataAttr = element.getAttribute('data');
                            const data =
                                dataAttr === null ? undefined : getSingleValue(dataAttr, model);

                            const renderer = templateNameIsExpression
                                ? getSingleValue(templateName, model)
                                : renderers[call];
                            return renderer?.(data, handlers, renderers);
                        };
                    } else if (type !== null) {
                        // This is a control-flow call, like if/repeat
                        update = (
                            model: object,
                            handlers: TemplateHandlers,
                            renderers: Renderers,
                        ) => {
                            const handler = handlers[type];
                            return handler?.(
                                element as HTMLTemplateElement,
                                model,
                                handlers,
                                renderers,
                            );
                        };
                    } else {
                        // This is a named block
                        if (name === 'super') {
                            litTemplate.renderers['super'] = (
                                model: any,
                                handlers: TemplateHandlers,
                                renderers: Renderers,
                            ) => {
                                // Instead of rendering this block, delegate to a passed in
                                // 'super' renderer which will actually render the late-bound
                                // super template. We pass that renderer the child blocks from
                                // this block for block overrides.
                                const superRenderer = renderers['super'];
                                const superCallTemplate = getLitTemplate(
                                    element as HTMLTemplateElement,
                                );
                                renderers = {
                                    ...renderers,
                                    ...superCallTemplate.renderers,
                                };
                                return superRenderer(model, handlers, renderers);
                            };
                        } else {
                            // The renderer renders the contents of the named block
                            litTemplate.renderers[name!] = (
                                model: any,
                                handlers: TemplateHandlers,
                                renderers: Renderers,
                            ) => {
                                return evaluateTemplate(
                                    element as HTMLTemplateElement,
                                    model,
                                    handlers,
                                    renderers,
                                );
                            };
                        }
                        // The updater runs when the template is evaluated and functions as
                        // a template _call_. It looks for a named renderer, which might be
                        // the renderer function above if the block is not overridden.
                        update = (
                            model: object,
                            handlers: TemplateHandlers,
                            renderers: Renderers,
                        ) => {
                            const renderer = renderers[name!];
                            return renderer?.(model, handlers, renderers);
                        };
                    }
                    litTemplate.parts.push({
                        type: 2, // text binding
                        index: nodeIndex,
                        update,
                    });
                    // Template with call, type, or name attributes are removed from the
                    // DOM, so they can't have attribute bindings.
                    continue;
                }
            }
            for (const attributeName of attributeNames) {
                let update: PartUpdater;
                let strings: Array<string>;

                let name = attributeName;
                const attributeValue = element.getAttribute(attributeName);
                if (!attributeValue) {
                    continue;
                }
                if (attributeValue.startsWith("?")) {
                    strings = ['', '']
                    update = createAttributeBinder(attributeName, attributeValue)
                } else {
                    // TODO: use alternative to negative lookbehind
                    // (but it's so convenient!)
                    const splitValue = attributeValue.split(bindingRegex);
                    if (splitValue.length === 1) {
                        if (hasEscapedBindingMarkers(attributeValue)) {
                            element.setAttribute(
                                attributeName,
                                unescapeBindingMarkers(attributeValue),
                            );
                        }
                        continue;
                    }

                    strings = [unescapeBindingMarkers(splitValue[0])];
                    const exprs: Array<Expression> = [];
                    for (let i = 1; i < splitValue.length; i += 2) {
                        const exprText = splitValue[i];
                        exprs.push(parse(exprText, astFactory) as Expression);
                        strings.push(unescapeBindingMarkers(splitValue[i + 1]));
                    }

                    update = (
                        model: any,
                        _handlers: TemplateHandlers,
                        _renderers: Renderers
                    ) => {
                        return exprs.map((expr) => expr.evaluate(model));
                    }
                }

                element.removeAttribute(attributeName);

                let ctor = AttributePart;
                const prefix = attributeName[0];
                if (prefix === '.') {
                    name = toCamelCase(attributeName.substring(1));
                    ctor = PropertyPart;
                } else if (prefix === '?') {
                    name = attributeName.substring(1);
                    ctor = BooleanAttributePart;
                } else if (prefix === '@') {
                    name = toCamelCase(attributeName.substring(1));
                    ctor = EventPart;
                }

                litTemplate.parts.push({
                    type: 1, // attribute binding
                    index: nodeIndex,
                    name,
                    strings,
                    ctor,
                    update,
                });
            }
        } else if (node.nodeType === Node.TEXT_NODE) {
            let textNode = node as Text;
            const text = textNode.textContent!;
            const strings = text.split(bindingRegex);
            if (strings.length > 1) {
                textNode.textContent = unescapeBindingMarkers(strings[0]);
            } else if (hasEscapedBindingMarkers(text)) {
                textNode.textContent = unescapeBindingMarkers(text);
            }
            for (let i = 1; i < strings.length; i += 2) {
                const exprText = strings[i];
                const expr = parse(exprText, astFactory) as Expression;
                litTemplate.parts.push({
                    type: 2,
                    index: ++nodeIndex,
                    update: (model: unknown, _handlers: TemplateHandlers) =>
                        expr.evaluate(model as Scope),
                });
                const newTextNode = new Text(strings[i + 1].replace('\\{{', '{{'));
                textNode.parentNode!.insertBefore(newTextNode, textNode.nextSibling);
                textNode.parentNode!.insertBefore(
                    document.createComment(''),
                    textNode.nextSibling,
                );
                textNode = newTextNode;
                // This TreeWalker isn't configured to walk comment nodes, but this
                // node will be returned next time through the loop. This is the easiest
                // way to get the walker to proceed to the next successor after the
                // marker, even when the marker doesn't have a nextSibling
                walker.currentNode = newTextNode;
            }
        }
    }
    for (const e of elementsToRemove) {
        e.remove();
    }
    return litTemplate;
};