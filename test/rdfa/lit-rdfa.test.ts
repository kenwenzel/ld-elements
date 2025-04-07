import { html, render as renderLit } from 'lit-html';
import { assert, beforeEach, describe, it } from 'vitest';
import { prepareTemplate, rdfa, toHtml } from '../../src/rdfa/lit-rdfa';
import { RDFaToSparqlParser } from '../../src/rdfa/rdfa-sparql';

describe('lit-rdfa', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
  });

  it('Basic', () => {
    const template = rdfa`<div prefix="dc: http://purl.org/dc/elements/1.1/ foaf: http://xmlns.com/foaf/0.1/">
        ${html`Test`} {{ 2 + 3 }} ${html`<b>bold</b>`}
        <p>This photo was taken by 
          <span class="one ${"two"} three ${"four"} five" about="photo1.jpg" rel="dc:creator" resource="?creator">
            <span about="?creator">The creator is {{ creator }} with name <strong property="foaf:name" content="?name">{{ name }}</strong></span>
          </span>.
        </p>
    </div>`
    const values: Array<any> = []
    const templateHtml = toHtml(template, values)
    const el = document.createElement("template")
    el.innerHTML = templateHtml[0] as unknown as string

    // test if RDF is correctly exctracted
    let p = new RDFaToSparqlParser(el.content.firstChild as Element, 'http://example.org/')
    let quads = p.resultQuads

    let expected = [
      '<http://example.org/photo1.jpg> <http://purl.org/dc/elements/1.1/creator> ?creator',
      '?creator <http://xmlns.com/foaf/0.1/name> ?name'
    ];
    assert.sameMembers(quads.map((q) => q.toString()), expected);

    // test remplate creation
    const litTemplate = prepareTemplate(el);
    let model = {
      values: values,
      bindings: [{ "creator": { value: "http://example.org/creator_1" }, "name": { value: "Creator 1" } }]
    }
    renderLit(litTemplate(model), container);

    // test if expected nodes exist
    assert.sameMembers(
      Array.from(container.querySelectorAll('[property="foaf:name"]')).map(e => e.textContent),
      ["Creator 1"]
    );

    p = new RDFaToSparqlParser(container, 'http://example.org/')
    quads = p.resultQuads

    expected = [
      '<http://example.org/photo1.jpg> <http://purl.org/dc/elements/1.1/creator> <http://example.org/creator_1>',
      '<http://example.org/creator_1> <http://xmlns.com/foaf/0.1/name> "Creator 1"^^<http://www.w3.org/2001/XMLSchema#string>'
    ];
    assert.sameMembers(quads.map((q) => q.toString()), expected);

    model.bindings = [...model.bindings, { "creator": { value: "http://example.org/creator_2" }, "name": { value: "Creator 2" } }];

    renderLit(litTemplate(model), container);

    // test if expected nodes exist
    assert.sameMembers(
      Array.from(container.querySelectorAll('[property="foaf:name"]')).map(e => e.textContent),
      ["Creator 1", "Creator 2"]
    );

    p = new RDFaToSparqlParser(container, 'http://example.org/')
    quads = p.resultQuads

    expected = [
      '<http://example.org/photo1.jpg> <http://purl.org/dc/elements/1.1/creator> <http://example.org/creator_1>',
      '<http://example.org/creator_1> <http://xmlns.com/foaf/0.1/name> "Creator 1"^^<http://www.w3.org/2001/XMLSchema#string>',
      '<http://example.org/photo1.jpg> <http://purl.org/dc/elements/1.1/creator> <http://example.org/creator_2>',
      '<http://example.org/creator_2> <http://xmlns.com/foaf/0.1/name> "Creator 2"^^<http://www.w3.org/2001/XMLSchema#string>'
    ];
    assert.sameMembers(quads.map((q) => q.toString()), expected);
  });

});