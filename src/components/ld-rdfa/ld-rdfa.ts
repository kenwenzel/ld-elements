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

  @property()
  paginate?: string;

  @property({ type: Number, attribute: "page-size" })
  pageSize: number = 20;

  styleTemplate?: TemplateResult;

  litTemplate?: TemplateFunction;

  parser?: RDFaToSparqlParser;
  baseQuery?: string;

  offset = 0;
  count?: number;

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

  constructor() {
    super();
    this.addEventListener('page-change', (e) => {
      const paginator = this.shadowRoot?.querySelector('ld-paginator');
      if (paginator) {
        this.offset = paginator.page * this.pageSize;
        this.requestUpdate();
      }
    });
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
      this.parser = new RDFaToSparqlParser((templateElement as HTMLTemplateElement).content.querySelector('*:not(style)')!, window.location.href);

      const newTemplate = document.createElement('template') as HTMLTemplateElement;
      newTemplate.content.appendChild(this.parser.getElement()!);

      const paginator = newTemplate.content.querySelector('ld-paginator');
      if (paginator) {
        paginator.setAttribute("count", "{{ paginator.count }}");
        paginator.setAttribute("page-size", "{{ paginator.pageSize }}");
      }

      this.litTemplate = prepareTemplate(newTemplate);
    }
  }

  render() {
    if (!this.litTemplate || !this.endpoint || !this.parser) {
      return nothing;
    }

    let scope = getScope(this) || {};

    let result: Promise<any> = Promise.resolve(true);
    if (this.paginate) {
      // check if query patterns have been changed
      const newBaseQuery = replaceExpressions(this.parser.getQuery(), scope);
      if (newBaseQuery != this.baseQuery) {
        // if query has been changed then the count needs to be recomputed
        this.baseQuery = newBaseQuery;
        this.count = undefined;
      }

      const paginatedVar = this.paginate.replace(/[?$]/g, "");
      if (this.count === undefined) {
        const countQuery = this.parser.getCountQuery(paginatedVar);
        const parameterizedCountQuery = replaceExpressions(countQuery, scope);
        result = result.then(() => this.runSparqlQuery(this.endpoint!, parameterizedCountQuery).then(bindings => {
          this.count = bindings[0]?.count?.value || 0;
        }));
      }
      result = result.then(async () => {
        const paginatedQuery = this.parser!.getPaginatedQuery(paginatedVar, this.offset, this.pageSize);
        const parameterizedPaginatedQuery = replaceExpressions(paginatedQuery, scope);
        const bindings = await this.runSparqlQuery(this.endpoint!, parameterizedPaginatedQuery);

        const model = Object.create(scope);
        model.params = new URLSearchParams(window.location.search);
        model.bindings = bindings;
        model.paginator = { count: this.count, pageSize: this.pageSize };
        return this.litTemplate!(model);
      });
    } else {
      const query = this.parser.getQuery();
      let q = replaceExpressions(query, scope);
      result = this.runSparqlQuery(this.endpoint, q).then(bindings => {
        const model = Object.create(scope);
        model.params = new URLSearchParams(window.location.search);
        model.bindings = bindings;
        return this.litTemplate!(model);
      });
    }

    return html`${this.styleTemplate}${until(result)}`;
  }

  static styles = css``
}

declare global {
  interface HTMLElementTagNameMap {
    'ld-rdfa': LdRdfaElement
  }
}
