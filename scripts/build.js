/**
 * 비밀 잡화점 정적 사이트 빌더
 *  - 구글 시트(웹 게시 CSV)를 읽어 posts/{slug}.html, category/{slug}.html, index.html 을 생성합니다.
 *  - 템플릿: templates/*.tpl.html  (플레이스홀더: {{TITLE}}, {{BODY}}, {{CARDS}} 등)
 *  - 오프라인이면 마지막으로 받은 data/sheet.csv 를 사용합니다.
 */
const fs = require('fs');
const path = require('path');
const { parseCSV } = require('./csv');

const ROOT = path.resolve(__dirname, '..');
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vStAETGqwhy2ux_FQAzPeS_bPUu_pIk_F7n79vO7LKCgAZ1KYHnqJ37WX5c2Higqtzx8gG6HBq7zouS/pub?gid=1254534939&single=true&output=csv';
const CACHE = path.join(ROOT, 'data', 'sheet.csv');
const REL = 'sponsored nofollow noopener noreferrer';

const CATEGORIES = [
  { slug: 'cosmetics-beauty', name: '화장품/미용', en: 'Cosmetics &amp; Beauty', desc: '피부 장벽, 보습, 노화 케어까지 성분과 사용감을 꼼꼼히 기록한 화장품/미용 아이템을 소개합니다.' },
  { slug: 'living-health', name: '생활/건강', en: 'Living &amp; Health', desc: '일상의 악취, 만성적인 피로와 사소한 불편을 지워주는 검증된 생활 도구들을 소개합니다.' },
  { slug: 'food', name: '식품', en: 'Food', desc: '매일 먹는 것의 성분과 품질을 따져본 식품 큐레이션을 소개합니다.' },
  { slug: 'furniture-interior', name: '가구/인테리어', en: 'Furniture &amp; Interior', desc: '공간의 분위기와 실용성을 함께 고려한 가구/인테리어 오브제를 소개합니다.' },
  { slug: 'digital-appliances', name: '디지털/가전', en: 'Digital &amp; Appliances', desc: '데스크와 생활 공간의 효율을 높이는 디지털/가전 기기를 데이터로 분석합니다.' },
];
const catByName = Object.fromEntries(CATEGORIES.map(c => [c.name.replace(/\s/g, ''), c]));

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const stripTags = s => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const safeUrl = u => (/^https?:\/\//i.test((u || '').trim()) ? u.trim() : '#');

async function loadCSV() {
  try {
    const res = await fetch(SHEET_CSV_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    fs.mkdirSync(path.dirname(CACHE), { recursive: true });
    fs.writeFileSync(CACHE, text, 'utf8');
    console.log('[fetch] 구글 시트 CSV 수신 완료');
    return text;
  } catch (e) {
    if (!fs.existsSync(CACHE)) throw e;
    console.warn('[fetch] 실패(' + e.message + ') -> 캐시 data/sheet.csv 사용');
    return fs.readFileSync(CACHE, 'utf8');
  }
}

function toPosts(csv) {
  const rows = parseCSV(csv);
  const head = rows[0].map(h => h.trim());
  const idx = (...names) => head.findIndex(h => names.includes(h));
  const col = {
    slug: idx('슬러그'), cat: idx('카테고리'), title: idx('제목'), body: idx('원고(본문)', '원고', '본문'),
    img: idx('썸네일', '대표이미지'), link: idx('쇼핑링크', '쇼핑링크1'),
  };
  for (const [k, v] of Object.entries(col)) if (v < 0) throw new Error('시트 컬럼 누락: ' + k);
  const seen = new Set();
  const posts = [];
  rows.slice(1).forEach((r, n) => {
    const slug = (r[col.slug] || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
    const catName = (r[col.cat] || '').replace(/\s/g, '');
    const cat = catByName[catName];
    if (!slug || !r[col.title]) { console.warn(`[skip] ${n + 2}행: 슬러그/제목 없음`); return; }
    if (!cat) { console.warn(`[skip] ${n + 2}행: 알 수 없는 카테고리 "${r[col.cat]}"`); return; }
    if (seen.has(slug)) { console.warn(`[skip] ${n + 2}행: 슬러그 중복 ${slug}`); return; }
    seen.add(slug);
    const body = (r[col.body] || '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+="[^"]*"/gi, '');
    const firstP = (body.match(/<p[^>]*>([\s\S]*?)<\/p>/i) || [])[1] || body;
    const text = stripTags(firstP);
    posts.push({
      slug, cat, title: r[col.title].trim(), body, image: (r[col.img] || '').trim(), link: safeUrl(r[col.link]),
      excerpt: text.length > 110 ? text.slice(0, 110).trim() + '…' : text,
      desc: text.length > 150 ? text.slice(0, 150).trim() + '…' : text,
      minutes: Math.max(1, Math.round(stripTags(body).length / 500)),
    });
  });
  return posts;
}

// ---------- 공통 조각 ----------
function navDesktop(root, active) {
  const items = CATEGORIES.map(c => {
    const on = c.slug === active;
    const cls = on
      ? "relative py-space-sm transition-colors after:content-[''] after:absolute after:bottom-0 after:left-0 after:h-[2px] after:bg-primary-container after:transition-all text-ink-primary font-bold after:w-full"
      : "relative py-space-sm font-label-md text-label-md text-ink-secondary hover:text-ink-primary transition-colors after:content-[''] after:absolute after:bottom-0 after:left-0 after:w-0 after:h-[2px] after:bg-primary-container after:transition-all hover:after:w-full";
    return `<a ${on ? 'aria-current="page" ' : ''}class="${cls}" data-path="${c.slug}" href="${root}category/${c.slug}.html">${c.name}</a>`;
  }).join('');
  return `<nav aria-label="주요 카테고리" class="hidden lg:flex items-center gap-space-lg" data-active-classes="text-ink-primary font-bold after:w-full">${items}</nav>`;
}
function navMobile(root, active) {
  const lis = CATEGORIES.map(c => {
    const on = c.slug === active;
    return `<li class="shrink-0"><a ${on ? 'aria-current="page" ' : ''}class="inline-block py-3 ${on ? 'text-ink-primary font-bold border-b-2 border-primary-container' : 'hover:text-ink-primary transition-colors'}" href="${root}category/${c.slug}.html">${c.name}</a></li>`;
  }).join('');
  return `<nav aria-label="카테고리 메뉴" class="lg:hidden border-t border-border-subtle/70 overflow-x-auto"><ul class="flex items-center gap-6 px-4 sm:px-6 md:px-8 whitespace-nowrap font-label-md text-label-md text-ink-secondary w-max min-w-full">${lis}</ul></nav>`;
}

const IMG_ATTR = 'loading="lazy" decoding="async" referrerpolicy="no-referrer"';

function indexCard(p) {
  return `<article class="relative bg-surface-card border border-border-subtle rounded-xl p-4 flex flex-col justify-between shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all group">
<div class="flex flex-col gap-3.5">
<div class="relative w-full aspect-[4/3] bg-surface-container rounded-lg overflow-hidden">
<img ${IMG_ATTR} alt="${esc(p.title)}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" src="${esc(p.image)}">
<div class="absolute top-2.5 left-2.5 flex gap-1.5">
<span class="bg-primary text-on-primary text-[10px] tracking-wider uppercase font-medium px-2 py-0.5 rounded">${esc(p.cat.name)}</span>
<span class="bg-surface-card/90 backdrop-blur-sm text-ink-secondary text-[10px] font-medium px-2 py-0.5 rounded border border-border-subtle">에디터 큐레이션</span>
</div>
</div>
<div class="flex flex-col gap-1.5">
<h3 class="serif-title text-base font-semibold text-ink-primary line-clamp-2 leading-snug group-hover:text-primary transition-colors"><a class="after:content-[''] after:absolute after:inset-0 focus:outline-none" href="posts/${p.slug}.html">${esc(p.title)}</a></h3>
<p class="text-xs text-ink-secondary line-clamp-2 leading-relaxed">${esc(p.excerpt)}</p>
</div>
</div>
<div class="pt-3 border-t border-border-subtle mt-3 flex justify-end">
<span class="text-xs font-medium text-ink-muted group-hover:text-primary flex items-center gap-0.5 transition-colors">자세히 보기 <span class="material-symbols-outlined text-[13px]">north_east</span></span>
</div>
</article>`;
}

function categoryCard(p, i) {
  return `<article class="group bg-surface-card rounded-xl border border-border-subtle p-4 sm:p-6 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col md:flex-row gap-4 sm:gap-6 items-stretch">
<div class="w-full md:w-[230px] h-[200px] sm:h-[260px] md:h-[220px] rounded-lg overflow-hidden bg-surface-container shrink-0 relative">
<img ${IMG_ATTR} class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt="${esc(p.title)}" src="${esc(p.image)}"/>
<span class="absolute top-3 left-3 px-2 py-0.5 bg-surface-card/90 backdrop-blur-sm text-ink-primary text-label-sm font-label-sm rounded border border-border-subtle">No. ${String(i + 1).padStart(2, '0')}</span>
</div>
<div class="flex flex-col justify-between flex-1 min-w-0">
<div>
<div class="flex flex-wrap items-center gap-2 mb-2.5">
<span class="px-2 py-0.5 bg-primary-container/10 text-primary-container font-label-sm text-label-sm rounded font-medium">${esc(p.cat.name)}</span>
<span class="font-label-sm text-label-sm text-ink-muted">에디터 큐레이션</span>
</div>
<h2 class="font-headline-sm text-headline-sm font-bold text-ink-primary group-hover:text-primary-container transition-colors leading-snug"><a class="focus:outline-none" href="../posts/${p.slug}.html">${esc(p.title)}</a></h2>
<p class="font-body-sm text-body-sm text-ink-secondary line-clamp-2 leading-relaxed mt-2.5">${esc(p.excerpt)}</p>
</div>
<div class="mt-4 pt-3 border-t border-surface-container flex flex-wrap items-center justify-between gap-2 text-ink-muted font-body-sm text-body-sm">
<span class="font-label-sm text-label-sm text-ink-muted flex items-center gap-1.5"><span class="material-symbols-outlined text-[15px]">schedule</span>읽는 시간 약 ${p.minutes}분</span>
<a class="font-label-md text-label-md text-primary-container font-semibold group-hover:translate-x-1 transition-transform inline-flex items-center gap-1" href="../posts/${p.slug}.html">더 깊이 읽어보기<span class="material-symbols-outlined text-[16px]">arrow_forward</span></a>
</div>
</div>
</article>`;
}

const EMPTY = cls => `<p class="${cls} text-sm text-ink-muted py-8">아직 등록된 기록이 없습니다. 곧 새로운 기록으로 찾아뵙겠습니다.</p>`;

function shoppingBox(p, kind) {
  const mid = kind === 'middle';
  const badge = mid ? '#실사용 검증' : '#에디터 최종 추천';
  const sub = mid ? `${p.cat.name} · 실사용 데이터 분석` : `${p.cat.name} · 네이버 쇼핑 연동`;
  const btnCls = mid
    ? 'w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-lg bg-primary-container hover:bg-secondary text-white font-label-md text-label-md font-medium transition-colors shadow-sm text-center'
    : 'w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-lg bg-ink-primary hover:bg-primary-container text-white font-label-md text-label-md font-medium transition-colors shadow-sm text-center group';
  const btnText = mid ? '실물 디테일 보러가기' : '네이버 쇼핑 공식 확인하기';
  const arrow = mid ? 'text-[18px]' : 'text-[18px] group-hover:translate-x-1 transition-transform';
  return `<aside aria-label="추천 상품" class="my-6 bg-surface-card rounded-xl border border-gray-200 p-6 sm:p-7 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] transition-all hover:shadow-[0_8px_24px_-4px_rgba(0,0,0,0.08)]">
<div class="flex flex-col sm:flex-row gap-5 items-start sm:items-center">
<div class="w-full sm:w-[120px] h-[120px] rounded-lg overflow-hidden shrink-0 bg-surface"><img ${IMG_ATTR} class="w-full h-full object-cover" alt="${esc(p.title)}" src="${esc(p.image)}"></div>
<div class="flex flex-col gap-1.5 flex-1 min-w-0">
<div class="flex items-center gap-2"><span class="inline-block px-2 py-0.5 bg-primary-container text-white text-[11px] font-medium tracking-wide rounded">${badge}</span><span class="text-xs text-gray-500 font-label-sm">${esc(sub)}</span></div>
<p class="text-lg font-bold text-gray-900 tracking-tight leading-snug line-clamp-2">${esc(p.title)}</p>
<p class="text-sm text-gray-600 leading-relaxed font-body-sm line-clamp-2">${esc(p.excerpt)}</p>
</div>
</div>
<div class="mt-5 pt-4 border-t border-gray-100">
<a class="${btnCls}" data-bind="shopping-link" href="${esc(p.link)}" target="_blank" rel="${REL}"><span>${btnText}</span><span class="material-symbols-outlined ${arrow}">arrow_forward</span></a>
</div>
</aside>`;
}

function renderBody(p) {
  let body = p.body.replace(/<a\s+([^>]*href="https?:[^"]*"[^>]*)>/gi, (m, a) => `<a ${a.replace(/\s(target|rel)="[^"]*"/g, '')} target="_blank" rel="${REL}">`);
  const MARK = /<!--\s*SHOPPING_BOX_MIDDLE\s*-->/;
  const wrap = s => {
    if (!s.trim()) return '';
    return /^\s*<h2[\s>]/i.test(s) ? `<section class="flex flex-col gap-5 pt-2">${s.trim()}</section>` : `<div class="flex flex-col gap-5">${s.trim()}</div>`;
  };
  let out = '';
  for (const part of body.split(/(?=<h2[\s>])/i)) {
    const m = part.match(MARK);
    if (m) {
      const i = part.indexOf(m[0]);
      out += wrap(part.slice(0, i)) + shoppingBox(p, 'middle') + wrap(part.slice(i + m[0].length));
    } else out += wrap(part);
  }
  return out + shoppingBox(p, 'bottom');
}

function prevNext(posts, i, root) {
  const prev = posts[i - 1], next = posts[i + 1];
  const base = 'p-4 rounded-lg bg-surface border border-border-subtle hover:border-ink-primary/30 transition-all group flex flex-col gap-1';
  const lab = 'font-label-sm text-[11px] text-ink-muted tracking-wider uppercase font-medium flex items-center gap-1';
  const tt = 'font-headline-sm text-sm font-medium text-ink-primary group-hover:text-primary transition-colors line-clamp-1';
  const a = prev ? `<a class="${base}" href="${root}posts/${prev.slug}.html"><span class="${lab}"><span class="material-symbols-outlined text-[14px]">arrow_back</span>이전 기록</span><span class="${tt}">${esc(prev.title)}</span></a>` : '';
  const b = next ? `<a class="${base} sm:text-right${prev ? '' : ' sm:col-start-2'}" href="${root}posts/${next.slug}.html"><span class="${lab} sm:justify-end">다음 기록<span class="material-symbols-outlined text-[14px]">arrow_forward</span></span><span class="${tt}">${esc(next.title)}</span></a>` : '';
  return (a || b) ? `<nav aria-label="이전/다음 글" class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-border-subtle">${a}${b}</nav>` : '';
}

function fill(tpl, map, name) {
  const out = tpl.replace(/\{\{([A-Z0-9_]+(?::[a-z-]+)?)\}\}/g, (m, k) => (k in map ? map[k] : m));
  const left = out.match(/\{\{[^}]+\}\}/g);
  if (left) throw new Error(`${name}: 치환되지 않은 플레이스홀더 ${[...new Set(left)].join(', ')}`);
  return out;
}

function emptyDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.html')) fs.unlinkSync(path.join(dir, f));
}

(async function main() {
  const posts = toPosts(await loadCSV());
  console.log(`[parse] 유효한 글 ${posts.length}개`);
  const tpl = n => fs.readFileSync(path.join(ROOT, 'templates', n + '.tpl.html'), 'utf8');
  const T = { post: tpl('post'), category: tpl('category'), index: tpl('index') };

  // 1) 상세 페이지
  emptyDir(path.join(ROOT, 'posts'));
  posts.forEach((p, i) => {
    const jsonld = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'BlogPosting', headline: p.title, articleSection: p.cat.name,
      image: p.image, author: { '@type': 'Organization', name: '비밀 잡화점 에디터 큐레이션' },
      publisher: { '@type': 'Organization', name: '비밀 잡화점 The Secret Sundries' }, inLanguage: 'ko-KR',
    }).replace(/</g, '\\u003c');
    const html = fill(T.post, {
      ROOT: '../', TITLE: esc(p.title), DESC: esc(p.desc), IMAGE: esc(p.image), JSONLD: jsonld, SLUG: p.slug,
      CATEGORY: esc(p.cat.name), CAT_SLUG: p.cat.slug, NAV_DESKTOP: navDesktop('../', p.cat.slug), NAV_MOBILE: navMobile('../', p.cat.slug),
      BODY: renderBody(p),
      TAGS: ['#' + p.cat.name.replace(/\//g, ''), '#에디터추천', '#큐레이션'].map(t => `<span class="px-2.5 py-1 bg-surface rounded text-xs text-ink-secondary border border-border-subtle hover:border-ink-muted cursor-pointer transition-colors">${esc(t)}</span>`).join(''),
      PREV_NEXT: prevNext(posts, i, '../'),
    }, 'post:' + p.slug);
    fs.writeFileSync(path.join(ROOT, 'posts', p.slug + '.html'), html, 'utf8');
  });

  // 2) 카테고리 페이지
  emptyDir(path.join(ROOT, 'category'));
  for (const c of CATEGORIES) {
    const list = posts.filter(p => p.cat === c);
    const html = fill(T.category, {
      ROOT: '../', CATEGORY: esc(c.name), CATEGORY_H1: esc(c.name.replace('/', ' / ')), CAT_DESC: esc(c.desc), DESC: esc(c.desc),
      CAT_EN: c.en, COUNT: String(list.length), NAV_DESKTOP: navDesktop('../', c.slug), NAV_MOBILE: navMobile('../', c.slug),
      CARDS: list.length ? list.map(categoryCard).join('\n') : EMPTY(''),
    }, 'category:' + c.slug);
    fs.writeFileSync(path.join(ROOT, 'category', c.slug + '.html'), html, 'utf8');
  }

  // 3) 메인
  const map = { ROOT: '' };
  for (const c of CATEGORIES) {
    const list = posts.filter(p => p.cat === c);
    map['CARDS:' + c.slug] = list.length ? list.map(indexCard).join('\n') : EMPTY('col-span-full');
  }
  fs.writeFileSync(path.join(ROOT, 'index.html'), fill(T.index, map, 'index'), 'utf8');

  console.log(`[done] posts/ ${posts.length}개, category/ ${CATEGORIES.length}개, index.html 생성 완료`);
})().catch(e => { console.error(e); process.exit(1); });
