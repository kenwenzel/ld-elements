import { LitElement, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { until } from 'lit/directives/until.js';
import { prepareTemplate } from '../../rdfa/lit-rdfa';
import { RDFaToSparqlParser } from '../../rdfa/rdfa-sparql';

/**
 * Renders HTML templates with RDFa markup.
 */
@customElement('ld-rdfa')
export class LdRdfaElement extends LitElement {
  @property()
  template?: string;

  @property()
  endpoint?: string;

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
    if (!this.template || !this.endpoint) {
      return nothing;
    }
    const templateElement = document.querySelector(this.template);
    if (!templateElement) {
      return nothing;
    }

    const p = new RDFaToSparqlParser((templateElement as HTMLTemplateElement).content.querySelector('*:not(style)')!, 'http://example.org/')
    const query = p.getQuery();

    const litTemplate = prepareTemplate(templateElement as HTMLTemplateElement);

    const result = this.runSparqlQuery(this.endpoint, query).then(bindings => {
      const model = { bindings: bindings };
      return litTemplate(model);
    })

    return until(result);
  }

  static styles = css``
}

declare global {
  interface HTMLElementTagNameMap {
    'ld-rdfa': LdRdfaElement
  }
}
