// ==UserScript==
// @name         Bilibili收藏
// @namespace    http://tampermonkey.net/
// @version      2.1
// @author       https://space.bilibili.com/1937042029,https://github.com/jqwgt
// @license      GPL-3.0-or-later
// @match        *://space.bilibili.com/*/favlist*
// @match        *://space.bilibili.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      api.bilibili.com
// @updateURL    https://github.com/jqwgt
// ==/UserScript==

(function() {
    'use strict';

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

    // ===== 通用基础函数 =====

    // 获取CSRF令牌
    function getCsrf() {
        return document.cookie.match(/bili_jct=([^;]+)/)?.[1] || '';
    }

    // 获取当前登录用户mid
    function getLoginMid() {
        return document.cookie.match(/DedeUserID=([^;]+)/)?.[1] || '';
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

    // 获取视频详细信息（单个） - 保留备用，主流程尽量避免逐个调用
    async function getVideoInfo(aid) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://api.bilibili.com/x/web-interface/view?aid=${aid}`,
                responseType: 'json',
                onload: ({response}) => {
                    if (!response?.data) return reject(new Error('no data'));
                    resolve(response.data);
                },
                onerror: reject
            });
        });
    }

    // 并发控制器
    async function runPool(list, worker, limit = 6) {
        const ret = [];
        let i = 0;
        let active = 0;
        return new Promise(resolve => {
            const next = () => {
                if (i === list.length && active === 0) return resolve(ret);
                while (active < limit && i < list.length) {
                    const cur = i++;
                    active++;
                    Promise.resolve(worker(list[cur], cur))
                        .then(r => { ret[cur] = r; })
                        .catch(e => { ret[cur] = {error: e}; })
                        .finally(() => { active--; next(); });
                }
            };
            next();
        });
    }

    // 获取收藏夹中的视频（优化：尝试直接利用返回中的tid，若缺失再批量补齐）
    async function getFavVideos(mediaId, ps = 20) {
        createReadingProgressDiv();
        const videos = [];
        let pn = 1;
        let hasMore = true;
        while (hasMore) {
            // 拉取一页
            /* eslint-disable no-await-in-loop */
            const pageData = await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: `https://api.bilibili.com/x/v3/fav/resource/list?media_id=${mediaId}&pn=${pn}&ps=${ps}&order=mtime&type=0&platform=web`,
                    responseType: 'json',
                    onload: ({response}) => resolve(response?.data || {}),
                    onerror: reject
                });
            });
            const list = pageData.medias || [];
            list.forEach(v => {
                videos.push({
                    aid: v.id,
                    bvid: v.bvid,
                    title: v.title,
                    tid: v.tid || v.ugc?.tid, // 尝试多个路径
                    tname: v.tname || v.ugc?.tname,
                    play: v.cnt_info?.play || 0
                });
            });
            hasMore = !!pageData.has_more;
            pn++;
            updateReadingProgress(`已获取 ${videos.length} 个视频...`);
        }
        // 补齐缺失tid的视频（并发）
        const missing = videos.filter(v => !v.tid);
        if (missing.length) {
            updateReadingProgress(`补齐分区信息，缺失 ${missing.length} 个`);
            await runPool(missing, async v => {
                try {
                    const info = await getVideoInfo(v.aid);
                    v.tid = info.tid;
                    v.tname = info.tname;
                } catch (e) { /* 忽略 */ }
            }, 10);
        }
        document.getElementById('reading-progress')?.remove();
        return videos.filter(v => v.tid); // 过滤掉仍然缺失的
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
    function createReadingProgressDiv() {
        const div = document.createElement('div');
        div.id = 'reading-progress';
        div.className = 'bili-classifier-progress';
        div.innerHTML = `
            <div>正在读取视频...</div>
            <div class="bili-classifier-progress-bar">
                <div class="bili-classifier-progress-fill" style="width: 0%"></div>
            </div>
        `;
        document.body.appendChild(div);
        return div;
    }

    // 更新读取视频进度
    function updateReadingProgress(message) {
        const progressDiv = document.getElementById('reading-progress') || createReadingProgressDiv();
        progressDiv.querySelector('div:first-child').textContent = message;
    }

    // 创建进度显示
    function createProgressDiv() {
        const div = document.createElement('div');
        div.id = 'fav-progress';
        div.className = 'bili-classifier-progress';
        div.innerHTML = `
            <div>正在处理...</div>
            <div class="bili-classifier-progress-bar">
                <div class="bili-classifier-progress-fill" style="width: 0%"></div>
            </div>
            <div>0/0</div>
        `;
        document.body.appendChild(div);
        return div;
    }

    // 更新进度显示
    function updateProgress(message, current, total, skipped = 0) {
        const progressDiv = document.getElementById('fav-progress') || createProgressDiv();
        progressDiv.querySelector('div:first-child').textContent = message;
        progressDiv.querySelector('.bili-classifier-progress-fill').style.width = `${(current/total)*100}%`;
        progressDiv.querySelector('div:last-child').textContent = `${current}/${total}${skipped > 0 ? ` (跳过${skipped}个)` : ''}`;
    }

    // 收藏夹视频分类主流程
    async function processFavClassify() {
        let totalProcessed = 0;
        let totalVideos = 0;
        let skippedVideos = 0;
        const sourceFid = new URL(location.href).searchParams.get('fid');

        try {
            if (!sourceFid) throw new Error('未找到收藏夹ID');

            log('开始获取收藏夹视频...');
            const videos = await getFavVideos(sourceFid);
            if (!videos.length) throw new Error('未找到视频');

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
            log(`收藏夹分类完成！处理了 ${totalProcessed} 个视频，跳过了 ${skippedVideos} 个视频`, 'success');
            alert(`收藏夹分类完成！处理了 ${totalProcessed} 个视频，跳过了 ${skippedVideos} 个视频`);
        } catch (error) {
            log(error.message, 'error');
            alert('操作失败：' + error.message);
        }
    }

    // ===== 关注列表分类（按UP主最常投稿分区 -> 关注标签） =====

    // ===== MD5 & WBI 签名（修复：原实现已损坏导致脚本在此处抛错，后续按钮未添加） =====
    // 轻量 MD5 实现（RFC1321），仅满足当前签名需求
    function md5(str) {
        function toUtf8(s){return unescape(encodeURIComponent(s));}
        function rotateLeft(l,s){return (l<<s)|(l>>>(32-s));}
        function addUnsigned(a,b){const l=(a&0x3FFFFFFF)+(b&0x3FFFFFFF);const m=(a&0x40000000)+(b&0x40000000);const n=(a&0x80000000)+(b&0x80000000);return (n^(m?0x80000000:0)^(l&0x40000000?0x40000000:0))|(l&0x3FFFFFFF);} 
        function F(x,y,z){return (x&y)|((~x)&z);}function G(x,y,z){return (x&z)|(y&(~z));}function H(x,y,z){return x^y^z;}function I(x,y,z){return y^(x|(~z));}
        function FF(a,b,c,d,x,s,ac){a=addUnsigned(a,addUnsigned(addUnsigned(F(b,c,d),x),ac));return addUnsigned(rotateLeft(a,s),b);} 
        function GG(a,b,c,d,x,s,ac){a=addUnsigned(a,addUnsigned(addUnsigned(G(b,c,d),x),ac));return addUnsigned(rotateLeft(a,s),b);} 
        function HH(a,b,c,d,x,s,ac){a=addUnsigned(a,addUnsigned(addUnsigned(H(b,c,d),x),ac));return addUnsigned(rotateLeft(a,s),b);} 
        function II(a,b,c,d,x,s,ac){a=addUnsigned(a,addUnsigned(addUnsigned(I(b,c,d),x),ac));return addUnsigned(rotateLeft(a,s),b);} 
        function convertToWordArray(s){const l=s.length;const n=(l+8>>>6<<4)+14;const a=new Array(n+1).fill(0);for(let i=0;i<l;i++){a[i>>2]|=(s.charCodeAt(i)&0xFF)<<((i%4)*8);}a[l>>2]|=0x80<<((l%4)*8);a[n]=l*8;return a;}
        function wordToHex(l){let s="";for(let i=0;i<=3;i++){s+=("0"+((l>>>(i*8))&255).toString(16)).slice(-2);}return s;}
        str=toUtf8(str);const x=convertToWordArray(str);let a=0x67452301;let b=0xEFCDAB89;let c=0x98BADCFE;let d=0x10325476;
        for(let i=0;i<x.length;i+=16){const oa=a,ob=b,oc=c,od=d;
            a=FF(a,b,c,d,x[i+0],7,0xD76AA478);d=FF(d,a,b,c,x[i+1],12,0xE8C7B756);c=FF(c,d,a,b,x[i+2],17,0x242070DB);b=FF(b,c,d,a,x[i+3],22,0xC1BDCEEE);
            a=FF(a,b,c,d,x[i+4],7,0xF57C0FAF);d=FF(d,a,b,c,x[i+5],12,0x4787C62A);c=FF(c,d,a,b,x[i+6],17,0xA8304613);b=FF(b,c,d,a,x[i+7],22,0xFD469501);
            a=FF(a,b,c,d,x[i+8],7,0x698098D8);d=FF(d,a,b,c,x[i+9],12,0x8B44F7AF);c=FF(c,d,a,b,x[i+10],17,0xFFFF5BB1);b=FF(b,c,d,a,x[i+11],22,0x895CD7BE);
            a=FF(a,b,c,d,x[i+12],7,0x6B901122);d=FF(d,a,b,c,x[i+13],12,0xFD987193);c=FF(c,d,a,b,x[i+14],17,0xA679438E);b=FF(b,c,d,a,x[i+15],22,0x49B40821);
            a=GG(a,b,c,d,x[i+1],5,0xF61E2562);d=GG(d,a,b,c,x[i+6],9,0xC040B340);c=GG(c,d,a,b,x[i+11],14,0x265E5A51);b=GG(b,c,d,a,x[i+0],20,0xE9B6C7AA);
            a=GG(a,b,c,d,x[i+5],5,0xD62F105D);d=GG(d,a,b,c,x[i+10],9,0x02441453);c=GG(c,d,a,b,x[i+15],14,0xD8A1E681);b=GG(b,c,d,a,x[i+4],20,0xE7D3FBC8);
            a=GG(a,b,c,d,x[i+9],5,0x21E1CDE6);d=GG(d,a,b,c,x[i+14],9,0xC33707D6);c=GG(c,d,a,b,x[i+3],14,0xF4D50D87);b=GG(b,c,d,a,x[i+8],20,0x455A14ED);
            a=GG(a,b,c,d,x[i+13],5,0xA9E3E905);d=GG(d,a,b,c,x[i+2],9,0xFCEFA3F8);c=GG(c,d,a,b,x[i+7],14,0x676F02D9);b=GG(b,c,d,a,x[i+12],20,0x8D2A4C8A);
            a=HH(a,b,c,d,x[i+5],4,0xFFFA3942);d=HH(d,a,b,c,x[i+8],11,0x8771F681);c=HH(c,d,a,b,x[i+11],16,0x6D9D6122);b=HH(b,c,d,a,x[i+14],23,0xFDE5380C);
            a=HH(a,b,c,d,x[i+1],4,0xA4BEEA44);d=HH(d,a,b,c,x[i+4],11,0x4BDECFA9);c=HH(c,d,a,b,x[i+7],16,0xF6BB4B60);b=HH(b,c,d,a,x[i+10],23,0xBEBFBC70);
            a=HH(a,b,c,d,x[i+13],4,0x289B7EC6);d=HH(d,a,b,c,x[i+0],11,0xEAA127FA);c=HH(c,d,a,b,x[i+3],16,0xD4EF3085);b=HH(b,c,d,a,x[i+6],23,0x04881D05);
            a=HH(a,b,c,d,x[i+9],4,0xD9D4D039);d=HH(d,a,b,c,x[i+12],11,0xE6DB99E5);c=HH(c,d,a,b,x[i+15],16,0x1FA27CF8);b=HH(b,c,d,a,x[i+2],23,0xC4AC5665);
            a=II(a,b,c,d,x[i+0],6,0xF4292244);d=II(d,a,b,c,x[i+7],10,0x432AFF97);c=II(c,d,a,b,x[i+14],15,0xAB9423A7);b=II(b,c,d,a,x[i+5],21,0xFC93A039);
            a=II(a,b,c,d,x[i+12],6,0x655B59C3);d=II(d,a,b,c,x[i+3],10,0x8F0CCC92);c=II(c,d,a,b,x[i+10],15,0xFFEFF47D);b=II(b,c,d,a,x[i+1],21,0x85845DD1);
            a=II(a,b,c,d,x[i+8],6,0x6FA87E4F);d=II(d,a,b,c,x[i+15],10,0xFE2CE6E0);c=II(c,d,a,b,x[i+6],15,0xA3014314);b=II(b,c,d,a,x[i+13],21,0x4E0811A1);
            a=II(a,b,c,d,x[i+4],6,0xF7537E82);d=II(d,a,b,c,x[i+11],10,0xBD3AF235);c=II(c,d,a,b,x[i+2],15,0x2AD7D2BB);b=II(b,c,d,a,x[i+9],21,0xEB86D391);
            a=addUnsigned(a,oa);b=addUnsigned(b,ob);c=addUnsigned(c,oc);d=addUnsigned(d,od);
        }
        return (wordToHex(a)+wordToHex(b)+wordToHex(c)+wordToHex(d)).toLowerCase();
    }

    // WBI 混合 key 缓存
    let wbiMixinKeyCache = null; // { key, ts }
    async function getWbiMixinKey() {
        if (wbiMixinKeyCache && Date.now() - wbiMixinKeyCache.ts < 30 * 60 * 1000) {
            return wbiMixinKeyCache.key; // 30 分钟内复用
        }
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: 'https://api.bilibili.com/x/web-interface/nav',
                responseType: 'json',
                onload: ({response}) => {
                    try {
                        const img_url = response?.data?.wbi_img?.img_url || '';
                        const sub_url = response?.data?.wbi_img?.sub_url || '';
                        const img_key = img_url.split('/').pop().split('.')[0] || '';
                        const sub_key = sub_url.split('/').pop().split('.')[0] || '';
                        const raw = img_key + sub_key;
                        const order = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,41,57,29,9,42,19,56,7,37,1,4,24,54,26,38,40,28,13,51,22,16,55,12,21,39,0,17,44,30,52,14,33,48,6,34,11,25,20,36];
                        const key = order.map(i => raw[i]).join('').slice(0,32);
                        wbiMixinKeyCache = { key, ts: Date.now() };
                        resolve(key);
                    } catch (e) {
                        reject(new Error('获取 WBI key 失败'));}
                },
                onerror: reject
            });
        });
    }

    function encodeWbi(obj) {
        return Object.keys(obj).sort().map(k => `${k}=${encodeURIComponent(String(obj[k]).replace(/[!'()*]/g,''))}`).join('&');
    }

    async function wbiRequest(url, params={}) {
        const mixin = await getWbiMixinKey();
        const p = {...params, wts: Math.floor(Date.now()/1000)};
        const qs = encodeWbi(p);
        const w_rid = md5(qs + mixin);
        const full = `${url}?${qs}&w_rid=${w_rid}`;
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: full,
                responseType: 'json',
                onload: ({response}) => resolve(response),
                onerror: reject
            });
        });
    }

    // 获取关注列表
    async function getFollowings(limit = 1000) {
// ...existing code...

        const mid = getLoginMid();
        if (!mid) throw new Error('未登录');
        const result = [];
        let pn = 1;
        const ps = 50;
        while (result.length < limit) {
            /* eslint-disable no-await-in-loop */
            const resp = await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: `https://api.bilibili.com/x/relation/followings?vmid=${mid}&pn=${pn}&ps=${ps}&order=desc&order_type=attention`,
                    responseType: 'json',
                    onload: ({response}) => resolve(response?.data || {}),
                    onerror: reject
                });
            });
            (resp.list || []).forEach(u => { if (result.length < limit) result.push({ mid: u.mid, uname: u.uname }); });
            if (!resp.list || resp.list.length < ps) break;
            pn++;
            updateReadingProgress(`已获取关注 ${result.length}`);
        }
        document.getElementById('reading-progress')?.remove();
        return result;
    }

    // 获取UP投稿并统计最常tid
    async function getUploaderTopTid(mid, maxVideos = 90) {
        let pn = 1; const ps = 30; const tidCount = {}; let total = 0;
        while (total < maxVideos) {
            /* eslint-disable no-await-in-loop */
            const resp = await wbiRequest('https://api.bilibili.com/x/space/wbi/arc/search', { mid, pn, ps });
            const list = resp?.data?.list?.vlist || [];
            list.forEach(v => { tidCount[v.tid] = (tidCount[v.tid]||0)+1; total++; });
            if (list.length < ps) break; // 没有更多
            pn++;
        }
        let topTid = null; let max = -1; Object.entries(tidCount).forEach(([tid,count])=>{ if (count>max){max=count; topTid=tid;} });
        return { tid: topTid, count: max, total };
    }

    // 关注标签API
    async function getRelationTags() {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: 'https://api.bilibili.com/x/relation/tags',
                responseType: 'json',
                onload: ({response}) => resolve(response?.data || []),
                onerror: reject
            });
        });
    }
    async function createRelationTag(name) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://api.bilibili.com/x/relation/tag/create',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                data: `tag=${encodeURIComponent(name)}&csrf=${getCsrf()}`,
                responseType: 'json',
                onload: ({response}) => resolve(response?.data?.tagid),
                onerror: reject
            });
        });
    }
    async function addUsersToTag(tagid, fids) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://api.bilibili.com/x/relation/tags/addUsers',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                data: `tagid=${tagid}&fids=${fids.join(',')}&csrf=${getCsrf()}`,
                responseType: 'json',
                onload: ({response}) => resolve(response),
                onerror: reject
            });
        });
    }
    async function delUsersFromTag(tagid, fids) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://api.bilibili.com/x/relation/tags/delUsers',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                data: `tagid=${tagid}&fids=${fids.join(',')}&csrf=${getCsrf()}`,
                responseType: 'json',
                onload: ({response}) => resolve(response),
                onerror: reject
            });
        });
    }

    // 关注列表分类 UI & 处理
    async function processFollowClassify() {
        try {
            createReadingProgressDiv();
            updateReadingProgress('读取关注列表...');
            const follows = await getFollowings();
            if (!follows.length) throw new Error('关注列表为空');
            createProgressDiv();
            updateProgress('统计UP投稿分区...', 0, follows.length);
            const tidGroups = {}; // tid -> mids
            let done = 0; const skipped = [];
            await runPool(follows, async (u) => {
                try {
                    const top = await getUploaderTopTid(u.mid);
                    if (top.tid) {
                        if (!tidGroups[top.tid]) tidGroups[top.tid] = { mids: [], tname: `分区${top.tid}` };
                        tidGroups[top.tid].mids.push(u.mid);
                    } else skipped.push(u.mid);
                } catch (e) { skipped.push(u.mid); }
                done++; if (done % 2 === 0) updateProgress('统计UP投稿分区...', done, follows.length, skipped.length);
            }, 5);

            // 构造临时视频样式数据以复用 createConfigUI (伪造视频数组)
            const fake = {};
            Object.entries(tidGroups).forEach(([tid, obj]) => {
                fake[tid] = [{ tname: obj.tname, tid: parseInt(tid,10) }];
            });
            const userConfig = await createConfigUI(fake); // 选择逻辑一致：产生 folders

            const tags = await getRelationTags();
            const tagMapByName = Object.fromEntries(tags.map(t => [t.name, t.tagid]));
            let processed = 0; const total = Object.values(tidGroups).reduce((a,b)=>a+b.mids.length,0);
            updateProgress('执行关注分组...', 0, total);

            // 自定义组 (multi tid lists) -> 合并 mids
            for (const group of userConfig.custom) {
                let tagName = group.name; let tagId = group.isExisting ? parseInt(group.fid,10) : tagMapByName[tagName];
                if (!tagId) tagId = await createRelationTag(tagName);
                const mids = group.tids.flatMap(tid => (tidGroups[tid]||{mids:[]}).mids);
                // 分批避免过长
                for (let i=0; i<mids.length; i+=20) { /* eslint-disable no-await-in-loop */
                    await addUsersToTag(tagId, mids.slice(i,i+20));
                }
                processed += mids.length; updateProgress(`写入标签 ${tagName}`, processed, total);
            }
            if (userConfig.autoClassifyUnassigned) {
                for (const [tid, defName] of Object.entries(userConfig.default)) {
                    if (userConfig.custom.some(g => g.tids.includes(tid))) continue;
                    let tagId = tagMapByName[defName];
                    if (!tagId) tagId = await createRelationTag(defName);
                    const mids = (tidGroups[tid]||{mids:[]}).mids;
                    for (let i=0; i<mids.length; i+=20) { /* eslint-disable no-await-in-loop */
                        await addUsersToTag(tagId, mids.slice(i,i+20));
                    }
                    processed += mids.length; updateProgress(`写入标签 ${defName}`, processed, total);
                }
            }
            document.getElementById('fav-progress')?.remove();
            alert('关注分类完成');
        } catch (e) {
            alert('关注分类失败: '+ e.message);
            log(e.message,'error');
        }
    }

    // 添加触发按钮和链接
    function addButton() {
        const btnContainer = document.createElement('div');
        btnContainer.className = 'bili-classifier-float-btn';

        const btnFav = document.createElement('button');
        btnFav.className = 'bili-classifier-btn';
        btnFav.textContent = '收藏视频按分区分类';
        btnFav.onclick = processFavClassify;

        const btnFollow = document.createElement('button');
        btnFollow.className = 'bili-classifier-btn';
        btnFollow.textContent = '关注UP按投稿分区分类';
        btnFollow.onclick = processFollowClassify;

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

    btnContainer.appendChild(btnFav);
    btnContainer.appendChild(btnFollow);
        btnContainer.appendChild(links);
        document.body.appendChild(btnContainer);
    }

    // 初始化
    addButton();
})();