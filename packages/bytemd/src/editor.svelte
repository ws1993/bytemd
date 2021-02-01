<svelte:options immutable={true} />

<script lang="ts">
  import type { Root, Element } from 'hast';
  import type { BytemdPlugin, EditorProps, ViewerProps } from './types';
  import { onMount, createEventDispatcher, onDestroy, tick } from 'svelte';
  import { debounce, throttle } from 'lodash-es';

  import { markdown } from '@codemirror/lang-markdown';
  import Toolbar from './toolbar.svelte';
  import Viewer from './viewer.svelte';
  import { createUtils } from './editor';

  import { keymap, highlightSpecialChars, EditorView } from '@codemirror/view';
  import { Prec, EditorState } from '@codemirror/state';
  import { history, historyKeymap } from '@codemirror/history';
  import { foldKeymap } from '@codemirror/fold';
  import { indentOnInput } from '@codemirror/language';
  import { defaultKeymap } from '@codemirror/commands';
  import { bracketMatching } from '@codemirror/matchbrackets';
  import {
    closeBrackets,
    closeBracketsKeymap,
  } from '@codemirror/closebrackets';
  import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
  import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
  import { commentKeymap } from '@codemirror/comment';
  import { rectangularSelection } from '@codemirror/rectangular-selection';
  import { defaultHighlightStyle } from '@codemirror/highlight';
  import { lintKeymap } from '@codemirror/lint';

  export let value: EditorProps['value'] = '';
  export let plugins: EditorProps['plugins'];
  export let sanitize: EditorProps['sanitize'];
  export let mode: EditorProps['mode'] = 'split';
  export let previewDebounce: EditorProps['previewDebounce'] = 300;
  export let editorConfig: EditorProps['editorConfig'];

  let el: HTMLElement;
  let previewEl: HTMLElement;
  let viewerProps: ViewerProps = {
    value,
    plugins,
    sanitize,
  };
  let textarea: HTMLElement;
  let editor: EditorView;
  let activeTab = 0;
  let fullscreen = false;

  $: context = { editor, $el: el, utils: createUtils(editor) };

  let cbs: ReturnType<NonNullable<BytemdPlugin['editorEffect']>>[] = [];
  const dispatch = createEventDispatcher();

  // @ts-ignore
  function setActiveTab(e) {
    activeTab = e.detail.value;
    if (editor && activeTab === 0) {
      tick().then(() => {
        editor.focus();
      });
    }
  }

  // scroll sync
  let editorCalled = false;
  let viewerCalled = false;

  function findStartIndex(num: number, nums: number[]) {
    let startIndex = nums.length - 2;
    for (let i = 0; i < nums.length; i++) {
      if (num < nums[i]) {
        startIndex = i - 1;
        break;
      }
    }
    startIndex = Math.max(startIndex, 0); // ensure >= 0
    return startIndex;
  }

  function editorScrollHandler() {
    if (viewerCalled) {
      viewerCalled = false;
      return;
    }

    requestAnimationFrame(() => {
      updateBlockPositions();

      const info = editor.getScrollInfo();
      const leftRatio = info.top / (info.height - info.clientHeight);

      const startIndex = findStartIndex(leftRatio, leftPs);

      const rightRatio =
        ((leftRatio - leftPs[startIndex]) *
          (rightPs[startIndex + 1] - rightPs[startIndex])) /
          (leftPs[startIndex + 1] - leftPs[startIndex]) +
        rightPs[startIndex];
      // const rightRatio = rightPs[startIndex]; // for testing

      previewEl.scrollTo(
        0,
        rightRatio * (previewEl.scrollHeight - previewEl.clientHeight)
      );
      editorCalled = true;
    });
  }
  function previewScrollHandler() {
    if (editorCalled) {
      editorCalled = false;
      return;
    }

    requestAnimationFrame(() => {
      updateBlockPositions();

      const rightRatio =
        previewEl.scrollTop / (previewEl.scrollHeight - previewEl.clientHeight);

      const startIndex = findStartIndex(rightRatio, rightPs);

      const leftRatio =
        ((rightRatio - rightPs[startIndex]) *
          (leftPs[startIndex + 1] - leftPs[startIndex])) /
          (rightPs[startIndex + 1] - rightPs[startIndex]) +
        leftPs[startIndex];

      const info = editor.getScrollInfo();
      editor.scrollTo(0, leftRatio * (info.height - info.clientHeight));
      viewerCalled = true;
    });
  }

  function on() {
    cbs = (plugins ?? []).map((p) => p.editorEffect?.(context));
    // editor.on('scroll', editorScrollHandler);
    previewEl.addEventListener('scroll', previewScrollHandler, {
      passive: true,
    });
  }
  function off() {
    cbs.forEach((cb) => cb && cb());
    // editor.off('scroll', editorScrollHandler);
    previewEl.removeEventListener('scroll', previewScrollHandler);
  }

  const updateViewerValue = debounce(() => {
    viewerProps = {
      value,
      plugins,
      sanitize,
    };
  }, previewDebounce);

  $: if (editor && value !== editor.state.doc.toString()) {
    editor.dispatch({
      changes: { from: 0, insert: value },
    });
  }
  $: if (value != null) updateViewerValue();

  $: if (editor && el && plugins) {
    off();
    tick().then(() => {
      on();
    });
  }

  let hast: Root;
  let leftPs: number[];
  let rightPs: number[];

  function updateHast({ detail }: { detail: Root }) {
    hast = detail;
  }

  const updateBlockPositions = throttle(() => {
    leftPs = [];
    rightPs = [];

    const scrollInfo = editor.getScrollInfo();
    const body = previewEl.querySelector<HTMLElement>('.markdown-body')!;

    const leftNodes = hast.children.filter(
      (v) => v.type === 'element'
    ) as Element[];
    const rightNodes = [...body.childNodes].filter(
      (v) => v instanceof HTMLElement
    ) as HTMLElement[];

    for (let i = 0; i < leftNodes.length; i++) {
      const leftNode = leftNodes[i];
      const rightNode = rightNodes[i];

      // if there is no position info, move to the next node
      if (!leftNode.position) {
        continue;
      }

      const left =
        editor.heightAtLine(leftNode.position.start.line - 1, 'local') /
        (scrollInfo.height - scrollInfo.clientHeight);
      const right =
        (rightNode.offsetTop - body.offsetTop) /
        (previewEl.scrollHeight - previewEl.clientHeight);

      if (left >= 1 || right >= 1) {
        break;
      }

      leftPs.push(left);
      rightPs.push(right);
    }

    leftPs.push(1);
    rightPs.push(1);
    // console.log(leftPs, rightPs);
  }, 1000);

  onMount(async () => {
    editor = new EditorView({
      state: EditorState.create({
        extensions: [
          highlightSpecialChars(),
          history(),
          // drawSelection(),
          EditorState.allowMultipleSelections.of(true),
          indentOnInput(),
          Prec.fallback(defaultHighlightStyle),
          bracketMatching(),
          closeBrackets(),
          autocompletion(),
          rectangularSelection(),
          highlightSelectionMatches(),
          keymap.of([
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            ...foldKeymap,
            ...commentKeymap,
            ...completionKeymap,
            ...lintKeymap,
          ]),
          markdown(),
        ],
      }),
      parent: textarea,
    });

    // // https://github.com/codemirror/CodeMirror/issues/2428#issuecomment-39315423
    // editor.addKeyMap({
    //   'Shift-Tab': 'indentLess',
    // });
    // editor.setValue(value);
    // editor.on('change', (doc, change) => {
    //   dispatch('change', { value: editor.getValue() });
    // });

    // No need to call `on` because cm instance would change once after init
  });
  onDestroy(off);
</script>

<div
  class={`bytemd bytemd-mode-${mode}${fullscreen ? ' bytemd-fullscreen' : ''}`}
  bind:this={el}
>
  <Toolbar
    {context}
    {mode}
    {activeTab}
    {plugins}
    {fullscreen}
    on:tab={setActiveTab}
    on:fullscreen={() => {
      fullscreen = !fullscreen;
    }}
  />
  <div class="bytemd-body">
    <div
      class="bytemd-editor"
      style={mode === 'tab' && activeTab === 1 ? 'display:none' : undefined}
      bind:this={textarea}
    />
    <div
      bind:this={previewEl}
      class="bytemd-preview"
      style={mode === 'tab' && activeTab === 0 ? 'display:none' : undefined}
    >
      <Viewer {...viewerProps} on:hast={updateHast} />
    </div>
  </div>
</div>
