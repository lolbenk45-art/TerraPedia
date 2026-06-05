import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const candidates = [
  process.env.CHROMIUM_BIN,
  '/snap/bin/chromium',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
].filter(Boolean)
const chromium = candidates.find(path => existsSync(path))

if (!chromium) {
  throw new Error('Chromium is required for user article editor runtime checks.')
}

const tempRoot = join(root, 'tmp')
mkdirSync(tempRoot, { recursive: true })
const tempDir = mkdtempSync(join(tempRoot, 'user-editor-'))
const htmlPath = join(tempDir, 'editor-runtime.html')
const editorDomSource = readFileSync(join(root, 'lib/userArticleEditorDom.mjs'), 'utf8')
  .replace(/\bexport\s+/g, '')

writeFileSync(htmlPath, `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>User Article Editor Runtime Check</title>
  </head>
  <body>
    <div id="editor" contenteditable="true"><p><br></p></div>
    <pre id="result">pending</pre>
    <script>
      ${editorDomSource}
      const assert = (condition, message) => {
        if (!condition) throw new Error(message);
      };

      const editor = document.querySelector('#editor');
      const setCaretAtEnd = (element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        range.collapse(false);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        return range;
      };

      const setBlock = (tagName) => {
        const current = editor.querySelector('p,h2,h3,blockquote,li') || editor;
        const replacement = document.createElement(tagName);
        replacement.innerHTML = current.innerHTML || '<br>';
        current.replaceWith(replacement);
        setCaretAtEnd(replacement);
      };

      const collectSelectedBlocks = () => {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return [];
        const range = selection.getRangeAt(0);
        if (!editor.contains(range.commonAncestorContainer)) return [];

        const blocks = new Set();
        const startElement = (range.startContainer.nodeType === Node.ELEMENT_NODE
          ? range.startContainer
          : range.startContainer.parentElement)?.closest('p,h2,h3,h4,blockquote,li');
        if (startElement) blocks.add(startElement);
        for (const candidate of Array.from(editor.querySelectorAll('p,h2,h3,h4,blockquote,li'))) {
          if (range.intersectsNode(candidate)) blocks.add(candidate);
        }
        return Array.from(blocks);
      };

      const insertListLikeComponent = (type) => {
        const blocks = collectSelectedBlocks();
        const activeRange = window.getSelection().getRangeAt(0);
        const activeElement = (activeRange.startContainer.nodeType === Node.ELEMENT_NODE
          ? activeRange.startContainer
          : activeRange.startContainer.parentElement);
        const activeList = activeElement?.closest('ol,ul');
        if (activeList && editor.contains(activeList)) {
          if (activeList.tagName.toLowerCase() !== type) {
            const replacement = document.createElement(type);
            replacement.innerHTML = activeList.innerHTML;
            activeList.replaceWith(replacement);
            const firstItem = replacement.querySelector('li');
            if (firstItem) setCaretAtEnd(firstItem);
            return;
          }

          const paragraphs = [];
          for (const item of Array.from(activeList.querySelectorAll(':scope > li'))) {
            const paragraph = document.createElement('p');
            paragraph.innerHTML = item.innerHTML || '<br>';
            paragraphs.push(paragraph);
          }
          activeList.replaceWith(...paragraphs);
          if (paragraphs[0]) setCaretAtEnd(paragraphs[0]);
          return;
        }

        const list = document.createElement(type);
        const sourceBlocks = blocks.length ? blocks : [];
        if (!sourceBlocks.length) {
          const listHtml = type === 'ol'
            ? setUserArticleOrderedList(editor.innerHTML)
            : setUserArticleUnorderedList(editor.innerHTML);
          list.innerHTML = listHtml.replace(/^<(ol|ul)>|<\\/(ol|ul)>$/g, '');
          editor.innerHTML = '';
          editor.appendChild(list);
        } else {
          const currentBlocks = sourceBlocks
            .map(block => block.closest('p,h2,h3,h4,blockquote,li'))
            .filter(block => Boolean(block && editor.contains(block)));

          for (const current of currentBlocks) {
            const item = document.createElement('li');
            item.innerHTML = current.innerHTML || '<br>';
            list.appendChild(item);
          }

          const anchor = currentBlocks[0] || null;
          if (anchor) {
            anchor.replaceWith(list);
            for (const current of currentBlocks.slice(1)) current.remove();
          } else {
            editor.appendChild(list);
          }
        }

        const firstItem = list.querySelector('li');
        if (firstItem) setCaretAtEnd(firstItem);
      };

      const appendPlainParagraph = (container, text) => {
        const paragraph = document.createElement('p');
        paragraph.textContent = String(text || '').trim();
        if (!paragraph.textContent) paragraph.innerHTML = '<br>';
        container.appendChild(paragraph);
        return paragraph;
      };

      const clearFormattingLikeComponent = () => {
        const cleaned = document.createElement('div');
        for (const node of Array.from(editor.childNodes)) {
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent?.trim() || '';
            if (text) appendPlainParagraph(cleaned, text);
            continue;
          }
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          const element = node;
          const tagName = element.tagName.toLowerCase();
          if (tagName === 'ol' || tagName === 'ul') {
            for (const item of Array.from(element.querySelectorAll(':scope > li'))) {
              appendPlainParagraph(cleaned, item.textContent || '');
            }
            continue;
          }
          if (tagName === 'figure' || tagName === 'img') {
            cleaned.appendChild(element.cloneNode(true));
            continue;
          }
          appendPlainParagraph(cleaned, element.textContent || '');
        }

        editor.innerHTML = cleaned.innerHTML || '<p><br></p>';
        const firstParagraph = editor.querySelector('p');
        if (firstParagraph) setCaretAtEnd(firstParagraph);
      };

      const applyTypingStyle = (fontSizePx, color) => {
        const range = window.getSelection().getRangeAt(0);
        const span = document.createElement('span');
        span.setAttribute('style', buildUserArticleInlineStyle({
          fontSizePx,
          textColor: sanitizeUserArticleEditorColor(color)
        }));
        const placeholder = document.createTextNode(USER_ARTICLE_EDITOR_PLACEHOLDER);
        span.appendChild(placeholder);
        range.insertNode(span);
        const next = document.createRange();
        next.setStart(placeholder, placeholder.data.length);
        next.collapse(true);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(next);
      };

      try {
        setCaretAtEnd(editor.querySelector('p'));
        applyTypingStyle(24, '#12ABEF');
        document.execCommand('insertText', false, '正文');
        const typedHtml = unwrapUserArticleTypingPlaceholders(editor.innerHTML).toLowerCase();
        assert(typedHtml.includes('font-size:24px'), '24px typing style was not preserved');
        assert(typedHtml.includes('color:#12abef'), 'custom typing color was not preserved');
        assert(typedHtml.includes('>正文</span>'), 'continued typing did not stay inside styled span');

        editor.innerHTML = '<p>标题</p>';
        setCaretAtEnd(editor.querySelector('p'));
        setBlock('h2');
        assert(editor.innerHTML === '<h2>标题</h2>', 'H2 block did not replace current paragraph');

        setBlock('h3');
        assert(editor.innerHTML === '<h3>标题</h3>', 'H3 block did not replace current block');

        setBlock('blockquote');
        assert(editor.innerHTML === '<blockquote>标题</blockquote>', 'blockquote block did not replace current block');

        editor.innerHTML = '<p>第一条</p>';
        setCaretAtEnd(editor.querySelector('p'));
        insertListLikeComponent('ol');
        document.execCommand('insertText', false, '继续');
        assert(editor.innerHTML === '<ol><li>第一条继续</li></ol>', 'ordered list button path did not keep typing inside ol/li');
        insertListLikeComponent('ol');
        assert(editor.innerHTML === '<p>第一条继续</p>', 'ordered list should toggle back to a paragraph on second click');

        editor.innerHTML = '<p>项目</p>';
        setCaretAtEnd(editor.querySelector('p'));
        insertListLikeComponent('ul');
        document.execCommand('insertText', false, '继续');
        assert(editor.innerHTML === '<ul><li>项目继续</li></ul>', 'unordered list button path did not keep typing inside ul/li');
        insertListLikeComponent('ol');
        assert(editor.innerHTML === '<ol><li>项目继续</li></ol>', 'switching unordered to ordered list should not create nested lists');
        insertListLikeComponent('ol');
        assert(editor.innerHTML === '<p>项目继续</p>', 'ordered list converted from unordered should toggle back to a paragraph');

        editor.innerHTML = '<ol><li><span style="font-size:24px;color:#12abef">清除我</span></li></ol><blockquote style="text-indent:2em">引用</blockquote><h2 style="color:#ffd765">标题</h2>';
        setCaretAtEnd(editor.querySelector('li'));
        clearFormattingLikeComponent();
        assert(editor.innerHTML === '<p>清除我</p><p>引用</p><p>标题</p>', 'clear formatting should flatten lists, headings, quotes, and inline styles');

        const selectedLinkHtml = buildUserArticleLinkHtml({
          href: 'example.com/wiki',
          title: '泰拉百科链接'
        });
        assert(selectedLinkHtml.includes('href="https://example.com/wiki"'), 'bare domains should be normalized to https links');
        assert(selectedLinkHtml.includes('>泰拉百科链接</a>'), 'link should display the provided title text');
        assert(!selectedLinkHtml.includes('>https://example.com/wiki</a>'), 'link body should not fall back to the raw URL when a title is provided');

        const collapsedLinkHtml = buildUserArticleLinkHtml({
          href: 'https://terraria.wiki.gg/wiki/Guide:Crafting_101',
          title: '合成指南'
        });
        assert(collapsedLinkHtml.includes('title="合成指南"'), 'collapsed link insertion should keep title metadata');
        assert(collapsedLinkHtml.includes('>合成指南</a>'), 'collapsed link insertion should display the title');

        const rawUrlLinkHtml = buildUserArticleLinkHtml({
          href: 'https://terraria.wiki.gg/wiki/Guide:Crafting_101',
          title: ''
        });
        assert(rawUrlLinkHtml.includes('href="https://terraria.wiki.gg/wiki/Guide:Crafting_101"'), 'empty link title should still create a link');
        assert(rawUrlLinkHtml.includes('>https://terraria.wiki.gg/wiki/Guide:Crafting_101</a>'), 'empty link title should display the raw URL');

        const unsafeLinkHtml = buildUserArticleLinkHtml({
          href: 'javascript:alert(1)',
          title: '坏链接'
        });
        assert(unsafeLinkHtml === '', 'unsafe javascript links should not be inserted');

        const pastedLinkHtml = sanitizeUserArticlePastedHtml('<a href="https://member.bilibili.com/platform/upload/video/frame" title="创作中心">创作中心 - 哔哩哔哩弹幕视频网站</a>');
        assert(pastedLinkHtml.includes('href="https://member.bilibili.com/platform/upload/video/frame"'), 'pasted HTML links should keep their href');
        assert(pastedLinkHtml.includes('>https://member.bilibili.com/platform/upload/video/frame</a>'), 'pasted HTML links should display the URL text by default');
        assert(!pastedLinkHtml.includes('>创作中心 - 哔哩哔哩弹幕视频网站</a>'), 'pasted HTML links should not replace the URL with the source page title');

        const uriListLinkHtml = buildUserArticleLinkHtml({
          href: 'https://member.bilibili.com/platform/upload/video/frame',
          title: '创作中心 - 哔哩哔哩弹幕视频网站'
        });
        assert(uriListLinkHtml.includes('href="https://member.bilibili.com/platform/upload/video/frame"'), 'URI-list clipboard links should be insertable as anchors');
        assert(uriListLinkHtml.includes('>创作中心 - 哔哩哔哩弹幕视频网站</a>'), 'URI-list clipboard links should use the available title text');

        document.querySelector('#result').textContent = 'PASS';
      } catch (error) {
        document.querySelector('#result').textContent = 'FAIL: ' + (error && error.message ? error.message : error);
      }
    </script>
  </body>
</html>
`, 'utf8')

const output = execFileSync(chromium, [
  '--headless',
  '--disable-gpu',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--allow-file-access-from-files',
  '--virtual-time-budget=5000',
  '--dump-dom',
  pathToFileURL(htmlPath).href,
], {
  encoding: 'utf8',
  maxBuffer: 1024 * 1024,
})

if (!output.includes('<pre id="result">PASS</pre>')) {
  writeFileSync(join(tempDir, 'dump.html'), output, 'utf8')
  throw new Error(`User article editor runtime check failed. Dump: ${join(tempDir, 'dump.html')}`)
}

rmSync(tempDir, { recursive: true, force: true })
console.log('user article editor runtime checks passed')
