import { html, render as renderLit } from 'lit-html';
import { beforeEach, describe, it } from 'vitest';
import { prepareTemplate, rdfa, toHtml } from '../../src/rdfa/lit-rdfa';
import { RDFaToSparqlParser } from '../../src/rdfa/rdfa-sparql';

describe('lit-rdfa', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
  });

  it('Basic', () => {
    const template = rdfa`<div prefix="dc: http://purl.org/dc/elements/1.1/">
        ${html`Test`} {{ 2 + 3 }} ${html`<b>bold</b>`}
        <p>This photo was taken by <span class="one ${"two"} three ${"four"} five" bla="a {{ true }} b {{ false }}" about="photo1.jpg" property="dc:creator" content="?creator"></span>.</p>
    </div>`
    const values: Array<any> = []
    const templateHtml = toHtml(template, values)
    const el = document.createElement("template")
    el.innerHTML = templateHtml[0] as unknown as string

    const p = new RDFaToSparqlParser(el.content.firstElementChild || document.createElement("div"), 'http://example.org/')
    const quads = p.resultQuads

    console.log(el.content)
    // console.log("values", values)

    const litTemplate = prepareTemplate(el);
    let model = {
      values : values,
      bindings: [{ "creator": { value: "some creator" } }]
    }
    renderLit(litTemplate(model), container);
    console.log("result", container)

    model.bindings.push({ "creator": { value: "some other" } });

    renderLit(litTemplate(model), container);
    console.log("result", container)
  });
});