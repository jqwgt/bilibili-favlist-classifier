// ==UserScript==
// @name         Bilibili 收藏夹与关注列表分类助手
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  B站收藏夹按视频分区自动分类、关注列表按UP主主要投稿分区自动创建分组。
// @author       https://space.bilibili.com/1937042029,https://github.com/jqwgt
// @license      GPL-3.0-or-later
// @match        *://space.bilibili.com/*/favlist*
// @match        *://space.bilibili.com/*/fans/follow*
// @match        *://space.bilibili.com/*/relation/follow*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      api.bilibili.com
// @updateURL    https://github.com/jqwgt
// ==/UserScript==

(function() {
    'use strict';

    // 并发控制工具
    function createLimiter(limit = 8) {
        const queue = [];
        let active = 0;
        const runNext = () => {
            if (active >= limit || queue.length === 0) return;
            const { fn, resolve, reject } = queue.shift();
            active++;
            Promise.resolve().then(fn).then(res => {
                active--; resolve(res); runNext();
            }).catch(err => { active--; reject(err); runNext(); });
        };
        return function limitRun(fn) {
            return new Promise((resolve, reject) => {
                queue.push({ fn, resolve, reject });
                runNext();
            });
        };
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
    async function getUserFavLists() {
        const mid = window.location.pathname.split('/')[1];
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://api.bilibili.com/x/v3/fav/folder/created/list-all?up_mid=${mid}`,
                responseType: 'json',
                onload: function(response) {
                    resolve(response.response.data.list || []);
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

    // 全局停止标志
    let stopFetching = false;

    // 获取收藏夹中的视频
    async function getFavVideos(mediaId, limit = Infinity, ps = 20, pn = 1, videos = []) {
        if (pn === 1) {
            stopFetching = false; // 重置停止标志
            createReadingProgressDiv(true); // 创建带停止按钮的进度条
        }
        if (stopFetching || videos.length >= limit) {
            document.getElementById('reading-progress')?.remove();
            return Promise.resolve(videos);
        }

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://api.bilibili.com/x/v3/fav/resource/list?media_id=${mediaId}&pn=${pn}&ps=${ps}&order=mtime&type=0&platform=web`,
                responseType: 'json',
                onload: async function(response) {
                    const data = response.response.data;
                    log(`收藏夹API返回数据:`, 'info');
                    console.log(data);
    
                    if (!data || !data.medias) {
                        reject('获取视频列表失败');
                        return;
                    }
    
                    let currentCount = videos.length;
                    let processedCount = 0;
                    
                    const videosToProcess = data.medias.slice(0, limit - videos.length);

                    for (let video of videosToProcess) {
                        if (stopFetching) break;
                        try {
                            const videoInfo = await getVideoInfo(video.id);
                            videos.push({
                                aid: video.id,
                                title: video.title,
                                tid: videoInfo.tid,
                                tname: videoInfo.tname,
                                play: videoInfo.stat.view
                            });
                            currentCount++;
                        } catch (err) {
                            log(`跳过视频 ${video.id}: ${err.message}`, 'error');
                        } finally {
                            processedCount++;
                            updateReadingProgress(`正在读取视频，已获取 ${currentCount} 个视频，处理进度 ${processedCount}/${videosToProcess.length}`);
                            await new Promise(r => setTimeout(r, 300));
                        }
                    }
    
                    if (data.has_more && !stopFetching && videos.length < limit) {
                        await getFavVideos(mediaId, limit, ps, pn + 1, videos).then(resolve);
                    } else {
                        document.getElementById('reading-progress')?.remove();
                        resolve(videos);
                    }
                },
                onerror: reject
            });
        });
    }

    // ================== 关注列表相关 API ==================
    // 获取关注列表
    async function getFollowings(mid, limit = Infinity, ps = 50) {
        let pn = 1; 
        let all = []; 
        let hasMore = true;
        stopFetching = false; // 重置
        const progressDiv = createProgressDiv(true); // 创建带停止按钮的进度条

        while (hasMore && !stopFetching && all.length < limit) {
            const url = `https://api.bilibili.com/x/relation/followings?vmid=${mid}&pn=${pn}&ps=${ps}&order=desc&order_type=attention`;
            updateProgress('正在获取关注列表...', all.length, limit === Infinity ? '未知' : limit);
            const page = await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({ 
                    method: 'GET',
                    url,
                    responseType: 'json',
                    onload: r => resolve(r.response?.data || {}),
                    onerror: reject 
                });
            });
            const list = page.list || [];
            all.push(...list);
            hasMore = list.length === ps; 
            pn++;
            if (all.length > limit) {
                all = all.slice(0, limit);
            }
        }
        progressDiv.remove();
        return all;
    }

    // 获取UP主投稿视频（获取最近5个视频用于分析主分区）
    async function getUpVideos(mid, ps = 5) {
        return new Promise((resolve) => {
            const url = `https://api.bilibili.com/x/space/arc/search?mid=${mid}&ps=${ps}&pn=1&order=pubdate`;
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                responseType: 'json',
                onload: function(response) {
                    const data = response.response?.data;
                    if (data && data.list && data.list.vlist) {
                        resolve(data.list.vlist);
                    } else {
                        resolve([]);
                    }
                },
                onerror: () => resolve([])
            });
        });
    }

    // 新增：获取UP主频道列表
    async function getUpChannels(mid) {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://api.bilibili.com/x/space/channel/list?mid=${mid}&guest=false&jsonp=jsonp`,
                responseType: 'json',
                onload: (r) => resolve(r.response?.data?.list || []),
                onerror: () => resolve([])
            });
        });
    }

    // 新增：获取频道内视频
    async function getChannelVideos(mid, cid, ps = 10) { // 获取频道内最多10个视频
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://api.bilibili.com/x/space/channel/video?mid=${mid}&cid=${cid}&pn=1&ps=${ps}&order=0&jsonp=jsonp`,
                responseType: 'json',
                onload: (r) => resolve(r.response?.data?.list?.archives || []),
                onerror: () => resolve([])
            });
        });
    }

    // 新增：获取UP主合集列表
    async function getUpSeriesList(mid) {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://api.bilibili.com/x/series/list?mid=${mid}`,
                responseType: 'json',
                onload: (r) => resolve(r.response?.data?.list || []),
                onerror: () => resolve([])
            });
        });
    }

    // 新增：获取合集内视频
    async function getSeriesVideos(mid, series_id, ps = 10) {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://api.bilibili.com/x/series/archives?mid=${mid}&series_id=${series_id}&pn=1&ps=${ps}`,
                responseType: 'json',
                onload: (r) => resolve(r.response?.data?.archives || []),
                onerror: () => resolve([])
            });
        });
    }


    // 分析UP主主要分区
    function analyzeUpMainCategory(videos) {
        if (!videos || videos.length === 0) return null; // 改为返回null

        const categoryCount = {};
        videos.forEach(video => {
            const tname = video.tname || "未知分区";
            categoryCount[tname] = (categoryCount[tname] || 0) + 1;
        });
        return categoryCount;
    }

    // 新增：增强的UP主分区分析
    async function analyzeUpMainCategoryEnhanced(mid) {
        const allTnames = [];
        const limitRun = createLimiter(4); // 并发限制，避免请求过多

        // 1. 分析最近投稿
        const recentVideos = await getUpVideos(mid, 10); // 增加到10个
        recentVideos.forEach(v => v.tname && allTnames.push(v.tname));

        // 2. 分析频道
        const channels = await getUpChannels(mid);
        const channelPromises = channels.map(channel => limitRun(async () => {
            if (channel.cid) {
                const channelVideos = await getChannelVideos(mid, channel.cid, 10);
                channelVideos.forEach(v => v.tname && allTnames.push(v.tname));
            }
        }));
        await Promise.all(channelPromises);

        // 3. 分析合集
        const seriesList = await getUpSeriesList(mid);
        const seriesPromises = seriesList.map(series => limitRun(async () => {
            if (series.meta.series_id) {
                const seriesVideos = await getSeriesVideos(mid, series.meta.series_id, 10);
                seriesVideos.forEach(v => v.tname && allTnames.push(v.tname));
            }
        }));
        await Promise.all(seriesPromises);

        if (allTnames.length === 0) {
            return "未分类";
        }

        const categoryCount = allTnames.reduce((acc, tname) => {
            acc[tname] = (acc[tname] || 0) + 1;
            return acc;
        }, {});

        let maxCount = 0;
        let mainCategory = "未分类";
        for (const [category, count] of Object.entries(categoryCount)) {
            if (count > maxCount) {
                maxCount = count;
                mainCategory = category;
            }
        }
        return mainCategory;
    }


    // 获取关注分组列表
    async function getFollowTags() {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: 'https://api.bilibili.com/x/relation/tags',
                responseType: 'json',
                onload: r => resolve(r.response?.data || []),
                onerror: reject
            });
        });
    }

    // 创建关注分组
    async function createFollowTag(tagName) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://api.bilibili.com/x/relation/tag/create',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                data: `tag=${encodeURIComponent(tagName)}&csrf=${getCsrf()}`,
                responseType: 'json',
                onload: r => resolve(r.response?.data?.tagid),
                onerror: reject
            });
        });
    }

    // 批量添加用户到分组
    async function addUsersToTag(tagid, mids) {
        if (!mids.length) return;
        const batchSize = 50;
        for (let i = 0; i < mids.length; i += batchSize) {
            const slice = mids.slice(i, i + batchSize);
            await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: 'https://api.bilibili.com/x/relation/tags/addUsers',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    data: `fids=${slice.join('%2C')}&tagids=${tagid}&csrf=${getCsrf()}`,
                    responseType: 'json',
                    onload: () => resolve(),
                    onerror: reject
                });
            });
        }
    }

    // 批量从分组移除用户
    async function delUsersFromTag(tagid, mids) {
        if (!mids.length) return;
        const batchSize = 50;
        for (let i = 0; i < mids.length; i += batchSize) {
            const slice = mids.slice(i, i + batchSize);
            await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: 'https://api.bilibili.com/x/relation/tags/delUsers',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    data: `fids=${slice.join('%2C')}&tagids=${tagid}&csrf=${getCsrf()}`,
                    responseType: 'json',
                    onload: () => resolve(),
                    onerror: reject
                });
            });
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
                    resolve(response.response.data.id);
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
            html += `
                <div class="bili-classifier-group tid-group" data-tid="${tid}">
                    <div class="bili-classifier-group-header">
                        <span>${videos[0].tname} (${videos.length}个视频)</span>
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
                .map(([tid, videos]) => `
                    <label class="bili-classifier-checkbox-label">
                        <input type="checkbox" class="bili-classifier-checkbox" value="${tid}">
                        ${videos[0].tname} (${videos.length}个视频)
                    </label>
                `).join('');

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
                    const selectedTids = Array.from(group.querySelectorAll('input[type="checkbox"]:checked'))
                        .map(cb => cb.value);

                    if (selectedTids.length > 0 && nameInput.value) {
                        config.custom.push({
                            name: nameInput.value,
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

    // 创建读取视频进度显示
    function createReadingProgressDiv(showStopButton = false) {
        const div = document.createElement('div');
        div.id = 'reading-progress';
        div.className = 'bili-classifier-progress';
        div.innerHTML = `
            <div>正在读取视频...</div>
            <div class="bili-classifier-progress-bar">
                <div class="bili-classifier-progress-fill" style="width: 0%"></div>
            </div>
            ${showStopButton ? '<button id="stop-reading-btn" class="bili-classifier-btn danger" style="margin-top:10px; padding: 5px 10px; font-size: 12px;">停止读取</button>' : ''}
        `;
        document.body.appendChild(div);
        if (showStopButton) {
            document.getElementById('stop-reading-btn').onclick = () => {
                stopFetching = true;
                log('用户请求停止读取...', 'info');
                document.getElementById('stop-reading-btn').disabled = true;
                document.getElementById('stop-reading-btn').textContent = '正在停止...';
            };
        }
        return div;
    }

    // 更新读取视频进度
    function updateReadingProgress(message) {
        const progressDiv = document.getElementById('reading-progress') || createReadingProgressDiv();
        progressDiv.querySelector('div:first-child').textContent = message;
    }

    // 创建进度显示
    function createProgressDiv(showStopButton = false) {
        const div = document.createElement('div');
        div.id = 'fav-progress';
        div.className = 'bili-classifier-progress';
        div.innerHTML = `
            <div>正在处理...</div>
            <div class="bili-classifier-progress-bar">
                <div class="bili-classifier-progress-fill" style="width: 0%"></div>
            </div>
            <div>0/0</div>
            ${showStopButton ? '<button id="stop-processing-btn" class="bili-classifier-btn danger" style="margin-top:10px; padding: 5px 10px; font-size: 12px;">停止</button>' : ''}
        `;
        document.body.appendChild(div);
        if (showStopButton) {
            document.getElementById('stop-processing-btn').onclick = () => {
                stopFetching = true;
                log('用户请求停止处理...', 'info');
                document.getElementById('stop-processing-btn').disabled = true;
                document.getElementById('stop-processing-btn').textContent = '正在停止...';
            };
        }
        return div;
    }

    // 更新进度显示
    function updateProgress(message, current, total, skipped = 0) {
        const progressDiv = document.getElementById('fav-progress') || createProgressDiv();
        progressDiv.querySelector('div:first-child').textContent = message;
        progressDiv.querySelector('.bili-classifier-progress-fill').style.width = `${(current/total)*100}%`;
        progressDiv.querySelector('div:last-child').textContent = `${current}/${total}${skipped > 0 ? ` (跳过${skipped}个)` : ''}`;
    }

    // 主处理流程
    async function processClassify() {
        let totalProcessed = 0;
        let totalVideos = 0;
        let skippedVideos = 0;
        const sourceFid = new URL(location.href).searchParams.get('fid');
    
        try {
            if (!sourceFid) throw new Error('未找到收藏夹ID');
    
            const limitStr = prompt("请输入要处理的视频数量（从收藏夹开头计算，留空或输入0则处理全部）", "0");
            const limit = parseInt(limitStr, 10);
            const videoLimit = limit > 0 ? limit : Infinity;

            log('开始获取收藏夹视频...');
            const videos = await getFavVideos(sourceFid, videoLimit);
            if (!videos.length) throw new Error('未找到视频或用户提前中止');
    
            // 按分区分组视频
            const tidGroups = {};
            videos.forEach(video => {
                if (!tidGroups[video.tid]) {
                    tidGroups[video.tid] = [];
                }
                tidGroups[video.tid].push(video);
            });

            totalVideos = videos.length;

            // 获取用户配置
            const userConfig = await createConfigUI(tidGroups);

            // 处理自定义分组
            for (const group of userConfig.custom) {
                let targetFid;
                if (group.isExisting) {
                    targetFid = group.fid;
                } else {
                    // 检查收藏夹名称是否存在
                    const existingFolders = await getUserFavLists();
                    let folderName = group.name;
                    let counter = 1;

                    while (existingFolders.some(f => f.title === folderName)) {
                        folderName = `${group.name}_${counter++}`;
                        log(`收藏夹名称"${group.name}"已存在，尝试使用"${folderName}"`, 'info');
                    }

                    targetFid = await createFolder(folderName);
                }

                // 添加选中分区的视频
                for (const tid of group.tids) {
                    for (const video of tidGroups[tid]) {
                        try {
                            await addToFav(video.aid, targetFid);
                            if (userConfig.operationMode === 'move') {
                                await removeFromFav(video.aid, sourceFid);
                            }
                            totalProcessed++;
                        } catch (error) {
                            log(`处理视频 ${video.aid} 失败: ${error.message}，已跳过`, 'error');
                            skippedVideos++;
                        }
                        updateProgress(`正在处理视频到分组"${group.name}"`, totalProcessed, totalVideos, skippedVideos);
                        await new Promise(r => setTimeout(r, 300));
                    }
                }
            }

            // 处理未分组的视频（仅在用户选择自动分类时）
            if (userConfig.autoClassifyUnassigned) {
                for (const [tid, folderName] of Object.entries(userConfig.default)) {
                    if (!userConfig.custom.some(g => g.tids.includes(tid))) {
                        // 添加重名检测
                        const existingFolders = await getUserFavLists();
                        let folderNameToUse = folderName;
                        let counter = 1;
                        while (existingFolders.some(f => f.title === folderNameToUse)) {
                            folderNameToUse = `${folderName}_${counter++}`;
                            log(`收藏夹名称"${folderName}"已存在，尝试使用"${folderNameToUse}"`, 'info');
                        }
                        const targetFid = await createFolder(folderNameToUse);
                        for (const video of tidGroups[tid]) {
                            await addToFav(video.aid, targetFid);
                            if (userConfig.operationMode === 'move') {
                                await removeFromFav(video.aid, sourceFid);
                            }
                            totalProcessed++;
                            updateProgress(`正在处理视频到"${folderNameToUse}"`, totalProcessed, totalVideos);
                            await new Promise(r => setTimeout(r, 300));
                        }
                    }
                }
            }

            document.getElementById('fav-progress')?.remove();
            log(`分类完成！处理了 ${totalProcessed} 个视频，跳过了 ${skippedVideos} 个视频`, 'success');
            alert(`分类完成！处理了 ${totalProcessed} 个视频，跳过了 ${skippedVideos} 个视频`);
        } catch (error) {
            log(error.message, 'error');
            alert('操作失败：' + error.message);
        }
    }

    // ================== 关注列表分类 UI 和主流程 ==================

    // 创建关注列表分类配置界面
    function createFollowConfigUI(upGroups) {
        const modal = document.createElement('div');
        modal.className = 'bili-classifier-container bili-classifier-modal';

        let html = `
            <h3>关注列表自动分类</h3>
            <p>将根据UP主最近5个视频投稿分析其主要分区，并创建或更新对应的关注分组。</p>

            <div class="bili-classifier-radio-group">
                <label class="bili-classifier-radio-label">
                    <input type="radio" name="followOperationMode" value="copy" checked> 复制模式 (将UP加入新分组，不改变原有分组)
                </label>
                <label class="bili-classifier-radio-label">
                    <input type="radio" name="followOperationMode" value="move"> 移动模式 (将UP从“未分组”移动到新分组)
                </label>
            </div>

            <div id="followGroups">
                <h4>将创建/更新以下分组：</h4>
        `;

        Object.entries(upGroups).forEach(([category, ups]) => {
            if (category === "未分类" || category === "未知分区") return; // 不为“未分类”创建分组
            html += `
                <div class="bili-classifier-group follow-group" data-category="${category}">
                    <div class="bili-classifier-group-header">
                        <label class="bili-classifier-checkbox-label">
                            <input type="checkbox" class="bili-classifier-checkbox" value="${category}" checked>
                            <strong>${category}</strong> (${ups.length}人)
                        </label>
                    </div>
                    <div class="bili-classifier-up-list" style="font-size: 12px; color: #666; margin-top: 5px;">
                        ${ups.slice(0, 10).map(up => up.uname).join('、')}${ups.length > 10 ? '...' : ''}
                    </div>
                </div>
            `;
        });

        html += `
            </div>
            <div class="bili-classifier-footer">
                <button class="bili-classifier-btn secondary" id="cancelFollowClassify">取消</button>
                <button class="bili-classifier-btn" id="startFollowClassify">开始分类</button>
            </div>
        `;

        modal.innerHTML = html;
        document.body.appendChild(modal);

        return new Promise((resolve, reject) => {
            document.getElementById('startFollowClassify').onclick = () => {
                const selectedCategories = Array.from(modal.querySelectorAll('.follow-group input[type="checkbox"]:checked'))
                    .map(cb => cb.value);

                const operationMode = modal.querySelector('input[name="followOperationMode"]:checked').value;

                modal.remove();
                resolve({ selectedCategories, operationMode });
            };

            document.getElementById('cancelFollowClassify').onclick = () => {
                modal.remove();
                reject('用户取消操作');
            };
        });
    }

    // 关注列表分类主流程
    async function processFollowClassify() {
        const mid = window.location.pathname.split('/')[1];
        if (!mid) {
            alert('无法获取用户MID');
            return;
        }

        try {
            const limitStr = prompt("请输入要处理的关注UP数量（从列表开头计算，留空或输入0则处理全部）", "0");
            const limit = parseInt(limitStr, 10);
            const followLimit = limit > 0 ? limit : Infinity;

            const followings = await getFollowings(mid, followLimit);
            if (!followings.length) {
                log('未获取到关注列表或用户提前中止', 'info');
                return;
            }
            log(`获取到 ${followings.length} 个关注`);

            const upGroups = {};
            const limitRun = createLimiter(8); // 8个并发
            let processedCount = 0;
            const progressDiv = createProgressDiv();

            await Promise.all(followings.map(up => limitRun(async () => {
                try {
                    const mainCategory = await analyzeUpMainCategoryEnhanced(up.mid);
                    if (!upGroups[mainCategory]) {
                        upGroups[mainCategory] = [];
                    }
                    upGroups[mainCategory].push(up);
                    log(`UP: ${up.uname} -> 主要分区: ${mainCategory}`);
                } catch (e) {
                    log(`处理UP ${up.uname} (mid: ${up.mid}) 失败: ${e.message}`, 'error');
                } finally {
                    processedCount++;
                    updateProgress(`正在分析UP主分区...`, processedCount, followings.length);
                }
            })));
            
            progressDiv.remove(); // 分析完成，移除进度条

            const hasValidCategories = Object.keys(upGroups).some(cat => cat !== "未分类" && cat !== "未知分区");
            if (!hasValidCategories) {
                alert('未能分析出任何可用的UP主分区。可能是由于API限制或UP主没有近期投稿。');
                log('未能分析出任何可用的UP主分区，操作中止。', 'info');
                return;
            }

            const { selectedCategories, operationMode } = await createFollowConfigUI(upGroups);
            if (!selectedCategories || selectedCategories.length === 0) {
                log('没有选择任何分组，操作中止。');
                return;
            }

            const actionProgress = createProgressDiv();
            let totalActions = 0;
            selectedCategories.forEach(cat => totalActions += upGroups[cat].length);
            let currentAction = 0;

            log('开始执行分组操作...');
            const existingTags = await getFollowTags();
            const defaultTag = existingTags.find(t => t.name === '未分组');

            for (const category of selectedCategories) {
                const upsToMove = upGroups[category];
                if (!upsToMove || upsToMove.length === 0) continue;

                let tag = existingTags.find(t => t.name === category);
                let tagId;

                if (tag) {
                    tagId = tag.tagid;
                    log(`分组 "${category}" 已存在 (ID: ${tagId})`);
                } else {
                    log(`正在创建新分组: "${category}"`);
                    tagId = await createFollowTag(category);
                    if (!tagId) {
                        log(`创建分组 "${category}" 失败，跳过此分组`, 'error');
                        continue;
                    }
                    log(`分组 "${category}" 创建成功 (ID: ${tagId})`);
                }

                const midsToAdd = upsToMove.map(up => up.mid);

                // 移动模式：从“未分组”中移除
                if (operationMode === 'move' && defaultTag) {
                    log(`正在从“未分组”中移除 ${midsToAdd.length} 个UP主...`);
                    await delUsersFromTag(defaultTag.tagid, midsToAdd);
                }

                log(`正在将 ${midsToAdd.length} 个UP主添加到分组 "${category}"...`);
                await addUsersToTag(tagId, midsToAdd);

                currentAction += midsToAdd.length;
                updateProgress(`正在分组: ${category}`, currentAction, totalActions);
            }

            actionProgress.remove();
            alert('关注列表分类完成！');
            log('关注列表分类完成！', 'success');
            window.location.reload();

        } catch (error) {
            document.getElementById('fav-progress')?.remove();
            log(error.message, 'error');
            if (error !== '用户取消操作') {
                alert('操作失败：' + error.message);
            }
        }
    }

    // 添加触发按钮和链接
    function addButton() {
        const btnContainer = document.createElement('div');
        btnContainer.className = 'bili-classifier-float-btn';

        const btn = document.createElement('button');
        btn.className = 'bili-classifier-btn';

        // 根据页面路径决定按钮功能
        if (window.location.pathname.includes('/favlist')) {
            btn.textContent = '按视频分区分类';
            btn.onclick = processClassify;
        } else if (window.location.pathname.includes('/fans/follow') || window.location.pathname.includes('/relation/follow')) {
            btn.textContent = '关注按分区分类';
            btn.onclick = processFollowClassify;
        } else {
            return; // 不在目标页面则不显示按钮
        }

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
