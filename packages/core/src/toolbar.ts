import { icons } from "./icons";
import {
  HashmdAction,
  HashmdEditorContext,
  HashmdLocale,
  ViewerProps,
} from "./types";
import { getProcessor } from "./utils";
import { computePosition, flip, shift } from "@floating-ui/dom";
import { LitElement, html, css, nothing, PropertyValueMap } from "lit";
import { customElement, property } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";

interface RightAction extends HashmdAction {
  active?: boolean;
  hidden?: boolean;
}

@customElement("hashmd-toolbar")
export class Toolbar extends LitElement {
  @property() actions!: HashmdAction[];
  @property() rightAfferentActions!: HashmdAction[];
  @property() sidebar!: false | "help" | "toc";
  @property() locale!: HashmdLocale;
  @property() context!: HashmdEditorContext;
  @property() fullscreen!: boolean;

  @property() activeTab: "icon" | "write" | "preview" = "icon"; // TODO:

  get rightActions() {
    const {
      activeTab,
      fullscreen,
      sidebar,
      locale,
      actions,
      rightAfferentActions,
    } = this;

    const split = activeTab === "icon";
    const tocActive = sidebar === "toc";
    const helpActive = sidebar === "help";
    const writeActive = activeTab === "write";
    const previewActive = activeTab === "preview";
    const rightActions: RightAction[] = [
      {
        title: tocActive ? locale.closeToc : locale.toc,
        icon: icons.toc,
        handler: {
          type: "action",
          click: () => {
            this.dispatchEvent(
              new CustomEvent("toggle-sidebar", { detail: "toc" }),
            );
          },
        },
        active: tocActive,
      },
      {
        title: helpActive ? locale.closeHelp : locale.help,
        icon: icons.help,
        handler: {
          type: "action",
          click: () => {
            this.dispatchEvent(
              new CustomEvent("toggle-sidebar", { detail: "help" }),
            );
          },
        },
        active: helpActive,
      },
      {
        title: writeActive ? locale.exitWriteOnly : locale.writeOnly,
        icon: icons.write,
        handler: {
          type: "action",
          click: () => {
            this.dispatchEvent(new CustomEvent("tab", { detail: "write" }));
          },
        },
        active: writeActive,
        hidden: !split,
      },
      {
        title: previewActive ? locale.exitPreviewOnly : locale.previewOnly,
        icon: icons.preview,
        handler: {
          type: "action",
          click: () => {
            this.dispatchEvent(new CustomEvent("tab", { detail: "preview" }));
          },
        },
        active: previewActive,
        hidden: !split,
      },
      {
        title: fullscreen ? locale.exitFullscreen : locale.fullscreen,
        icon: fullscreen ? icons.exitFullscreen : icons.fullscreen,
        handler: {
          type: "action",
          click: () => {
            this.dispatchEvent(new CustomEvent("toggle-fullscreen"));
          },
        },
      },
      {
        title: locale.source,
        icon: icons.source,
        handler: {
          type: "action",
          click: () => {
            window.open("https://github.com/pd4d10/hashmd");
          },
        },
      },
      ...rightAfferentActions,
    ];

    return rightActions;
  }

