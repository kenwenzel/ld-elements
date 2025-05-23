import { assert, beforeEach, describe, it } from 'vitest';
import { factory as f } from '../../src/rdfa/rdf';
import { RDFaParser } from '../../src/rdfa/rdfa';

describe('rdfa', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
  });

  it('Simple property', () => {
    const div = document.createElement('div');
    div.innerHTML = `<div prefix="dc: http://purl.org/dc/elements/1.1/">
       <p>This photo was taken by <span class="author" about="photo1.jpg" property="dc:creator">Max Mustermann</span>.</p>
    </div>`;

    const p = new RDFaParser();
    const quads = p.getStatements(div, 'http://example.org/');

    assert.isTrue(
      [
        f.quad(
          f.namedNode('http://example.org/photo1.jpg'),
          f.namedNode('http://purl.org/dc/elements/1.1/creator'),
          f.literal('Max Mustermann')
        ),
      ].every((q1) => quads.findIndex((q2) => q1.equals(q2)) >= 0)
    );
  });

  it('Complex markup', () => {
    const div = document.createElement('div');
    div.innerHTML = `<div prefix="
    rdf: http://www.w3.org/1999/02/22-rdf-syntax-ns#
    rdfs: http://www.w3.org/2000/01/rdf-schema#
    vocab: http://example.org/vocab/
    obj: http://example.org/objects/">
      <p about="http://example.org/someThing" rel="vocab:rel1">
        <i rel="rdf:type" resource="vocab:someThing-type"></i>

        <span about="obj:o1" typeof="vocab:o1-type" rel="vocab:rel2">
          <span resource="obj:o3"></span>
          <span><span resource="obj:o4"></span></span>
          <span property="vocab:index" datatype="vocab:number">2</span>
        </span>
        <span about="obj:o2"></span>

        <span property="rdfs:label" content="some label"></span>
      </p>
    </div>`;

    const p = new RDFaParser();
    const quads = p.getStatements(div, 'http://example.org/');

    const expected = [
      '<http://example.org/someThing> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://example.org/vocab/someThing-type>',
      '<http://example.org/objects/o1> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://example.org/vocab/o1-type>',
      '<http://example.org/someThing> <http://example.org/vocab/rel1> <http://example.org/objects/o1>',
      '<http://example.org/objects/o1> <http://example.org/vocab/rel2> <http://example.org/objects/o3>',
      '<http://example.org/objects/o1> <http://example.org/vocab/rel2> <http://example.org/objects/o4>',
      '<http://example.org/objects/o1> <http://example.org/vocab/index> "2"^^<http://example.org/vocab/number>',
      '<http://example.org/someThing> <http://example.org/vocab/rel1> <http://example.org/objects/o2>',
      '<http://example.org/someThing> <http://www.w3.org/2000/01/rdf-schema#label> "some label"^^<http://www.w3.org/2001/XMLSchema#string>',
    ];

    assert.sameMembers(
      quads.map((q) => q.toString()),
      expected
    );
  });
});
