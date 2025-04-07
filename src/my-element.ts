import { LitElement, css, html } from 'lit'
import { customElement } from 'lit/decorators.js'
import { RDFaToSparqlParser } from './rdfa/rdfa-sparql';
import { prepareTemplate, rdfa, toHtml } from './rdfa/lit-rdfa';
import { until } from 'lit/directives/until.js';

/**
 * An example element.
 *
 */
@customElement('rdfa-element')
export class RdfaElement extends LitElement {
  async runSparqlQuery(sparqlEndpointUrl: string, sparqlQuery: string): Promise<any[]> {
    try {
      const response = await fetch(sparqlEndpointUrl, {
        method: 'POST', // Most SPARQL endpoints accept POST for queries
        headers: {
          'Accept': 'application/sparql-results+json', // Request JSON results
          'Content-Type': 'application/sparql-query'
        },
        body: sparqlQuery
      });

      if (!response.ok) {
        console.error(`HTTP error! status: ${response.status}`);
        return [];
      }

      const data = await response.json();
      return data.results.bindings || [];
    } catch (error) {
      console.error('Error running SPARQL query:', error);
      return [];
    }
  }

  render() {
    const template = html`<div about="?cat" prefix="
      wd: http://www.wikidata.org/entity/
      wdt: http://www.wikidata.org/prop/direct/
      rdfs: http://www.w3.org/2000/01/rdf-schema#">
        <span rel="wdt:P31" resource="wd:Q146"></span>

        <a href="?cat">
          <span about="?cat" property="rdfs:label" content="?l" data-filter="lang(?l) = 'en'">{{ l }}</span>
        </a>

        <div class="images">
          <img resource="?cat" rev="wdt:P18" src="?img">
        </div>
      </div>`;

    const values: Array<any> = []
    const templateHtml = toHtml(template, values)

    const el = document.createElement("template")
    el.innerHTML = templateHtml[0] as unknown as string

    const p = new RDFaToSparqlParser(el.content.firstChild as Element, 'http://example.org/')
    const query = p.getQuery();

    console.log(query)

    const litTemplate = prepareTemplate(el);

    const result = this.runSparqlQuery("https://query.wikidata.org/sparql", query).then(bindings => {
      const model: any = {
        values: values,
      }
      model.bindings = bindings;
      return litTemplate(model);
    })

    return until(result);
  }

  static styles = css`
  .images {
    display: flex;
    gap: 20px;
    align-items: center;
  }
  img {
    max-width: 400px;
  }
  `
}

declare global {
  interface HTMLElementTagNameMap {
    'rdfa-element': RdfaElement
  }
}
