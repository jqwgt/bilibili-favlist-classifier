// ==UserScript==
// @name         Bilibili收藏夹自动分类
// @namespace    http://tampermonkey.net/
// @version      1.5
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
            fetchPageSize: 50,
            infoConcurrency: 6,
            operationBatchSize: 12
        },
        controllers: {
            reading: createPauseController(),
            processing: createPauseController()
        },
        cache: {
            favFolders: []
        },
        lastVideos: [],
        sourceFid: null
    };

    function createPauseController() {
        return {
            paused: false,
            waiters: []
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
                <div class="bili-classifier-message"></div>
            `;
            document.body.appendChild(container);
            bindPauseResume(type, container);
        }
        syncPauseButtons(type);
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
        });

        resumeBtn.addEventListener('click', () => {
            const controller = getController(type);
            setPaused(controller, false);
            resumeBtn.style.display = 'none';
            pauseBtn.style.display = '';
        });

        container.dataset.bindPause = '1';
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
        } else {
            pauseBtn.style.display = '';
            resumeBtn.style.display = 'none';
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
    `);

    // 获取CSRF令牌
    function getCsrf() {
        return document.cookie.match(/bili_jct=([^;]+)/)?.[1] || '';
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

    // 获取视频详细信息
    // 获取视频详细信息 增加跳过异常
    async function getVideoInfo(aid) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://api.bilibili.com/x/web-interface/view?aid=${aid}`,
                responseType: 'json',
                onload: function(response) {
                    if (!response.response.data) {
                        log(`视频 ${aid} 可能已失效或无法访问，跳过处理`, 'error');
                        reject(new Error(`视频 ${aid} 可能已失效或无法访问`));
                        return;
                    }
                    const data = response.response.data;
                    log(`获取视频 ${aid} 详细信息:`, 'info');
                    console.table({
                        标题: data.title,
                        分区ID: data.tid,
                        分区名: data.tname,
                        播放量: data.stat.view,
                    });
                    resolve(data);
                },
                onerror: function(error) {
                    log(`视频 ${aid} 信息获取失败，跳过处理`, 'error');
                    reject(error);
                }
            });
        });
    }

    // 获取收藏夹中的视频
    async function getFavVideos(mediaId, pageSize = state.settings.fetchPageSize) {
        resetController('reading');
        removeProgressUI('reading');
        state.lastVideos = [];
        const controller = getController('reading');

        let pn = 1;
        let totalCount = 0;
        let hasMore = true;
        const videos = [];
        const detailTargets = [];

        while (hasMore) {
            await waitIfPaused(controller);
            const pageData = await fetchFavPage(mediaId, pn, pageSize);
            const medias = pageData?.medias || [];
            if (!medias.length && !pageData?.has_more) break;

            if (!totalCount) {
                totalCount = pageData?.info?.media_count || pageData?.page?.count || pageData?.total_count || pageData?.total || medias.length;
            }

            medias.forEach(media => {
                const baseInfo = {
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
                };
                videos.push(baseInfo);
                if (!baseInfo.tid || !baseInfo.tname || !baseInfo.upName) {
                    detailTargets.push(baseInfo);
                }
            });

            hasMore = Boolean(pageData?.has_more);
            updateProgressUI('reading', {
                message: `正在读取收藏夹内容（第 ${pn} 页）`,
                current: videos.length,
                total: totalCount || videos.length,
                extra: hasMore ? `预计剩余 ${Math.max(totalCount - videos.length, 0)} 个` : '基础数据读取完成，准备获取详情'
            });
            pn += 1;
        }

        if (detailTargets.length) {
            let completed = 0;
            updateProgressUI('reading', {
                message: '正在补充视频详细信息',
                current: 0,
                total: detailTargets.length,
                extra: `约 ${detailTargets.length} 个视频需要补充`
            });

            await runWithConcurrency(detailTargets, state.settings.infoConcurrency, async (video) => {
                await waitIfPaused(controller);
                try {
                    const info = await getVideoInfo(video.aid);
                    video.tid = info.tid;
                    video.tname = info.tname;
                    video.upName = info.owner?.name || video.upName || '';
                    video.upMid = info.owner?.mid || video.upMid || '';
                    video.bvid = info.bvid || video.bvid;
                    video.duration = info.duration;
                    video.pubdate = info.pubdate;
                    video.stat = info.stat;
                } catch (error) {
                    video.error = error.message;
                } finally {
                    completed += 1;
                    updateProgressUI('reading', {
                        message: '正在补充视频详细信息',
                        current: completed,
                        total: detailTargets.length,
                        extra: `已完成 ${completed}/${detailTargets.length}`
                    });
                }
            });
        }

        removeProgressUI('reading');
        state.lastVideos = videos;
        return { videos, total: totalCount || videos.length };
    }

    function fetchFavPage(mediaId, pn, ps) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://api.bilibili.com/x/v3/fav/resource/list?media_id=${mediaId}&pn=${pn}&ps=${ps}&order=mtime&type=0&platform=web`,
                responseType: 'json',
                onload: function(response) {
                    if (response.status !== 200) {
                        reject(new Error(`获取收藏夹第 ${pn} 页失败，状态码 ${response.status}`));
                        return;
                    }
                    const data = response.response?.data;
                    if (!data) {
                        reject(new Error('收藏夹数据为空，请稍后重试'));
                        return;
                    }
                    resolve(data);
                },
                onerror: function(error) {
                    reject(error);
                }
            });
        });
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
                    const fid = response.response?.data?.id;
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
                    resolve(response.response);
                },
                onerror: reject
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
                    resolve(response.response);
                },
                onerror: reject
            });
        });
    }

    // 创建配置界面
    function openInitialSettings(defaults) {
        const modal = document.createElement('div');
        modal.className = 'bili-classifier-container bili-classifier-modal';
        modal.innerHTML = `
            <h3>开始前的设置</h3>
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
            <div class="bili-classifier-message">
                可以根据自身网络情况调整数值。批次越大速度越快，但也更容易触发B站风控。
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
            modal.querySelector('#initial-confirm').addEventListener('click', () => {
                const fetchSize = Number(modal.querySelector('#setting-fetch-size').value) || defaults.fetchPageSize;
                const infoConcurrency = Number(modal.querySelector('#setting-info-concurrency').value) || defaults.infoConcurrency;
                const operationBatch = Number(modal.querySelector('#setting-operation-batch').value) || defaults.operationBatchSize;

                const sanitized = {
                    fetchPageSize: Math.min(100, Math.max(1, fetchSize)),
                    infoConcurrency: Math.min(10, Math.max(1, infoConcurrency)),
                    operationBatchSize: Math.min(50, Math.max(1, operationBatch))
                };

                state.settings = {
                    ...state.settings,
                    ...sanitized
                };

                modal.remove();
                resolve(sanitized);
            });
        });
    }

    // 创建配置界面
    function createConfigUI(tidGroups) {
        const modal = document.createElement('div');
        modal.className = 'bili-classifier-container bili-classifier-modal';

        let html = `
            <h3>收藏夹自动分类</h3>

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
            </div>

            <div style="margin-bottom: 20px">
                <button class="bili-classifier-btn" id="addCustomGroup">添加自定义分组</button>
            </div>
            <div id="customGroups"></div>
            <div id="defaultGroups">
                <h4>视频分区分组</h4>
        `;

        Object.entries(tidGroups).forEach(([tid, videos]) => {
            const displayName = videos[0]?.tname || '未知分区';
            html += `
                <div class="bili-classifier-group tid-group" data-tid="${tid}">
                    <div class="bili-classifier-group-header">
                        <span>${displayName} (${videos.length}个视频)</span>
                    </div>
                </div>
            `;
        });

        html += `
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

        modal.innerHTML = html;
        document.body.appendChild(modal);

        let existingFolders = [];
        let customGroups = [];
        let operationMode = 'copy'; // 默认复制模式
        let autoClassifyUnassigned = true; // 默认自动分类未分组视频

        // 获取操作模式
        modal.querySelectorAll('input[name="operationMode"]').forEach(radio => {
            radio.addEventListener('change', function() {
                operationMode = this.value;
            });
        });

        // 获取自动分类选项
        modal.querySelector('#autoClassifyUnassigned').addEventListener('change', function() {
            autoClassifyUnassigned = this.checked;
        });

        // 获取现有收藏夹
        getUserFavLists().then(folders => {
            existingFolders = folders;
        });

        // 添加自定义分组的处理
        document.getElementById('addCustomGroup').onclick = async () => {
            const groupDiv = document.createElement('div');
            groupDiv.className = 'bili-classifier-group custom-group';

            const tidOptions = Object.entries(tidGroups)
                .map(([tid, videos]) => {
                    const displayName = videos[0]?.tname || '未知分区';
                    return `
                    <label class="bili-classifier-checkbox-label">
                        <input type="checkbox" class="bili-classifier-checkbox" value="${tid}">
                        ${displayName} (${videos.length}个视频)
                    </label>
                `;}).join('');

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

            document.getElementById('customGroups').appendChild(groupDiv);

            // 使用现有收藏夹按钮处理
            groupDiv.querySelector('.use-existing').onclick = () => {
                const select = document.createElement('select');
                select.className = 'bili-classifier-select';
                select.innerHTML = `
                    <option value="">选择现有收藏夹</option>
                    ${existingFolders.map(f => `<option value="${f.id}">${f.title}</option>`).join('')}
                `;
                const input = groupDiv.querySelector('.folder-name');
                input.parentNode.replaceChild(select, input);
            };

            // 删除分组按钮处理
            groupDiv.querySelector('.remove-group').onclick = () => {
                groupDiv.remove();
            };
        };

        return new Promise((resolve, reject) => {
            document.getElementById('startClassify').onclick = () => {
                const config = {
                    custom: [],
                    default: {},
                    operationMode: operationMode,
                    autoClassifyUnassigned: autoClassifyUnassigned
                };

                // 收集自定义分组配置
                document.querySelectorAll('.custom-group').forEach(group => {
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

                // 收集默认分组配置（仅在用户选择自动分类时）
                if (autoClassifyUnassigned) {
                    Object.keys(tidGroups).forEach(tid => {
                        if (!config.custom.some(g => g.tids.includes(tid))) {
                            config.default[tid] = tidGroups[tid][0].tname;
                        }
                    });
                }

                modal.remove();
                resolve(config);
            };

            document.getElementById('cancelClassify').onclick = () => {
                modal.remove();
                reject('用户取消操作');
            };
        });
    }

    function showExportUI(videos) {
        const modal = document.createElement('div');
        modal.className = 'bili-classifier-container bili-classifier-modal';

        const partitions = new Map();
        videos.forEach(video => {
            const key = `${video.tid}|${video.tname}`;
            const count = partitions.get(key) || 0;
            partitions.set(key, count + 1);
        });

        const summaryChips = Array.from(partitions.entries()).slice(0, 12).map(([key, count]) => {
            const [, tname] = key.split('|');
            return `<span class="bili-chip">${tname || '未知分区'} × ${count}</span>`;
        }).join('');

        modal.innerHTML = `
            <h3>读取完成 - 数据预览与导出</h3>
            <div class="bili-classifier-message">共读取到 ${videos.length} 个视频。下方表格展示最新的部分数据，可导出全部明细。</div>
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
                                <td>${sanitizeHTML(video.tname || '未知')}</td>
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
        const lines = videos.map(video => {
            return [`标题：${video.title}`, `分区：${video.tname || '未知'}`, `UP主：${video.upName || '未知'}`, `BV号：${video.bvid || video.aid}`].join(' | ');
        });
        return lines.join('\n');
    }

    function buildCSVText(videos) {
        const header = ['标题', '分区', 'UP主', 'BV号'];
        const lines = videos.map(video => [video.title, video.tname || '未知', video.upName || '未知', video.bvid || video.aid].map(escapeCSV).join(','));
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
        const blob = new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function groupVideosByTid(videos) {
        const groups = {};
        videos.forEach(video => {
            const tidKey = video.tid || 'unknown';
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
            const selectedVideos = selectVideosFromTidGroup(tidGroups, group.tids);
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
            for (const [tid, videosOfTid] of Object.entries(tidGroups)) {
                if (handledTids.has(tid)) continue;
                if (!videosOfTid.length) continue;
                const targetFid = await ensureDefaultFolder(tid, userConfig.default[tid] || videosOfTid[0].tname || `分区-${tid}`);
                operations.push({
                    name: userConfig.default[tid] || videosOfTid[0].tname || `分区-${tid}`,
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
                const aids = batch.map(video => video.aid);
                try {
                    await addVideosBatch(aids, operation.fid);
                    if (operation.mode === 'move') {
                        await removeVideosBatch(aids, sourceFid);
                    }
                } catch (error) {
                    log(`批量操作失败：${error.message}，尝试改为单个处理`, 'error');
                    for (const aid of aids) {
                        try {
                            await addToFav(aid, operation.fid);
                            if (operation.mode === 'move') {
                                await removeFromFav(aid, sourceFid);
                            }
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

    async function addVideosBatch(aids, fid) {
        if (!aids.length) return;
        try {
            await batchResourceDeal({ addFid: fid, aids });
        } catch (error) {
            const concurrency = Math.min(state.settings.infoConcurrency, 6);
            await runWithConcurrency(aids, concurrency, async aid => {
                await addToFav(aid, fid);
                await sleep(80);
            });
        }
    }

    async function removeVideosBatch(aids, fid) {
        if (!aids.length) return;
        try {
            await batchResourceDeal({ delFid: fid, aids });
        } catch (error) {
            const concurrency = Math.min(state.settings.infoConcurrency, 6);
            await runWithConcurrency(aids, concurrency, async aid => {
                await removeFromFav(aid, fid);
                await sleep(80);
            });
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

        await new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://api.bilibili.com/x/v3/fav/resource/batch-deal',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                data: params.toString(),
                responseType: 'json',
                onload: function(response) {
                    if (response.status !== 200) {
                        reject(new Error(`批量接口返回状态 ${response.status}`));
                        return;
                    }
                    const res = response.response;
                    if (res?.code === 0) {
                        resolve(res.data);
                    } else {
                        reject(new Error(res?.message || '批量操作失败'));
                    }
                },
                onerror: reject
            });
        });
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
            const { videos } = await getFavVideos(sourceFid, state.settings.fetchPageSize);
            if (!videos.length) throw new Error('未找到任何视频');

            const proceed = await showExportUI(videos);
            if (!proceed) {
                log('用户在导出界面结束流程');
                return;
            }

            const tidGroups = groupVideosByTid(videos);
            const userConfig = await createConfigUI(tidGroups);

            await runClassificationWorkflow({
                tidGroups,
                userConfig,
                sourceFid,
                videos
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