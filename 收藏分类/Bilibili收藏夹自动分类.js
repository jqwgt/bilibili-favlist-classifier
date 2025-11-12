// ==UserScript==
// @name         Bilibili收藏夹自动分类
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  B站收藏夹视频自动分类
// @author       https://space.bilibili.com/1937042029,https://github.com/jqwgt
// @license      GPL-3.0-or-later
// @match        *://space.bilibili.com/*/favlist*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      api.bilibili.com
// @downloadURL https://update.greasyfork.org/scripts/531672/Bilibili%E6%94%B6%E8%97%8F%E5%A4%B9%E8%87%AA%E5%8A%A8%E5%88%86%E7%B1%BB.user.js
// @updateURL https://update.greasyfork.org/scripts/531672/Bilibili%E6%94%B6%E8%97%8F%E5%A4%B9%E8%87%AA%E5%8A%A8%E5%88%86%E7%B1%BB.meta.js
// ==/UserScript==

(function() {
    'use strict';

    
    const state = {
        settings: {
            fetchPageSize: 20,
            infoConcurrency: 6,
            operationBatchSize: 12,
            maxProcessCount: 500,
            // 跳过详情接口以降低风控风险（仅依赖收藏列表返回的 tid/tname/up）
            skipDetailFetch: false,
            // 是否按“主分区”进行合并分组（例如 单机游戏/手机游戏 -> 游戏）
            useMainZone: true
        },
        controllers: {
            reading: createPauseController(),
            processing: createPauseController()
        },
        cache: {
            favFolders: []
        },
        data: {
            baseVideos: [],
            totalCount: 0,
            completed: true,
            readStats: null // 调试：记录列表接口字段命中率与示例keys
        },
        selection: {
            limit: 500,
            range: null
        },
        sourceFid: null
    };

    // 本地缓存：视频详情最小必要字段（断点续补，降低重复请求）
    const videoCache = (() => {
        const KEY = 'bfc_video_cache_v1';
        let store = null;
        function load() {
            if (store) return store;
            try {
                store = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
            } catch (e) {
                store = {};
            }
            return store;
        }
        function save() {
            try { localStorage.setItem(KEY, JSON.stringify(store || {})); } catch (e) { /* ignore */ }
        }
        function k(v) { return typeof v === 'string' ? v : String(v || ''); }
        return {
            get(id) { return load()[k(id)]; },
            set(id, data) { const s = load(); s[k(id)] = data; save(); },
            del(id) { const s = load(); delete s[k(id)]; save(); },
            has(id) { return !!load()[k(id)]; },
            clear() { store = {}; save(); }
        };
    })();

    function randomSleep(minMs = 80, maxMs = 200) {
        const span = Math.max(0, maxMs - minMs);
        const wait = minMs + Math.floor(Math.random() * (span + 1));
        return sleep(wait);
    }

    // 主分区映射（参考 SocialSisterYi/bilibili-API-collect video_zone_v2 文档主分区概念，非完整表；未命中则回退原分区）
    // 选择 v2 的原因：v2 是当前较新的结构调整版本，新增“计算机技术”、“科工机械”等更细分标签，需要统一并入“科技”主分区
    const MAIN_ZONE_SET = new Set([
        '动画','番剧','国创','音乐','舞蹈','游戏','知识','科技','数码','生活','美食','汽车','动物圈','运动','时尚','娱乐','影视','纪录片','电影','电视剧','鬼畜','资讯','直播'
    ]);
    const SUB_TO_MAIN_BY_NAME = {
        // 动画/番剧/国创
        'MAD·AMV': '动画','MMD·3D': '动画','短片·手书·配音': '动画','综合': '动画','动画资讯': '动画','布袋戏': '国创','特摄': '动画','国产动画': '国创','欧美动画': '动画',
        // 音乐
        '原创音乐': '音乐','翻唱': '音乐','VOCALOID·UTAU': '音乐','演奏': '音乐','MV': '音乐','音乐现场': '音乐','音乐综合': '音乐','音乐教学': '音乐','音乐资讯': '音乐',
        // 舞蹈
        '宅舞': '舞蹈','街舞': '舞蹈','舞蹈综合': '舞蹈','舞蹈教程': '舞蹈',
        // 游戏
        '单机游戏': '游戏','电子竞技': '游戏','手机游戏': '游戏','网络游戏': '游戏','桌游棋牌': '游戏','GMV': '游戏','音游': '游戏','Mugen': '游戏','游戏知识': '游戏','游戏赛事': '游戏',
        // 科技/知识/数码
        '科学': '知识','社科·法律·心理': '知识','校园学习': '知识','职业职场': '知识','人文历史': '知识','设计·创意': '知识','财经商业': '知识','运动科普': '知识','汽车知识': '知识',
        '极客DIY': '科技','机械': '科技','软件应用': '科技','野生技术协会': '科技',
        '手机平板': '数码','电脑装机': '数码','摄影摄像': '数码','影音智能': '数码',
    // 计算机技术 & 科工机械（v2 新出现子类，统一到“科技”）
    '计算机技术': '科技','科工机械': '科技','科学科普': '科技','工程': '科技','电子产品': '科技','编程': '科技','人工智能': '科技','AI': '科技',
        // 生活/美食/动物圈/汽车/运动/时尚/娱乐
        '搞笑': '生活','日常': '生活','手工': '生活','绘画': '生活','户外': '生活','其他': '生活',
        '美食制作': '美食','美食侦探': '美食','美食测评': '美食','田园美食': '美食',
        '喵星人': '动物圈','汪星人': '动物圈','大熊猫': '动物圈','野生动物': '动物圈','动物综合': '动物圈',
        '赛车': '汽车','改装': '汽车','新能源车': '汽车','汽车生活': '汽车','摩托': '汽车',
        '篮球': '运动','足球': '运动','羽毛球': '运动','乒乓球': '运动','健身': '运动',
        '美妆': '时尚','服饰': '时尚','T台': '时尚','风尚标': '时尚',
        '综艺': '娱乐','明星': '娱乐','娱乐圈': '娱乐','演出': '娱乐',
        // 影视
        '影视杂谈': '影视','影视剪辑': '影视','预告': '影视','影视混剪': '影视','影视评测': '影视',
        // 鬼畜
        '鬼畜调教': '鬼畜','音MAD': '鬼畜','人力VOCALOID': '鬼畜','教程演示': '鬼畜',
        // 纪录片/电影/电视剧
        '人文·历史': '纪录片','科学·探索·自然': '纪录片','军事': '纪录片'
    };

    function getMainZoneName(tname) {
        if (!tname) return null;
        if (MAIN_ZONE_SET.has(tname)) return tname; // 已是主分区
        const mapped = SUB_TO_MAIN_BY_NAME[tname];
        return mapped || null;
    }

    function assignClassificationFields(videos) {
        if (!Array.isArray(videos)) return;
        const useMain = state.settings.useMainZone;
        let beforeDistinct = new Set();
        let afterDistinct = new Set();
        videos.forEach(v => {
            const name = v?.tname || '';
            if (name) beforeDistinct.add(name);
            if (useMain) {
                const main = getMainZoneName(name) || (name && MAIN_ZONE_SET.has(name) ? name : null);
                if (main) {
                    v.classTname = main;
                    v.classTid = `M:${main}`;
                } else {
                    v.classTname = name || '未知分区';
                    v.classTid = v.tid != null ? String(v.tid) : 'unknown';
                }
            } else {
                v.classTname = name || '未知分区';
                v.classTid = v.tid != null ? String(v.tid) : 'unknown';
            }
            afterDistinct.add(v.classTname || v.tname || '未知分区');
        });
        try {
            if (useMain) {
                log(`[主分区聚合] 原始分区数=${beforeDistinct.size}，聚合后分区数=${afterDistinct.size}`,'info');
            }
        } catch(e){/* ignore */}
    }

    function createPauseController() {
        return {
            paused: false,
            waiters: [],
            abort: false,
            reason: null
        };
    }

    function setPaused(controller, value) {
        if (controller.paused === value) return;
        controller.paused = value;
        if (!value) {
            const waiters = [...controller.waiters];
            controller.waiters.length = 0;
            waiters.forEach(resolver => resolver());
        }
        syncPauseButtons('reading');
        syncPauseButtons('processing');
        syncReadingActions();
    }

    async function waitIfPaused(controller) {
        if (!controller.paused) return;
        await new Promise(resolve => controller.waiters.push(resolve));
    }

    function getController(type) {
        return state.controllers[type];
    }

    function resetController(type) {
        state.controllers[type] = createPauseController();
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function chunkArray(arr, size) {
        if (size <= 0) return [arr];
        const result = [];
        for (let i = 0; i < arr.length; i += size) {
            result.push(arr.slice(i, i + size));
        }
        return result;
    }

    async function runWithConcurrency(items, limit, iterator) {
        if (!Array.isArray(items) || items.length === 0) return;
        const maxWorkers = Math.max(1, Math.min(limit || 1, items.length));
        let cursor = 0;

        const workers = Array.from({ length: maxWorkers }, async () => {
            while (cursor < items.length) {
                const current = cursor++;
                if (current >= items.length) break;
                await iterator(items[current], current);
            }
        });

        await Promise.all(workers);
    }

    const PROGRESS_DEFS = {
        reading: { id: 'reading-progress', defaultMessage: '正在读取视频...' },
        processing: { id: 'fav-progress', defaultMessage: '正在处理...' }
    };

    function ensureProgressUI(type, message) {
        const { id, defaultMessage } = PROGRESS_DEFS[type];
        let container = document.getElementById(id);
        if (!container) {
            container = document.createElement('div');
            container.id = id;
            container.className = 'bili-classifier-progress';
            container.innerHTML = `
                <div class="message">${message || defaultMessage}</div>
                <div class="bili-classifier-progress-bar">
                    <div class="bili-classifier-progress-fill" style="width:0%"></div>
                </div>
                <div class="counter">0/0</div>
                <div class="bili-classifier-progress-actions">
                    <button class="bili-classifier-btn secondary pause-btn">暂停</button>
                    <button class="bili-classifier-btn resume-btn" style="display:none">继续</button>
                </div>
                ${type === 'reading' ? `
                <div class="bili-classifier-progress-actions reading-extra" style="display:none">
                    <button class="bili-classifier-btn secondary reading-continue">继续分析</button>
                    <button class="bili-classifier-btn reading-process-now">以当前进度操作</button>
                    <button class="bili-classifier-btn danger reading-exit">退出</button>
                </div>
                ` : ''}
                <div class="bili-classifier-message"></div>
            `;
            document.body.appendChild(container);
            bindPauseResume(type, container);
        }
        syncPauseButtons(type);
        if (type === 'reading') {
            syncReadingActions();
        }
        return container;
    }

    function bindPauseResume(type, container) {
        if (container.dataset.bindPause === '1') return;
        const pauseBtn = container.querySelector('.pause-btn');
        const resumeBtn = container.querySelector('.resume-btn');

        pauseBtn.addEventListener('click', () => {
            const controller = getController(type);
            setPaused(controller, true);
            pauseBtn.style.display = 'none';
            resumeBtn.style.display = '';
            if (type === 'reading') {
                showReadingActions();
            }
        });

        resumeBtn.addEventListener('click', () => {
            const controller = getController(type);
            setPaused(controller, false);
            resumeBtn.style.display = 'none';
            pauseBtn.style.display = '';
            if (type === 'reading') {
                hideReadingActions();
            }
        });

        container.dataset.bindPause = '1';

        if (type === 'reading') {
            bindReadingActionButtons(container);
        }
    }

    function syncPauseButtons(type) {
        const { id } = PROGRESS_DEFS[type];
        const container = document.getElementById(id);
        if (!container) return;
        const pauseBtn = container.querySelector('.pause-btn');
        const resumeBtn = container.querySelector('.resume-btn');
        const controller = getController(type);
        if (!pauseBtn || !resumeBtn || !controller) return;
        if (controller.paused) {
            pauseBtn.style.display = 'none';
            resumeBtn.style.display = '';
            if (type === 'reading') showReadingActions();
        } else {
            pauseBtn.style.display = '';
            resumeBtn.style.display = 'none';
            if (type === 'reading') hideReadingActions();
        }
    }

    function bindReadingActionButtons(container) {
        if (container.dataset.bindReading === '1') return;
        const continueBtn = container.querySelector('.reading-continue');
        const processBtn = container.querySelector('.reading-process-now');
        const exitBtn = container.querySelector('.reading-exit');

        continueBtn?.addEventListener('click', () => {
            const controller = getController('reading');
            controller.abort = false;
            controller.reason = null;
            setPaused(controller, false);
        });

        processBtn?.addEventListener('click', () => {
            const controller = getController('reading');
            controller.abort = true;
            controller.reason = 'process';
            setPaused(controller, false);
            removeProgressUI('reading');
        });

        exitBtn?.addEventListener('click', () => {
            const controller = getController('reading');
            controller.abort = true;
            controller.reason = 'cancel';
            setPaused(controller, false);
            removeProgressUI('reading');
        });

        container.dataset.bindReading = '1';
    }

    function showReadingActions() {
        const container = document.getElementById(PROGRESS_DEFS.reading.id);
        const extra = container?.querySelector('.reading-extra');
        if (extra) extra.style.display = 'flex';
    }

    function hideReadingActions() {
        const container = document.getElementById(PROGRESS_DEFS.reading.id);
        const extra = container?.querySelector('.reading-extra');
        if (extra) extra.style.display = 'none';
    }

    function syncReadingActions() {
        const controller = getController('reading');
        if (!controller) return;
        if (controller.paused) {
            showReadingActions();
        } else {
            hideReadingActions();
        }
    }

    function updateProgressUI(type, { message, current, total, extra } = {}) {
        const container = ensureProgressUI(type, message);
        if (message) container.querySelector('.message').textContent = message;
        if (typeof current === 'number' && typeof total === 'number') {
            const safeTotal = total <= 0 ? 1 : total;
            const percent = Math.min(100, Math.max(0, (current / safeTotal) * 100));
            container.querySelector('.bili-classifier-progress-fill').style.width = `${percent}%`;
            container.querySelector('.counter').textContent = `${Math.min(current, total)}/${total}`;
        }
        if (typeof extra === 'string') {
            container.querySelector('.bili-classifier-message').textContent = extra;
        }
    }

    function removeProgressUI(type) {
        const { id } = PROGRESS_DEFS[type];
        document.getElementById(id)?.remove();
    }

    // 添加全局样式
    GM_addStyle(`
        .bili-classifier-container {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #222;
        }
        .bili-classifier-modal {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 25px;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            z-index: 10000;
            max-height: 80vh;
            overflow-y: auto;
            width: 700px;
            max-width: 90vw;
        }
        .bili-classifier-modal h3 {
            margin-top: 0;
            color: #00a1d6;
            font-size: 1.5em;
            border-bottom: 1px solid #eee;
            padding-bottom: 10px;
        }
        .bili-classifier-btn {
            padding: 10px 16px;
            background: #00a1d6;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s;
            margin-right: 10px;
        }
        .bili-classifier-btn:hover {
            background: #0087b4;
            transform: translateY(-1px);
        }
        .bili-classifier-btn.secondary {
            background: #f0f0f0;
            color: #666;
        }
        .bili-classifier-btn.secondary:hover {
            background: #e0e0e0;
        }
        .bili-classifier-btn.danger {
            background: #ff4d4f;
        }
        .bili-classifier-btn.danger:hover {
            background: #ff7875;
        }
        .bili-classifier-group {
            margin: 15px 0;
            padding: 15px;
            border: 1px solid #eee;
            border-radius: 8px;
            background: #fafafa;
        }
        .bili-classifier-group-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
        }
        .bili-classifier-input {
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            width: 200px;
            margin-right: 10px;
        }
        .bili-classifier-select {
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            width: 220px;
            margin-right: 10px;
        }
        .bili-classifier-checkbox-group {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 8px;
            margin-top: 10px;
        }
        .bili-classifier-checkbox-label {
            display: flex;
            align-items: center;
            cursor: pointer;
        }
        .bili-classifier-checkbox {
            margin-right: 8px;
        }
        .bili-classifier-footer {
            display: flex;
            justify-content: flex-end;
            margin-top: 20px;
            padding-top: 15px;
            border-top: 1px solid #eee;
        }
        .bili-classifier-progress {
            position: fixed;
            bottom: 30px;
            right: 30px;
            background: white;
            padding: 15px 20px;
            border-radius: 10px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            z-index: 10000;
            min-width: 250px;
        }
        .bili-classifier-progress-bar {
            width: 100%;
            height: 10px;
            background: #f0f0f0;
            border-radius: 5px;
            margin: 8px 0;
            overflow: hidden;
        }
        .bili-classifier-progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #00a1d6, #00c4ff);
            border-radius: 5px;
            transition: width 0.3s;
        }
        .bili-classifier-progress-actions {
            display: flex;
            gap: 10px;
            margin-top: 10px;
        }
        .bili-classifier-progress-actions .bili-classifier-btn {
            flex: 1;
            padding: 6px 10px;
            font-size: 12px;
        }
        .bili-classifier-float-btn {
            position: fixed;
            right: 30px;
            bottom: 30px;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .bili-classifier-links {
            display: flex;
            gap: 10px;
            margin-top: 20px;
        }
        .bili-classifier-link-btn {
            padding: 8px 12px;
            background: #f0f0f0;
            color: #666;
            border-radius: 4px;
            text-decoration: none;
            font-size: 12px;
            display: flex;
            align-items: center;
            gap: 5px;
        }
        .bili-classifier-link-btn:hover {
            background: #e0e0e0;
        }
        .bili-classifier-radio-group {
            display: flex;
            gap: 15px;
            margin: 15px 0;
        }
        .bili-classifier-radio-label {
            display: flex;
            align-items: center;
            gap: 5px;
            cursor: pointer;
        }
        .bili-classifier-option-group {
            margin: 15px 0;
            padding: 15px;
            border: 1px solid #eee;
            border-radius: 8px;
        }
        .bili-classifier-table-wrapper {
            max-height: 50vh;
            overflow: auto;
            border: 1px solid #eee;
            border-radius: 6px;
            margin-top: 15px;
        }
        table.bili-classifier-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
        }
        table.bili-classifier-table th,
        table.bili-classifier-table td {
            padding: 8px 10px;
            border-bottom: 1px solid #f0f0f0;
            text-align: left;
            word-break: break-all;
        }
        table.bili-classifier-table tr:nth-child(even) {
            background: #fafafa;
        }
        .bili-classifier-modal .input-row {
            display: flex;
            gap: 15px;
            flex-wrap: wrap;
            margin-bottom: 15px;
        }
        .bili-classifier-modal .input-row label {
            display: flex;
            flex-direction: column;
            font-size: 13px;
            color: #555;
        }
        .bili-classifier-modal .input-row input {
            margin-top: 4px;
            min-width: 140px;
        }
        .bili-chip-list {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 10px;
        }
        .bili-chip {
            padding: 4px 10px;
            background: #e6f7ff;
            color: #096dd9;
            border-radius: 999px;
            font-size: 12px;
        }
        .bili-export-actions {
            display: flex;
            gap: 10px;
            margin-top: 15px;
        }
        .bili-classifier-message {
            font-size: 13px;
            color: #666;
            margin-top: 10px;
        }
        .bili-help-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 18px;
            height: 18px;
            border-radius: 50%;
            background: #00a1d6;
            color: #fff;
            font-size: 12px;
            margin-left: 6px;
            cursor: pointer;
            position: relative;
        }
        .bili-help-icon::after {
            content: attr(data-tip);
            position: absolute;
            left: 50%;
            top: 120%;
            transform: translateX(-50%);
            padding: 10px 14px;
            background: rgba(0,0,0,0.75);
            color: #fff;
            border-radius: 6px;
            font-size: 12px;
            line-height: 1.5;
            white-space: pre-line;
            width: 240px;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.2s ease;
            z-index: 10001;
        }
        .bili-help-icon:hover::after {
            opacity: 1;
        }
        .bili-postfetch-section {
            margin-top: 20px;
            padding: 15px;
            border: 1px solid #eee;
            border-radius: 8px;
            background: #fafafa;
        }
        .bili-postfetch-actions {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
            margin-top: 15px;
        }
        .bili-postfetch-actions .bili-classifier-btn {
            flex: 0 0 auto;
        }
        .bili-range-inputs {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-top: 10px;
        }
        .bili-range-inputs input {
            width: 120px;
        }
        .bili-highlight {
            color: #00a1d6;
            font-weight: 600;
        }
    `);

    // 获取CSRF令牌
    function getCsrf() {
        return document.cookie.match(/bili_jct=([^;]+)/)?.[1] || '';
    }

    // 通用请求重试（指数退避 + 抖动）
    async function retryOperation(fn, { retries = 3, minDelay = 300, maxDelay = 1500 } = {}) {
        let attempt = 0;
        while (true) {
            try {
                return await fn(attempt);
            } catch (err) {
                attempt += 1;
                if (attempt > retries) throw err;
                const backoff = Math.min(maxDelay, Math.round(minDelay * Math.pow(2, attempt - 1)));
                const jitter = Math.floor(Math.random() * 200);
                const wait = backoff + jitter;
                log(`请求出错，重试第 ${attempt}/${retries}，等待 ${wait} ms：${err?.message || err}`, 'error');
                await sleep(wait);
            }
        }
    }

    // 添加日志功能
    function log(message, type = 'info') {
        const styles = {
            info: 'color: #00a1d6',
            error: 'color: #ff0000',
            success: 'color: #00ff00'
        };
        console.log(`%c[收藏夹分类] ${message}`, styles[type]);
    }

    // 获取用户收藏夹
    async function getUserFavLists(force = false) {
        if (!force && state.cache.favFolders.length) {
            return state.cache.favFolders;
        }
        const mid = window.location.pathname.split('/')[1];
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://api.bilibili.com/x/v3/fav/folder/created/list-all?up_mid=${mid}`,
                responseType: 'json',
                onload: function(response) {
                    const list = response.response?.data?.list || [];
                    state.cache.favFolders = list;
                    resolve(list);
                },
                onerror: reject
            });
        });
    }

    // 获取收藏夹全部内容ID（一次性）
    async function getFavIds(mediaId) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://api.bilibili.com/x/v3/fav/resource/ids?media_id=${mediaId}&platform=web`,
                responseType: 'json',
                onload: function (response) {
                    const arr = response?.response?.data;
                    if (Array.isArray(arr)) {
                        resolve(arr);
                        return;
                    }
                    resolve([]);
                },
                onerror: err => reject(err instanceof Error ? err : new Error('网络错误'))
            });
        });
    }

    // 获取视频详细信息
    // 获取视频详细信息 增加跳过异常
    async function getVideoInfo(aid) {
        // 使用 retryOperation 来处理临时网络错误或限流
        return retryOperation(async (attempt) => {
            return await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: `https://api.bilibili.com/x/web-interface/view?aid=${aid}`,
                    responseType: 'json',
                    onload: function(response) {
                        const res = response?.response;
                        const data = res?.data;
                        if (!data) {
                            const msg = `视频 ${aid} 可能已失效或无法访问`;
                            // 当服务端返回错误码时，reject 以触发重试（最多 retries 次）
                            const code = res?.code ?? response?.status;
                            if (attempt < 2) {
                                reject(new Error(msg + ` (code:${code})`));
                                return;
                            }
                            log(msg, 'error');
                            reject(new Error(msg));
                            return;
                        }
                        if (attempt > 0) log(`视频 ${aid} 详情获取成功（重试次数 ${attempt}）`, 'info');
                        resolve(data);
                    },
                    onerror: function(error) {
                        reject(error instanceof Error ? error : new Error('网络错误'));
                    }
                });
            });
        }, { retries: 3, minDelay: 250, maxDelay: 1500 });
    }

    // 获取收藏夹中的视频
    async function getFavVideos(mediaId, pageSize = state.settings.fetchPageSize) {
        resetController('reading');
        removeProgressUI('reading');
        state.data.baseVideos = [];
        state.data.totalCount = 0;
        state.data.completed = true;
        state.data.readStats = { pages: 0, items: 0, tidKnown: 0, tnameKnown: 0, upKnown: 0, sampleKeys: [] };

        const controller = getController('reading');
        let pn = 1;
        let totalCount = 0;
        let hasMore = true;
        const videos = [];

        // 优先尝试一次性获取全部ID，作为总数估计与后续补充参考
        let idList = [];
        try {
            idList = await getFavIds(mediaId);
            if (Array.isArray(idList) && idList.length) {
                totalCount = idList.length;
                updateProgressUI('reading', {
                    message: '正在读取收藏夹内容（预估总数已获取）',
                    current: 0,
                    total: totalCount,
                    extra: `共 ${totalCount} 个，开始读取明细...`
                });
            }
        } catch (e) {
            // 忽略 ids 接口失败，继续走分页
        }

        while (hasMore) {
            await waitIfPaused(controller);
            if (controller.abort) break;

            const pageData = await fetchFavPage(mediaId, pn, pageSize);
            const medias = pageData?.medias || [];
            if (!medias.length && !pageData?.has_more) break;

            if (!totalCount) {
                totalCount = idList?.length || pageData?.info?.media_count || pageData?.page?.count || pageData?.total_count || pageData?.total || medias.length;
            }

            // 调试统计：记录字段命中率和示例 keys
            try {
                state.data.readStats.pages += 1;
                state.data.readStats.items += medias.length;
                const first = medias[0];
                if (first && state.data.readStats.sampleKeys.length < 3) {
                    const keys = Object.keys(first);
                    state.data.readStats.sampleKeys.push(keys.slice(0, 30).join(','));
                }
            } catch (e) { /* ignore */ }

            medias.forEach(media => {
                videos.push({
                    aid: media.id,
                    bvid: media.bvid,
                    title: media.title,
                    tid: media.tid ?? null,
                    tname: media.tname || '',
                    upName: media.upper?.name || media.upper?.uname || '',
                    upMid: media.upper?.mid || media.upper?.uid || '',
                    cover: media.cover,
                    intro: media.intro || media.evaluate || '',
                    favTime: media.fav_time,
                    duration: media.duration,
                    raw: media
                });
                if (media.tid != null) state.data.readStats.tidKnown += 1;
                if (media.tname) state.data.readStats.tnameKnown += 1;
                if (media.upper?.name || media.upper?.uname) state.data.readStats.upKnown += 1;
            });

            // 若达到本次处理上限，则提前停止读取，进入后续流程
            const maxCount = Number(state.settings.maxProcessCount) || 500;
            if (videos.length >= maxCount) {
                updateProgressUI('reading', {
                    message: `已达到本次处理上限（${maxCount}），停止继续读取` ,
                    current: videos.length,
                    total: totalCount || videos.length,
                    extra: '可在下一步选择继续分析剩余'
                });
                // 标记为未完成，以便后续提供“继续分析剩余”按钮
                controller.abort = true;
                controller.reason = 'process';
                hasMore = true; // 仍有剩余
                break;
            }

            if (controller.abort) {
                hasMore = false;
                break;
            }

            hasMore = Boolean(pageData?.has_more);
            updateProgressUI('reading', {
                message: `正在读取收藏夹内容（第 ${pn} 页）`,
                current: videos.length,
                total: totalCount || videos.length,
                extra: controller.abort ? '已暂停，等待您的下一步操作' : (hasMore ? `预计剩余 ${Math.max(totalCount - videos.length, 0)} 个` : '读取完成')
            });

            pn += 1;
        }

        const reason = controller.reason;
        if (reason === 'cancel') {
            removeProgressUI('reading');
            throw new Error('用户已退出操作');
        }

        const completed = !(controller.abort && reason === 'process') && hasMore === false;
        state.data.baseVideos = videos;
        state.data.totalCount = totalCount || videos.length;
        state.data.completed = completed;
        state.selection.limit = Math.min(state.settings.maxProcessCount, state.data.totalCount || videos.length || state.settings.maxProcessCount);

        removeProgressUI('reading');
        // 控制台输出调试信息
        try {
            const s = state.data.readStats;
            if (s) {
                const ratio = (num, den) => den ? ((num/den*100).toFixed(1)+'%') : '0%';
                log(`[Debug] 列表接口字段命中率：tid=${s.tidKnown}/${s.items} (${ratio(s.tidKnown,s.items)}), tname=${s.tnameKnown}/${s.items} (${ratio(s.tnameKnown,s.items)}), upperName=${s.upKnown}/${s.items} (${ratio(s.upKnown,s.items)})`, 'info');
                if (s.sampleKeys.length) {
                    log(`[Debug] medias 示例 keys：${s.sampleKeys.join(' | ')}`, 'info');
                }
                if (state.settings.skipDetailFetch && s.tidKnown === 0 && s.tnameKnown === 0) {
                    log('[提示] 当前收藏列表响应未提供分区 tid/tname，若需要按分区分类，请关闭“仅使用收藏列表信息”。', 'error');
                }
            }
        } catch (e) { /* ignore */ }
        controller.abort = false;
        controller.reason = null;
        return {
            videos,
            total: state.data.totalCount,
            completed,
            reason: reason || (hasMore ? 'finished' : 'finished')
        };
    }

    function fetchFavPage(mediaId, pn, ps) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://api.bilibili.com/x/v3/fav/resource/list?media_id=${mediaId}&pn=${pn}&ps=${ps}&order=mtime&type=0&platform=web`,
                responseType: 'json',
                onload: function(response) {
                    if (!response) {
                        reject(new Error('收藏夹接口无响应，请稍后重试'));
                        return;
                    }
                    const status = typeof response.status === 'number' ? response.status : 0;
                    if (status && status !== 200) {
                        reject(new Error(`获取收藏夹第 ${pn} 页失败，状态码 ${status}`));
                        return;
                    }
                    const payload = response.response || response.responseText || {};
                    const data = payload.data || (payload.body && payload.body.data);
                    if (!data || !data.medias) {
                        reject(new Error('收藏夹数据为空或异常，请稍后重试'));
                        return;
                    }
                    resolve(data);
                },
                onerror: function(error) {
                    reject(error instanceof Error ? error : new Error(error?.message || '网络异常'));
                }
            });
        });
    }

    async function enrichVideoDetails(videos) {
        if (!Array.isArray(videos) || videos.length === 0) return;

        resetController('reading');
        removeProgressUI('reading');
        const controller = getController('reading');

        const targets = videos.filter(video => !video.tid || !video.tname || !video.upName);
        if (!targets.length) return;

        // 先尝试缓存命中（忽略无效/占位缓存）
        let cacheHit = 0;
        for (const v of targets) {
            const key = v.bvid || v.aid;
            const cached = key ? videoCache.get(key) : null;
            const badName = (cached?.tname === '未知' || cached?.tname === '未知分区');
            const validCached = cached && (cached.tid || (cached.tname && !badName) || cached.upName);
            if (validCached) {
                v.tid = v.tid ?? cached.tid ?? null;
                v.tname = v.tname || cached.tname || '';
                v.upName = v.upName || cached.upName || '';
                v.upMid = v.upMid || cached.upMid || '';
                if (!v.bvid && cached.bvid) v.bvid = cached.bvid;
                if (!v.duration && cached.duration) v.duration = cached.duration;
                cacheHit += 1;
            } else if (cached && !validCached) {
                // 清理无效缓存（历史版本可能写入过空字段/占位）
                videoCache.del(key);
            }
        }

        let completed = 0;
        updateProgressUI('reading', {
            message: '正在补充视频详细信息',
            current: 0,
            total: targets.length,
            extra: `约 ${targets.length} 条（缓存命中 ${cacheHit}）`
        });

        await runWithConcurrency(targets, state.settings.infoConcurrency, async (video) => {
            await waitIfPaused(controller);
            if (controller.abort) return;
            try {
                // 命中缓存则跳过请求
                const ck = video.bvid || video.aid;
                const cached = ck ? videoCache.get(ck) : null;
                const badName2 = (cached?.tname === '未知' || cached?.tname === '未知分区');
                if (!cached || ((!cached.tid && (!cached.tname || badName2)))) {
                    const info = await getVideoInfo(video.aid);
                    video.tid = info.tid;
                    video.tname = info.tname;
                    video.upName = info.owner?.name || video.upName || '';
                    video.upMid = info.owner?.mid || video.upMid || '';
                    video.bvid = info.bvid || video.bvid;
                    video.duration = info.duration;
                    video.pubdate = info.pubdate;
                    video.stat = info.stat;
                    // 写入缓存（用 bvid 和 aid 两个键都写一份，提升命中率）
                    if (video.tid && video.tname) {
                        const cacheValue = {
                            tid: video.tid,
                            tname: video.tname,
                            upName: video.upName,
                            upMid: video.upMid,
                            bvid: video.bvid,
                            duration: video.duration
                        };
                        if (video.aid) videoCache.set(video.aid, cacheValue);
                        if (video.bvid) videoCache.set(video.bvid, cacheValue);
                    }
                } else {
                    // 用缓存填充缺失字段
                    const tn = (cached && (cached.tname === '未知' || cached.tname === '未知分区')) ? '' : (cached?.tname || '');
                    video.tid = video.tid ?? cached.tid ?? null;
                    video.tname = video.tname || tn;
                    video.upName = video.upName || cached.upName || '';
                    video.upMid = video.upMid || cached.upMid || '';
                    if (!video.bvid && cached.bvid) video.bvid = cached.bvid;
                    if (!video.duration && cached.duration) video.duration = cached.duration;
                }
            } catch (error) {
                video.error = error.message;
            } finally {
                if (controller.abort) {
                    return;
                }
                completed += 1;
                updateProgressUI('reading', {
                    message: '正在补充视频详细信息',
                    current: Math.min(completed, targets.length),
                    total: targets.length,
                    extra: `已完成 ${completed}/${targets.length}`
                });
                await randomSleep(80, 200);
                // 每处理一定数量，进行额外冷却，进一步降低风控概率
                if (completed % 25 === 0) {
                    await sleep(800 + Math.floor(Math.random() * 800));
                }
            }
        });

        const reason = controller.reason;
        removeProgressUI('reading');
        controller.abort = false;
        controller.reason = null;

        if (reason === 'cancel') {
            throw new Error('用户已退出操作');
        }
    }

    // 创建新收藏夹
    async function createFolder(title) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://api.bilibili.com/x/v3/fav/folder/add',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                data: `csrf=${getCsrf()}&title=${encodeURIComponent(title)}`,
                responseType: 'json',
                onload: function(response) {
                    const fid = response?.response?.data?.id;
                    if (!fid) {
                        reject(new Error('创建收藏夹失败，请稍后重试'));
                        return;
                    }
                    state.cache.favFolders.push({ id: fid, title });
                    resolve(fid);
                },
                onerror: reject
            });
        });
    }

    // 添加视频到收藏夹
    async function addToFav(aid, fid) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://api.bilibili.com/x/v3/fav/resource/deal',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                data: `csrf=${getCsrf()}&rid=${aid}&type=2&add_media_ids=${fid}`,
                responseType: 'json',
                onload: function(response) {
                    resolve(response?.response);
                },
                onerror: error => reject(error instanceof Error ? error : new Error('网络错误'))
            });
        });
    }

    // 从收藏夹移除视频
    async function removeFromFav(aid, fid) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://api.bilibili.com/x/v3/fav/resource/deal',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                data: `csrf=${getCsrf()}&rid=${aid}&type=2&del_media_ids=${fid}`,
                responseType: 'json',
                onload: function(response) {
                    resolve(response?.response);
                },
                onerror: error => reject(error instanceof Error ? error : new Error('网络错误'))
            });
        });
    }

    // 创建配置界面
    function openInitialSettings(defaults) {
        const modal = document.createElement('div');
        modal.className = 'bili-classifier-container bili-classifier-modal';
        modal.innerHTML = `
            <h3>开始前的设置 <span class="bili-help-icon" data-tip="单次读取数量：控制每次请求接口的条目数量，建议≤50以减少错误。\n视频详情并发数：同时请求详细信息的数量，网络不稳定时可调低。\n操作批次大小：批量操作时的单批视频数，过大可能触发风控。\n提示：建议分批处理，一次最多处理500个视频，必要时多次运行脚本。">?</span></h3>
            <div class="input-row">
                <label>
                    单次读取数量（1-100）
                    <input type="number" id="setting-fetch-size" class="bili-classifier-input" min="1" max="100" value="${defaults.fetchPageSize}">
                </label>
                <label>
                    视频详情并发数（1-10）
                    <input type="number" id="setting-info-concurrency" class="bili-classifier-input" min="1" max="10" value="${defaults.infoConcurrency}">
                </label>
                <label>
                    操作批次大小（1-50）
                    <input type="number" id="setting-operation-batch" class="bili-classifier-input" min="1" max="50" value="${defaults.operationBatchSize}">
                </label>
            </div>
            <div class="input-row">
                <label>
                    本次处理数量上限（1-500）
                    <input type="number" id="setting-max-process" class="bili-classifier-input" min="1" max="500" value="${defaults.maxProcessCount || 500}">
                </label>
                <label class="bili-classifier-checkbox-label" style="margin-top: 22px">
                    <input type="checkbox" id="setting-skip-detail" ${defaults.skipDetailFetch ? 'checked' : ''}>
                    仅使用收藏列表信息（跳过详情接口，快速但是不能按照分区分类，适合仅导出不操作）
                </label>
                <label class="bili-classifier-checkbox-label" style="margin-top: 22px">
                    <input type="checkbox" id="setting-use-main-zone" ${defaults.useMainZone ? 'checked' : ''}>
                    按主分区合并（减少分组数量）
                </label>
            </div>
            <div class="bili-classifier-message">
                可以根据自身网络情况调整数值。批次越大速度越快，但也更容易触发B站风控。勾选“仅使用收藏列表信息”将不再请求视频详情接口（tid/tname/up 优先以列表返回为准），极大降低风控风险；若个别条目缺失字段，将以“未知”展示并归为“未知分区”。
                勾选“按主分区合并”将把常见子分区归并到其上级（如 单机游戏/手机游戏 -> 游戏），可显著减少创建的收藏夹数量；未识别的分区保持原样。
            </div>
            <div class="bili-classifier-option-group" style="margin-top:8px;border:1px solid #eee;padding:12px;border-radius:6px;">
                <div style="font-weight:600;margin-bottom:6px;display:flex;align-items:center;gap:8px;">缓存管理
                    <span class="bili-help-icon" data-tip="缓存说明：\n脚本会缓存已成功获取的视频分区/UP 信息以减少重复详情请求。\n以下情况建议清空缓存：\n1. 之前勾选“仅使用收藏列表信息”导致大量“未知分区”出现；\n2. B站视频分区结构有明显调整；\n3. 本地缓存疑似损坏或长时间未更新。\n清空只影响后续运行，不会改动已分类结果。">?</span>
                </div>
                <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
                    <button class="bili-classifier-btn secondary" id="btn-clear-cache" type="button">清空视频详情缓存</button>
                    <span id="cache-clear-status" style="font-size:12px;color:#666;"></span>
                </div>
            </div>
            <div class="bili-classifier-footer">
                <button class="bili-classifier-btn secondary" id="initial-cancel">取消</button>
                <button class="bili-classifier-btn" id="initial-confirm">开始读取</button>
            </div>
        `;
        document.body.appendChild(modal);

        return new Promise((resolve, reject) => {
            modal.querySelector('#initial-cancel').addEventListener('click', () => {
                modal.remove();
                reject(new Error('用户取消'));
            });

            // 绑定清空缓存按钮
            const clearBtn = modal.querySelector('#btn-clear-cache');
            const statusEl = modal.querySelector('#cache-clear-status');
            clearBtn?.addEventListener('click', () => {
                try {
                    videoCache.clear();
                    statusEl.textContent = '缓存已清空，下次需要详情时将重新获取。';
                    statusEl.style.color = '#00a1d6';
                } catch (e) {
                    statusEl.textContent = '清空失败：' + (e.message || e);
                    statusEl.style.color = '#ff4d4f';
                }
            });

            modal.querySelector('#initial-confirm').addEventListener('click', () => {
                const fetchSize = Number(modal.querySelector('#setting-fetch-size').value) || defaults.fetchPageSize;
                const infoConcurrency = Number(modal.querySelector('#setting-info-concurrency').value) || defaults.infoConcurrency;
                const operationBatch = Number(modal.querySelector('#setting-operation-batch').value) || defaults.operationBatchSize;
                const maxProcessCount = Number(modal.querySelector('#setting-max-process').value) || defaults.maxProcessCount || 500;
                const skipDetailFetch = Boolean(modal.querySelector('#setting-skip-detail')?.checked);
                const useMainZone = Boolean(modal.querySelector('#setting-use-main-zone')?.checked);

                const sanitized = {
                    fetchPageSize: Math.min(100, Math.max(1, fetchSize)),
                    infoConcurrency: Math.min(10, Math.max(1, infoConcurrency)),
                    operationBatchSize: Math.min(50, Math.max(1, operationBatch)),
                    maxProcessCount: Math.min(500, Math.max(1, maxProcessCount)),
                    skipDetailFetch,
                    useMainZone
                };

                state.settings = {
                    ...state.settings,
                    ...sanitized
                };
                state.selection.limit = sanitized.maxProcessCount;

                modal.remove();
                resolve(sanitized);
            });
        });
    }

    async function showPostFetchMenu({ videos, total, completed, sourceFid }) {
        const modal = document.createElement('div');
        modal.className = 'bili-classifier-container bili-classifier-modal';

        const limitDefault = Math.min(state.selection.limit || state.settings.maxProcessCount, state.settings.maxProcessCount, videos.length || state.settings.maxProcessCount);
        // 根据调试统计生成提醒
        const stats = state.data.readStats || { items: 0, tidKnown: 0, tnameKnown: 0 };
        const needDetailHint = state.settings.skipDetailFetch && stats.items > 0 && stats.tidKnown === 0 && stats.tnameKnown === 0;
        const hintHtml = needDetailHint ? `<div class="bili-classifier-message" style="color:#d46b08">检测到收藏列表未返回分区字段（tid/tname），若需按分区分类，请返回并取消勾选“仅使用收藏列表信息”。</div>` : '';

        modal.innerHTML = `
            <h3>读取完成 - 下一步操作</h3>
            <div class="bili-classifier-message">
                已获取 <span class="bili-highlight">${videos.length}</span> / ${total || videos.length} 个视频${completed ? '' : '（当前为部分列表，可继续分析剩余内容）'}。
            </div>
            ${hintHtml}

            <div class="bili-postfetch-section">
                <label>本次处理数量上限（1-500）
                    <input type="number" id="post-limit" class="bili-classifier-input" min="1" max="500" value="${limitDefault || Math.min(500, videos.length || 1)}">
                </label>
                <div class="bili-classifier-message">超出上限的部分请下次继续处理，避免一次性操作过多导致风控。</div>
            </div>

            <div class="bili-postfetch-section">
                <label class="bili-classifier-checkbox-label">
                    <input type="checkbox" id="post-range-enable">
                    启用自定义处理区间（仅在复制模式生效）
                </label>
                <div class="bili-range-inputs" id="post-range-inputs" style="display:none">
                    <input type="number" id="post-range-start" class="bili-classifier-input" min="1" max="${videos.length}" value="1" placeholder="起始序号">
                    <span>至</span>
                    <input type="number" id="post-range-end" class="bili-classifier-input" min="1" max="${videos.length}" value="${Math.min(videos.length, limitDefault || videos.length)}" placeholder="结束序号">
                </div>
                <div class="bili-classifier-message">选择区间后，仅对该区间内的视频进入后续导出与分类流程，适合分批复制处理。</div>
            </div>

            <div class="bili-postfetch-section">
                <div>备份当前收藏夹以防误操作：</div>
                <div class="bili-postfetch-actions">
                    <button class="bili-classifier-btn secondary" id="post-backup">一键备份当前收藏夹</button>
                </div>
                <div class="bili-classifier-message" id="post-backup-status"></div>
            </div>

            <div class="bili-postfetch-actions">
                <button class="bili-classifier-btn secondary" id="post-cancel">退出</button>
                <button class="bili-classifier-btn secondary" id="post-resume" ${completed ? 'style="display:none"' : ''}>继续分析剩余</button>
                <button class="bili-classifier-btn" id="post-confirm">前往下一步</button>
            </div>
        `;

        document.body.appendChild(modal);

        const rangeEnableEl = modal.querySelector('#post-range-enable');
        const rangeInputsEl = modal.querySelector('#post-range-inputs');
        rangeEnableEl.addEventListener('change', () => {
            rangeInputsEl.style.display = rangeEnableEl.checked ? 'flex' : 'none';
        });

        const backupBtn = modal.querySelector('#post-backup');
        const backupStatus = modal.querySelector('#post-backup-status');
        backupBtn.addEventListener('click', async () => {
            backupBtn.disabled = true;
            backupBtn.textContent = '备份中...';
            backupStatus.textContent = '';
            try {
                const result = await backupCurrentFolder(videos, sourceFid);
                backupStatus.textContent = `备份完成：已复制到「${result.name}」`;
            } catch (error) {
                backupStatus.textContent = `备份失败：${error.message}`;
            } finally {
                backupBtn.disabled = false;
                backupBtn.textContent = '一键备份当前收藏夹';
            }
        });

        return new Promise((resolve) => {
            modal.querySelector('#post-cancel').addEventListener('click', () => {
                modal.remove();
                resolve({ action: 'cancel' });
            });

            modal.querySelector('#post-resume')?.addEventListener('click', () => {
                modal.remove();
                resolve({ action: 'resume' });
            });

            modal.querySelector('#post-confirm').addEventListener('click', () => {
                const limitInput = Number(modal.querySelector('#post-limit').value) || limitDefault || 1;
                const limit = Math.min(500, Math.max(1, limitInput));

                let range = null;
                if (rangeEnableEl.checked) {
                    const start = Number(modal.querySelector('#post-range-start').value) || 1;
                    const end = Number(modal.querySelector('#post-range-end').value) || start;
                    if (start < 1 || start > videos.length || end < 1 || end > videos.length || start > end) {
                        alert('请输入有效的区间范围');
                        return;
                    }
                    range = {
                        start,
                        end
                    };
                }

                modal.remove();
                resolve({
                    action: 'proceed',
                    limit,
                    range
                });
            });
        });
    }

    // 创建配置界面
    function createConfigUI(datasetOptions) {
        const { copyVideos, moveVideos, rangeEnabled } = datasetOptions;
        let currentMode = 'copy';
        let autoClassifyUnassigned = true;
        // 允许在该界面切换“按主分区”选项
        const localUseMain = state.settings.useMainZone === true;

        const modal = document.createElement('div');
        modal.className = 'bili-classifier-container bili-classifier-modal';
        modal.innerHTML = `
            <h3>收藏夹自动分类</h3>

            <div class="bili-classifier-message">
                复制模式将处理 <span class="bili-highlight">${copyVideos.length}</span> 个视频${rangeEnabled ? '（已启用自定义区间）' : ''}；
                移动模式将处理 <span class="bili-highlight">${moveVideos.length}</span> 个视频。
            </div>

            <div class="bili-classifier-radio-group">
                <label class="bili-classifier-radio-label">
                    <input type="radio" name="operationMode" value="copy" checked> 复制模式
                </label>
                <label class="bili-classifier-radio-label">
                    <input type="radio" name="operationMode" value="move"> 移动模式
                </label>
            </div>

            <div class="bili-classifier-option-group">
                <label class="bili-classifier-checkbox-label">
                    <input type="checkbox" id="autoClassifyUnassigned" checked>
                    对未自定义分组的视频自动按分区分类
                </label>
                <label class="bili-classifier-checkbox-label">
                    <input type="checkbox" id="useMainZoneInUI" ${localUseMain ? 'checked' : ''}>
                    按主分区合并（如 单机/手游 -> 游戏）
                </label>
            </div>

            <div style="margin-bottom: 20px">
                <button class="bili-classifier-btn" id="addCustomGroup">添加自定义分组</button>
            </div>
            <div id="customGroups"></div>
            <div id="defaultGroups">
                <h4>视频分区分组</h4>
            </div>
            <div class="bili-classifier-footer">
                <button class="bili-classifier-btn secondary" id="cancelClassify">取消</button>
                <button class="bili-classifier-btn" id="startClassify">开始分类</button>
            </div>

            <div class="bili-classifier-links">
                <a href="https://space.bilibili.com/1937042029" target="_blank" class="bili-classifier-link-btn">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" fill="#666"/>
                        <path d="M12 6c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z" fill="#666"/>
                    </svg>
                    我的B站主页
                </a>
                <a href="https://github.com/jqwgt" target="_blank" class="bili-classifier-link-btn">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z" fill="#666"/>
                    </svg>
                    GitHub项目
                </a>
            </div>
        `;
        document.body.appendChild(modal);

        const customGroupsContainer = modal.querySelector('#customGroups');
        const defaultGroupsContainer = modal.querySelector('#defaultGroups');
        let existingFolders = [];

        function getCurrentVideos() {
            return currentMode === 'copy' ? copyVideos : moveVideos;
        }

        function refreshDefaultGroups() {
            const groups = groupVideosByTid(getCurrentVideos());
            defaultGroupsContainer.innerHTML = '<h4>视频分区分组</h4>' + (Object.entries(groups).length ? Object.entries(groups).map(([tid, videos]) => {
                const displayName = state.settings.useMainZone ? (videos[0]?.classTname || videos[0]?.tname) : (videos[0]?.tname);
                return `
                    <div class="bili-classifier-group tid-group" data-tid="${tid}">
                        <div class="bili-classifier-group-header">
                            <span>${displayName} (${videos.length}个视频)</span>
                        </div>
                    </div>
                `;
            }).join('') : '<div class="bili-classifier-message">暂无可用视频</div>');
        }

        function createCustomGroupElement() {
            const tidGroups = groupVideosByTid(getCurrentVideos());
            const tidOptions = Object.entries(tidGroups)
                .map(([tid, videos]) => {
                    const displayName = state.settings.useMainZone ? (videos[0]?.classTname || videos[0]?.tname) : (videos[0]?.tname);
                    return `
                    <label class="bili-classifier-checkbox-label">
                        <input type="checkbox" class="bili-classifier-checkbox" value="${tid}">
                        ${displayName} (${videos.length}个视频)
                    </label>
                `;}).join('') || '<div class="bili-classifier-message">当前模式下暂无可用分区</div>';

            const groupDiv = document.createElement('div');
            groupDiv.className = 'bili-classifier-group custom-group';
            groupDiv.innerHTML = `
                <div class="bili-classifier-group-header">
                    <input type="text" class="bili-classifier-input folder-name" placeholder="新收藏夹名称">
                    <button class="bili-classifier-btn secondary use-existing">使用现有收藏夹</button>
                    <button class="bili-classifier-btn danger remove-group">删除分组</button>
                </div>
                <div class="bili-classifier-checkbox-group tid-options">
                    ${tidOptions}
                </div>
            `;

            const useExistingBtn = groupDiv.querySelector('.use-existing');
            useExistingBtn.addEventListener('click', () => {
                const existedSelect = groupDiv.querySelector('select');
                if (existedSelect) { // 已经是下拉，避免重复替换
                    useExistingBtn.disabled = true;
                    return;
                }
                const input = groupDiv.querySelector('.folder-name');
                if (!input || !input.parentNode) return;
                const select = document.createElement('select');
                select.className = 'bili-classifier-select';
                select.innerHTML = `
                    <option value="">选择现有收藏夹</option>
                    ${existingFolders.map(f => `<option value="${f.id}">${f.title}</option>`).join('')}
                `;
                input.parentNode.replaceChild(select, input);
                useExistingBtn.disabled = true;
            });

            groupDiv.querySelector('.remove-group').addEventListener('click', () => {
                groupDiv.remove();
            });

            customGroupsContainer.appendChild(groupDiv);
        }

        modal.querySelector('#addCustomGroup').addEventListener('click', () => {
            createCustomGroupElement();
        });

        modal.querySelectorAll('input[name="operationMode"]').forEach(radio => {
            radio.addEventListener('change', function() {
                currentMode = this.value;
                customGroupsContainer.innerHTML = '';
                refreshDefaultGroups();
            });
        });

        modal.querySelector('#autoClassifyUnassigned').addEventListener('change', function() {
            autoClassifyUnassigned = this.checked;
        });

        // 在分类界面实时切换主分区合并
        modal.querySelector('#useMainZoneInUI').addEventListener('change', function() {
            state.settings.useMainZone = this.checked;
            // 重新分配分类字段，以便刷新展示
            assignClassificationFields(copyVideos);
            assignClassificationFields(moveVideos);
            customGroupsContainer.innerHTML = '';
            refreshDefaultGroups();
        });

        refreshDefaultGroups();

        getUserFavLists().then(folders => {
            existingFolders = folders;
        });

        return new Promise((resolve, reject) => {
            modal.querySelector('#startClassify').addEventListener('click', () => {
                const tidGroups = groupVideosByTid(getCurrentVideos());
                const config = {
                    custom: [],
                    default: {},
                    operationMode: currentMode,
                    autoClassifyUnassigned
                };

                customGroupsContainer.querySelectorAll('.custom-group').forEach(group => {
                    const nameInput = group.querySelector('.folder-name, select');
                    const groupName = nameInput.tagName === 'SELECT'
                        ? nameInput.options[nameInput.selectedIndex]?.textContent || ''
                        : nameInput.value;
                    const selectedTids = Array.from(group.querySelectorAll('input[type="checkbox"]:checked'))
                        .map(cb => cb.value);

                    if (selectedTids.length > 0 && groupName) {
                        config.custom.push({
                            name: groupName,
                            isExisting: nameInput.tagName === 'SELECT',
                            fid: nameInput.tagName === 'SELECT' ? nameInput.value : null,
                            tids: selectedTids
                        });
                    }
                });

                if (autoClassifyUnassigned) {
                    Object.keys(tidGroups).forEach(tid => {
                        if (!config.custom.some(g => g.tids.includes(tid))) {
                            const video = tidGroups[tid][0];
                            const name = state.settings.useMainZone ? (video?.classTname || video?.tname) : (video?.tname);
                            config.default[tid] = name || `分区-${tid}`;
                        }
                    });
                }

                modal.remove();
                resolve({ config, activeVideos: getCurrentVideos(), tidGroups });
            });

            modal.querySelector('#cancelClassify').addEventListener('click', () => {
                modal.remove();
                reject('用户取消操作');
            });
        });
    }

    function showExportUI(videos, meta = {}) {
        const modal = document.createElement('div');
        modal.className = 'bili-classifier-container bili-classifier-modal';

        const useMain = state.settings.useMainZone;
        const partitions = new Map();
        videos.forEach(video => {
            const name = useMain ? (video.classTname || video.tname) : (video.tname);
            const idKey = useMain ? (video.classTid || video.tid || 'unknown') : (video.tid || 'unknown');
            const key = `${idKey}|${name || '未知'}`;
            const count = partitions.get(key) || 0;
            partitions.set(key, count + 1);
        });

        const summaryChips = Array.from(partitions.entries()).slice(0, 12).map(([key, count]) => {
            const [, tname] = key.split('|');
            return `<span class="bili-chip">${tname || '未知分区'} × ${count}</span>`;
        }).join('');

        const rangeMessage = meta.rangeApplied ? '（已应用自定义区间）' : '';
        const limitMessage = meta.limit ? `（本次处理上限 ${meta.limit} 个）` : '';
        const totalMessage = meta.total ? `，总数 ${meta.total}` : '';

        modal.innerHTML = `
            <h3>数据预览与导出</h3>
            <div class="bili-classifier-message">本次将处理 <span class="bili-highlight">${videos.length}</span> 个视频${rangeMessage}${limitMessage}${totalMessage}。下方表格展示前100条数据，可导出全部明细。</div>
            <div class="bili-chip-list">${summaryChips}</div>
            <div class="bili-classifier-table-wrapper">
                <table class="bili-classifier-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>标题</th>
                            <th>分区</th>
                            <th>UP主</th>
                            <th>BV号</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${videos.slice(0, 100).map((video, index) => `
                            <tr>
                                <td>${index + 1}</td>
                                <td>${sanitizeHTML(video.title)}</td>
                                <td>${sanitizeHTML((useMain ? (video.classTname || video.tname) : video.tname) || '未知')}</td>
                                <td>${sanitizeHTML(video.upName || '未知')}</td>
                                <td>${video.bvid || video.aid}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <div class="bili-export-actions">
                <button class="bili-classifier-btn secondary" id="export-copy">复制到剪贴板</button>
                <button class="bili-classifier-btn" id="export-download">下载CSV</button>
            </div>
            <div class="bili-classifier-footer">
                <button class="bili-classifier-btn secondary" id="export-cancel">结束</button>
                <button class="bili-classifier-btn" id="export-continue">继续分类</button>
            </div>
        `;

        document.body.appendChild(modal);

        const dataText = buildExportText(videos);
        const csvText = buildCSVText(videos);

        modal.querySelector('#export-copy').addEventListener('click', async () => {
            const ok = await copyText(dataText);
            alert(ok ? '已复制到剪贴板，可直接粘贴。' : '复制失败，请手动复制。');
        });

        modal.querySelector('#export-download').addEventListener('click', () => {
            downloadTextFile(`bilibili-fav-${Date.now()}.csv`, csvText, 'text/csv;charset=utf-8;');
        });

        return new Promise((resolve, reject) => {
            modal.querySelector('#export-continue').addEventListener('click', () => {
                modal.remove();
                resolve(true);
            });
            modal.querySelector('#export-cancel').addEventListener('click', () => {
                modal.remove();
                resolve(false);
            });
        });
    }

    function sanitizeHTML(str) {
        if (!str) return '';
        return str.replace(/[&<>"']/g, ch => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[ch]));
    }

    function buildExportText(videos) {
        const useMain = state.settings.useMainZone;
        const lines = videos.map(video => {
            const zoneName = useMain ? (video.classTname || video.tname) : video.tname;
            return [`标题：${video.title}`, `分区：${zoneName || '未知'}`, `UP主：${video.upName || '未知'}`, `BV号：${video.bvid || video.aid}`].join(' | ');
        });
        return lines.join('\n');
    }

    function buildCSVText(videos) {
        const useMain = state.settings.useMainZone;
        const header = ['标题', '分区', 'UP主', 'BV号'];
        const lines = videos.map(video => {
            const zoneName = useMain ? (video.classTname || video.tname) : video.tname;
            return [video.title, zoneName || '未知', video.upName || '未知', video.bvid || video.aid].map(escapeCSV).join(',');
        });
        return [header.map(escapeCSV).join(','), ...lines].join('\r\n');
    }

    function escapeCSV(value) {
        if (value == null) return '';
        const str = String(value).replace(/"/g, '""');
        if (/[",\n]/.test(str)) {
            return `"${str}"`;
        }
        return str;
    }

    async function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch (error) {
                log(`剪贴板写入失败：${error.message}`, 'error');
            }
        }

        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        try {
            const ok = document.execCommand('copy');
            return ok;
        } catch (error) {
            return false;
        } finally {
            document.body.removeChild(textarea);
        }
    }

    function downloadTextFile(filename, content, mime = 'text/plain;charset=utf-8;') {
        if (typeof GM_download === 'function') {
            try {
                const blobUrl = URL.createObjectURL(new Blob([content], { type: mime }));
                GM_download({
                    url: blobUrl,
                    name: filename,
                    saveAs: true,
                    ontimeout: () => log('下载超时', 'error'),
                    onerror: err => log(`下载失败：${err?.error || err}`, 'error'),
                    onload: () => URL.revokeObjectURL(blobUrl)
                });
                return;
            } catch (error) {
                log(`GM_download 调用失败：${error.message}`, 'error');
            }
        }

        try {
            const blob = new Blob([content], { type: mime });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            log(`浏览器下载失败：${error.message}`, 'error');
            alert('下载功能暂不可用，请使用复制按钮导出数据。');
        }
    }

    function applySelection(videos, { limit, range }) {
        const total = videos.length;
        const limitCount = Math.min(limit || state.settings.maxProcessCount, state.settings.maxProcessCount, total);
        const limitSubset = videos.slice(0, limitCount);
        let selectedSubset = limitSubset;

        if (range) {
            const startIndex = Math.max(0, range.start - 1);
            const endIndex = Math.min(total, range.end);
            selectedSubset = videos.slice(startIndex, endIndex).slice(0, limitCount);
        }

        return {
            limitSubset,
            selectedSubset,
            rangeApplied: Boolean(range)
        };
    }

    function uniqueByAid(videos) {
        const map = new Map();
        videos.forEach(video => {
            if (video && !map.has(video.aid)) {
                map.set(video.aid, video);
            }
        });
        return Array.from(map.values());
    }

    async function backupCurrentFolder(videos, sourceFid) {
        if (!videos.length) throw new Error('当前没有可备份的视频');
        const folders = await getUserFavLists(true);
        const current = folders.find(f => `${f.id}` === `${sourceFid}`);
        const baseName = current?.title || `收藏夹_${sourceFid}`;
        const backupName = await ensureUniqueBackupName(baseName, folders);
        const backupFid = await createFolder(backupName);

        const aids = videos.map(video => video.aid).filter(Boolean);
        const batches = chunkArray(aids, state.settings.operationBatchSize || 10);
        for (const batch of batches) {
            await addVideosBatch(batch, backupFid);
            await sleep(120);
        }

        return { id: backupFid, name: backupName };
    }

    async function ensureUniqueBackupName(baseName, folders) {
        const existing = new Set((folders || []).map(f => f.title));
        if (!existing.has(`${baseName}_1`) && !existing.has(baseName)) {
            return `${baseName}_1`;
        }
        let counter = 1;
        let name;
        do {
            counter += 1;
            name = `${baseName}_${counter}`;
        } while (existing.has(name));
        return name;
    }

    function groupVideosByTid(videos) {
        const groups = {};
        videos.forEach(video => {
            if (!video || video.error || !video.aid) return; // 跳过失效/无效视频
            // 使用分类字段（可能是主分区）
            const tidKey = video.classTid || video.tid || 'unknown';
            if (!groups[tidKey]) {
                groups[tidKey] = [];
            }
            groups[tidKey].push(video);
        });
        return groups;
    }

    async function ensureUniqueFolderName(baseName) {
        let name = baseName?.trim() || '未命名分区';
        const folders = await getUserFavLists();
        let counter = 1;
        while (folders.some(folder => folder.title === name)) {
            name = `${baseName}_${counter++}`;
        }
        return name;
    }

    function selectVideosFromTidGroup(tidGroups, tids) {
        const selected = [];
        tids.forEach(tid => {
            if (tidGroups[tid]) {
                selected.push(...tidGroups[tid]);
            }
        });
        return selected;
    }

    async function ensureTargetFolder(groupConfig) {
        if (groupConfig.isExisting && groupConfig.fid) {
            return groupConfig.fid;
        }
        const uniqueName = await ensureUniqueFolderName(groupConfig.name);
        return await createFolder(uniqueName);
    }

    async function ensureDefaultFolder(tid, folderName) {
        const desiredName = folderName || '未命名分区';
        const uniqueName = await ensureUniqueFolderName(desiredName);
        return await createFolder(uniqueName);
    }

    async function runClassificationWorkflow({ tidGroups, userConfig, sourceFid, videos }) {
        resetController('processing');
        removeProgressUI('processing');
        const controller = getController('processing');

        const operations = [];
        const handledTids = new Set();

        for (const group of userConfig.custom) {
            const targetFid = await ensureTargetFolder(group);
            let selectedVideos = selectVideosFromTidGroup(tidGroups, group.tids).filter(v => !v.error && v.aid);
            // 按 aid 去重
            const seen = new Set();
            selectedVideos = selectedVideos.filter(v => (seen.has(v.aid) ? false : (seen.add(v.aid), true)));
            if (!selectedVideos.length) continue;
            group.tids.forEach(tid => handledTids.add(tid));
            operations.push({
                name: group.name || `自定义分组 ${targetFid}`,
                fid: targetFid,
                videos: selectedVideos,
                mode: userConfig.operationMode
            });
        }

        if (userConfig.autoClassifyUnassigned) {
            for (const [tid, videosOfTidRaw] of Object.entries(tidGroups)) {
                if (handledTids.has(tid)) continue;
                let videosOfTid = (videosOfTidRaw || []).filter(v => !v.error && v.aid);
                if (!videosOfTid.length) continue;
                const targetFid = await ensureDefaultFolder(tid, userConfig.default[tid] || videosOfTid[0].classTname || videosOfTid[0].tname || `分区-${tid}`);
                operations.push({
                    name: userConfig.default[tid] || videosOfTid[0].classTname || videosOfTid[0].tname || `分区-${tid}`,
                    fid: targetFid,
                    videos: videosOfTid,
                    mode: userConfig.operationMode
                });
            }
        }

        if (!operations.length) {
            alert('没有找到需要处理的视频分组。');
            return;
        }

        const totalTasks = operations.reduce((sum, op) => sum + op.videos.length, 0);
        let completed = 0;
        let skipped = 0;

        updateProgressUI('processing', {
            message: '准备执行分类操作',
            current: 0,
            total: totalTasks,
            extra: `共 ${operations.length} 个目标收藏夹`
        });

        for (const operation of operations) {
            const batches = chunkArray(operation.videos, state.settings.operationBatchSize);
            for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
                await waitIfPaused(controller);
                const batch = batches[batchIndex];
                const aids = batch.map(video => video.aid).filter(Boolean);
                if (!aids.length) continue;
                try {
                    await adaptiveCopyOrMove({
                        mode: operation.mode === 'move' ? 'move' : 'copy',
                        srcFid: sourceFid,
                        tarFid: operation.fid,
                        aids
                    });
                } catch (error) {
                    log(`批量操作失败：${error.message}，尝试改为单个处理`, 'error');
                    for (const aid of aids) {
                        try {
                            await adaptiveCopyOrMove({ mode: operation.mode === 'move' ? 'move' : 'copy', srcFid: sourceFid, tarFid: operation.fid, aids: [aid] });
                        } catch (err) {
                            skipped += 1;
                            log(`处理视频 ${aid} 失败：${err.message}`, 'error');
                        }
                        await waitIfPaused(controller);
                        completed += 1;
                        updateProgressUI('processing', {
                            message: `正在处理分组「${operation.name}」`,
                            current: completed,
                            total: totalTasks,
                            extra: skipped ? `已跳过 ${skipped} 个视频` : ''
                        });
                    }
                    continue;
                }

                completed += batch.length;
                updateProgressUI('processing', {
                    message: `正在处理分组「${operation.name}」`,
                    current: completed,
                    total: totalTasks,
                    extra: skipped ? `已跳过 ${skipped} 个视频` : ''
                });
                await waitIfPaused(controller);
            }
        }

        log(`分类完成，成功处理 ${completed} 个视频，跳过 ${skipped} 个视频`, 'success');
    }

    // 构建 resources 字符串："aid:2,aid2:2"
    function buildResourcesString(aids) {
        const uniq = Array.from(new Set((aids || []).filter(Boolean)));
        return uniq.map(aid => `${aid}:2`).join(',');
    }

    function getCurrentMid() {
        const seg = (location.pathname || '').split('/').filter(Boolean);
        // 形如 /123456/favlist
        const mid = seg.length > 0 ? seg[0] : '';
        return mid || '';
    }

    async function copyResources({ srcFid, tarFid, aids }) {
        const params = new URLSearchParams();
        params.set('src_media_id', srcFid);
        params.set('tar_media_id', tarFid);
        params.set('mid', getCurrentMid());
        params.set('resources', buildResourcesString(aids));
        params.set('platform', 'web');
        params.set('csrf', getCsrf());
        return retryOperation(() => new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://api.bilibili.com/x/v3/fav/resource/copy',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                data: params.toString(),
                responseType: 'json',
                onload: (response) => {
                    const res = response?.response;
                    if (res?.code === 0) return resolve(res.data);
                    reject(new Error(res?.message || '批量复制失败'));
                },
                onerror: err => reject(err instanceof Error ? err : new Error('网络错误'))
            })
        }), { retries: 2, minDelay: 300, maxDelay: 1200 });
    }

    async function moveResources({ srcFid, tarFid, aids }) {
        const params = new URLSearchParams();
        params.set('src_media_id', srcFid);
        params.set('tar_media_id', tarFid);
        params.set('mid', getCurrentMid());
        params.set('resources', buildResourcesString(aids));
        params.set('platform', 'web');
        params.set('csrf', getCsrf());
        return retryOperation(() => new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://api.bilibili.com/x/v3/fav/resource/move',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                data: params.toString(),
                responseType: 'json',
                onload: (response) => {
                    const res = response?.response;
                    if (res?.code === 0) return resolve(res.data);
                    reject(new Error(res?.message || '批量移动失败'));
                },
                onerror: err => reject(err instanceof Error ? err : new Error('网络错误'))
            })
        }), { retries: 2, minDelay: 300, maxDelay: 1200 });
    }

    // 自适应复制/移动：整批→二分→单条
    async function adaptiveCopyOrMove({ mode, srcFid, tarFid, aids }) {
        const uniq = Array.from(new Set((aids || []).filter(Boolean)));
        if (!uniq.length) return;
        try {
            if (mode === 'copy') {
                await copyResources({ srcFid, tarFid, aids: uniq });
            } else {
                await moveResources({ srcFid, tarFid, aids: uniq });
            }
            await randomSleep(120, 260);
        } catch (e) {
            if (uniq.length > 3) {
                const mid = Math.floor(uniq.length / 2);
                await adaptiveCopyOrMove({ mode, srcFid, tarFid, aids: uniq.slice(0, mid) });
                await adaptiveCopyOrMove({ mode, srcFid, tarFid, aids: uniq.slice(mid) });
                return;
            }
            // 单条降级
            for (const aid of uniq) {
                try {
                    if (mode === 'copy') await copyResources({ srcFid, tarFid, aids: [aid] });
                    else await moveResources({ srcFid, tarFid, aids: [aid] });
                    await randomSleep(80, 160);
                } catch (err) {
                    log(`单条${mode === 'copy' ? '复制' : '移动'}失败 ${aid}：${err.message}`, 'error');
                }
            }
        }
    }

    async function batchResourceDeal({ addFid, delFid, aids }) {
        if (!aids || !aids.length) return;
        const params = new URLSearchParams();
        params.set('csrf', getCsrf());
        params.set('type', '2');
        params.set('rid', aids.join(','));
        if (addFid) params.set('add_media_ids', addFid);
        if (delFid) params.set('del_media_ids', delFid);
        // 使用重试逻辑，遇到临时失败会自动重试
        return retryOperation(async () => {
            return await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: 'https://api.bilibili.com/x/v3/fav/resource/batch-deal',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    data: params.toString(),
                    responseType: 'json',
                    onload: function(response) {
                        if (!response) {
                            reject(new Error('批量接口无响应'));
                            return;
                        }
                        if (response.status && response.status !== 200) {
                            reject(new Error(`批量接口返回状态 ${response.status}`));
                            return;
                        }
                        const res = response?.response;
                        if (res?.code === 0) {
                            resolve(res.data);
                        } else {
                            reject(new Error(res?.message || '批量操作失败'));
                        }
                    },
                    onerror: error => reject(error instanceof Error ? error : new Error('网络错误'))
                });
            });
        }, { retries: 2, minDelay: 300, maxDelay: 1200 });
    }

    // 自适应批量提交：优先整批；失败则二分拆分；小批仍失败则逐个执行
    async function adaptiveBatchDeal({ aids, addFid, delFid, minBatchSize = 3 }) {
        if (!aids || !aids.length) return;
        // 过滤空/重复
        const uniq = Array.from(new Set(aids.filter(Boolean)));
        if (!uniq.length) return;
        try {
            await batchResourceDeal({ addFid, delFid, aids: uniq });
            await randomSleep(120, 260); // 批间抖动，降低风控
            return;
        } catch (e) {
            if (uniq.length > minBatchSize) {
                const mid = Math.floor(uniq.length / 2);
                const left = uniq.slice(0, mid);
                const right = uniq.slice(mid);
                await adaptiveBatchDeal({ aids: left, addFid, delFid, minBatchSize });
                await adaptiveBatchDeal({ aids: right, addFid, delFid, minBatchSize });
                return;
            }
            // 逐个降级（并发受限）
            const concurrency = Math.min(state.settings.infoConcurrency, 4);
            await runWithConcurrency(uniq, concurrency, async aid => {
                if (addFid) await addToFav(aid, addFid);
                if (delFid) await removeFromFav(aid, delFid);
                await randomSleep(80, 160);
            });
        }
    }

    // 创建读取视频进度显示
    // 旧进度函数已被统一的 updateProgressUI 替代

    // 主处理流程
    async function processClassify() {
        try {
            const sourceFid = new URL(location.href).searchParams.get('fid');
            if (!sourceFid) throw new Error('未找到收藏夹ID');
            state.sourceFid = sourceFid;

            await openInitialSettings(state.settings);
            await getUserFavLists(true);

            log('开始获取收藏夹视频...');
            let fetchResult = await getFavVideos(sourceFid, state.settings.fetchPageSize);
            if (!fetchResult.videos.length) throw new Error('未找到任何视频');

            let selectionResult;
            while (true) {
                selectionResult = await showPostFetchMenu({
                    videos: fetchResult.videos,
                    total: fetchResult.total,
                    completed: fetchResult.completed,
                    sourceFid
                });

                if (selectionResult.action === 'cancel') {
                    log('用户在读取完成后退出流程');
                    return;
                }

                if (selectionResult.action === 'resume') {
                    log('继续分析剩余内容...');
                    fetchResult = await getFavVideos(sourceFid, state.settings.fetchPageSize);
                    if (!fetchResult.videos.length) throw new Error('未找到任何视频');
                    continue;
                }

                break;
            }

            const selection = applySelection(fetchResult.videos, { limit: selectionResult.limit, range: selectionResult.range });
            state.selection.limit = selectionResult.limit;
            state.selection.range = selectionResult.range || null;

            const limitSubset = selection.limitSubset;
            const selectedSubset = selection.selectedSubset;

            if (!selectedSubset.length) {
                throw new Error('选择的范围内没有视频');
            }

            let proceed = false;
            if (!state.settings.skipDetailFetch) {
                // 不跳过详情：先拉详情，再预览（预览里展示完整分区信息）
                const detailCandidates = uniqueByAid(state.selection.range ? selectedSubset : limitSubset);
                log('开始获取视频详情以完善预览...', 'info');
                await enrichVideoDetails(detailCandidates);
                assignClassificationFields(detailCandidates);
                assignClassificationFields(selectedSubset);
                assignClassificationFields(limitSubset);

                proceed = await showExportUI(selectedSubset, {
                    total: fetchResult.total,
                    rangeApplied: selection.rangeApplied,
                    limit: selectionResult.limit
                });
                if (!proceed) {
                    log('用户在导出界面结束流程');
                    return;
                }
            } else {
                // 跳过详情：保持原先的“读取后立即预览”路径
                assignClassificationFields(selectedSubset);
                assignClassificationFields(limitSubset);
                proceed = await showExportUI(selectedSubset, {
                    total: fetchResult.total,
                    rangeApplied: selection.rangeApplied,
                    limit: selectionResult.limit
                });
                if (!proceed) {
                    log('用户在导出界面结束流程');
                    return;
                }
                log('已开启“仅使用收藏列表信息”，本次不拉取详情。若需分区结果，请返回重新开始并关闭该选项。', 'info');
            }

            // 过滤失效视频，避免进入操作阶段
            const filteredSelected = selectedSubset.filter(v => !v.error && v.aid);
            const filteredLimit = limitSubset.filter(v => !v.error && v.aid);
            const removedCount = (selectedSubset.length - filteredSelected.length) + (limitSubset.length - filteredLimit.length);
            if (removedCount > 0) {
                log(`检测到 ${removedCount} 条失效视频，已从后续处理列表中移除。`, 'error');
            }

            const { config: userConfig, activeVideos, tidGroups } = await createConfigUI({
                copyVideos: selection.rangeApplied ? filteredSelected : filteredLimit,
                moveVideos: filteredLimit,
                rangeEnabled: selection.rangeApplied
            });

            let videosForProcessing = activeVideos;
            if (userConfig.operationMode === 'move' && selection.rangeApplied) {
                alert('已切换到移动模式，本次将处理按顺序筛选的前 ' + limitSubset.length + ' 个视频。');
                videosForProcessing = limitSubset;
            }

            await runClassificationWorkflow({
                tidGroups,
                userConfig,
                sourceFid,
                videos: videosForProcessing
            });

            removeProgressUI('processing');
            alert('分类完成！可刷新页面检查结果。');
        } catch (error) {
            removeProgressUI('processing');
            removeProgressUI('reading');
            log(error.message || error, 'error');
            alert('操作失败：' + (error.message || error));
        }
    }

    // 添加触发按钮和链接
    function addButton() {
        const btnContainer = document.createElement('div');
        btnContainer.className = 'bili-classifier-float-btn';

        const btn = document.createElement('button');
        btn.className = 'bili-classifier-btn';
        btn.textContent = '按分区分类';
        btn.onclick = processClassify;

        const links = document.createElement('div');
        links.className = 'bili-classifier-links';
        links.innerHTML = `
            <a href="https://space.bilibili.com/1937042029" target="_blank" class="bili-classifier-link-btn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" fill="#666"/>
                    <path d="M12 6c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z" fill="#666"/>
                </svg>
                我的B站
            </a>
            <a href="https://github.com/jqwgt" target="_blank" class="bili-classifier-link-btn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z" fill="#666"/>
                </svg>
                GitHub
            </a>
        `;

        btnContainer.appendChild(btn);
        btnContainer.appendChild(links);
        document.body.appendChild(btnContainer);
    }

    // 初始化
    addButton();
})();