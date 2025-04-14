import { css, html, LitElement, PropertyValues } from 'lit';
import { customElement, property } from 'lit/decorators.js';

/**
 * Renders pagination control.
 */
@customElement('ld-paginator')
export class LdPaginatorElement extends LitElement {
  @property({ type: Number })
  count?: number;

  @property({ type: Number, attribute: "page-size" })
  pageSize: number = 20;

  @property({ type: Number })
  page: number = 0;

  pageCount: number = 0;

  protected willUpdate(_changedProperties: PropertyValues): void {
    this.pageCount = Math.ceil((this.count || 0) / Math.max(this.pageSize, 1));
    if (this.page > this.pageCount - 1) {
      this.page = 0;
      this.dispatchEvent(new Event('page-change', { composed: true, bubbles: true }));
    }
  }

  renderLink(page: number) {
    if (this.page == page) {
      return html`<span>${page + 1}</span>`;
    }
    return html`<a href="javascript:void(0)" @click=${() => {
      this.page = page;

      this.dispatchEvent(new Event('page-change', { composed: true, bubbles: true }));
    }}>${page + 1}</a>`
  }

  render() {
    const pages = [...Array(this.pageCount).keys()];
    return html`<div class="pages">
      ${pages.map(p => this.renderLink(p))}
    </div>`
  }

  static styles = css`
    .pages {
      display: flex;
      gap: 15px;
    }
  `
}

declare global {
  interface HTMLElementTagNameMap {
    'ld-paginator': LdPaginatorElement
  }
}
