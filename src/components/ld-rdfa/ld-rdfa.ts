import { getScope } from '@heximal/components';
import { HeximalElement } from '@heximal/element';
import { css, html, nothing, TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { until } from 'lit/directives/until.js';
import { prepareTemplate, replaceExpressions } from '../../rdfa/lit-rdfa';
import { RDFaToSparqlParser } from '../../rdfa/rdfa-sparql';
import { TemplateFunction } from '@heximal/templates';

/**
 * Renders HTML templates with RDFa markup.
 */
@customElement('ld-rdfa')
export class LdRdfaElement extends HeximalElement {
  @property()
  template?: string;

  @property()
  endpoint?: string;

  styleTemplate?: TemplateResult;

  litTemplate?: TemplateFunction;

  query?: string;

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

  connectedCallback(): void {
    super.connectedCallback();
    let templateElement: HTMLTemplateElement | undefined = undefined;
    if (this.template) {
      templateElement = document.querySelector(this.template) as HTMLTemplateElement | undefined;
    } else {
      const styleElement = this.querySelector('style');
      if (styleElement) {
        this.styleTemplate = html`<style>${styleElement.innerText}</style>`;
      }
      templateElement = this.querySelector('template') as HTMLTemplateElement | undefined;
    }
    if (templateElement) {
      const p = new RDFaToSparqlParser((templateElement as HTMLTemplateElement).content.querySelector('*:not(style)')!, window.location.href);

      const newTemplate = document.createElement('template') as HTMLTemplateElement;
      newTemplate.content.appendChild(p.getElement()!);

      this.litTemplate = prepareTemplate(newTemplate);

      this.query = p.getQuery();
    }
  }

  render() {
    if (!this.litTemplate || !this.endpoint || !this.query) {
      return nothing;
    }

    let scope = getScope(this) || {};
    let q = replaceExpressions(this.query!, scope);

    const result = this.runSparqlQuery(this.endpoint, q).then(bindings => {
      const model = Object.create(scope);
      model.params = new URLSearchParams(window.location.search);
      model.bindings = bindings;
      return this.litTemplate!(model);
    })

    return html`${this.styleTemplate}${until(result)}`;
  }

  static styles = css``
}

declare global {
  interface HTMLElementTagNameMap {
    'ld-rdfa': LdRdfaElement
  }
}