  render() {
    const {
      activeTab,
      fullscreen,
      sidebar,
      locale,
      actions,
      rightAfferentActions,

      rightActions,
    } = this;

    const split = activeTab === "icon";

    return html`<div class="toolbar">
      ${split
        ? actions.map((item, index) =>
            item.handler
              ? html`
                  <div
                    class="icon"
                    @click=${() => {
                      if (item.handler?.type === "action") {
                        item.handler.click(this.context);
                      }
                    }}
                    @mouseenter=${(e: MouseEvent) => {
                      if (item.handler?.type === "dropdown") {
                        const button = e.target as HTMLElement;
                        const dropdown =
                          button.querySelector<HTMLElement>(".dropdown")!;

                        computePosition(button, dropdown, {
                          placement: "bottom-start",
                          middleware: [flip(), shift()],
                        }).then(({ x, y }) => {
                          dropdown.style.left = `${x}px`;
                          dropdown.style.top = `${y}px`;
                        });
                      }
                    }}
                    @mouseleave=${(e: MouseEvent) => {
                      if (item.handler?.type === "dropdown") {
                        const button = e.target as HTMLElement;
                        const dropdown =
                          button.querySelector<HTMLElement>(".dropdown")!;

                        dropdown.style.left = "";
                        dropdown.style.top = "";
                      }
                    }}
                  >
                    ${unsafeHTML(item.icon)}
                    ${item.handler.type === "dropdown"
                      ? html`
                          <div class="dropdown">
                            <div class="dropdown-title">${item.title}</div>
                            ${item.handler.actions.map(
                              (subAction, i) => html`
                                <div
                                  class="dropdown-item"
                                  @click=${() => {
                                    if (subAction.handler?.type === "action") {
                                      subAction.handler?.click?.(this.context);
                                    }
                                  }}
                                  @mouseenter=${() => {
                                    if (subAction.handler?.type === "action") {
                                      subAction.handler?.mouseenter?.(
                                        this.context,
                                      );
                                    }
                                  }}
                                  @mouseleave=${() => {
                                    if (subAction.handler?.type === "action") {
                                      subAction.handler.mouseleave?.(
                                        this.context,
                                      );
                                    }
                                  }}
                                >
                                  ${subAction.title}
                                </div>
                              `,
                            )}
                          </div>
                        `
                      : nothing}
                  </div>
                `
              : nothing,
          )
        : html`<div
              @click=${() => {
                this.dispatchEvent(new CustomEvent("tab", { detail: "write" }));
              }}
              @keydown=${() => {
                //
              }}
              class=${classMap({
                tab: true,
                active: activeTab !== "preview",
              })}
            >
              ${locale.write}
            </div>
            <div
              @click=${() => {
                this.dispatchEvent(
                  new CustomEvent("tab", { detail: "preview" }),
                );
              }}
              @keydown=${() => {
                //
              }}
              class=${classMap({
                tab: true,
                "tab-active": activeTab === "preview",
              })}
            >
              ${locale.preview}
            </div>`}
      <div class="gap"></div>
      ${rightActions.map((item, index) =>
        item.hidden
          ? nothing
          : html`
              <div
                class=${classMap({
                  icon: true,
                  active: item.active ?? false,
                })}
                @click=${() => {
                  if (item.handler?.type === "action") {
                    item.handler.click(this.context);
                  }
                }}
              >
                ${unsafeHTML(item.icon)}
              </div>
            `,
      )}
    </div> `;
  }

  static styles = css`
    * {
      box-sizing: border-box;
    }

    .toolbar {
      padding: 4px 12px;
      border-bottom: 1px solid var(--border-color);
      background-color: var(--gray-000);
      user-select: none;
      overflow: hidden;
      display: flex;
    }

    .tab {
      cursor: pointer;
      padding-left: 8px;
      padding-right: 8px;
      line-height: 24px;
      font-size: 14px;
    }

    .active {
      color: var(--primary);
    }

    .icon {
      border-radius: 4px;
      margin-left: 6px;
      margin-right: 6px;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .icon svg {
      cursor: pointer;
    }

    .icon:hover {
      background-color: var(--border-color);
    }

    .gap {
      flex-grow: 1;
    }

    .dropdown {
      max-height: 300px;
      overflow: auto;
      font-size: 14px;
      background-color: #fff;
      border-radius: 4px;
      border: 1px solid var(--border-color);
      position: absolute;
      top: -99999px;
      left: -99999px;
      z-index: 99999;
    }
    .dropdown-title {
      margin: 0 12px;
      font-weight: 500;
      border-bottom: 1px solid var(--border-color);
      line-height: 32px;
      color: var(--gray-700);
    }
    .dropdown-item {
      padding: 0 12px;
      line-height: 32px;
      cursor: pointer;
    }
    .dropdown-item:hover {
      background-color: var(--gray-100);
    }
  `;
}
